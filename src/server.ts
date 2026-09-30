import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateFinancialInsights } from './services/ai/financeInsightService';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

app.use(cors());
app.use(express.json());

// Middleware to authenticate token
const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { username, password: hashedPassword, role: role || 'TRADER' }
        });
        res.json({ message: 'User created successfully' });
    } catch (error: any) {
        console.error('Registration error details:', {
            message: error.message,
            code: error.code,
            meta: error.meta,
            stack: error.stack
        });
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Username already taken' });
        }
        res.status(500).json({
            error: 'User creation failed',
            details: error.message,
            code: error.code
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, role: user.role, username: user.username });
    } catch (error: any) {
        console.error('Login error details:', {
            message: error.message,
            code: error.code,
            meta: error.meta,
            stack: error.stack
        });
        res.status(500).json({
            error: 'Login failed',
            details: error.message,
            code: error.code
        });
    }
});

// Health check endpoint to verify DB connection
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'connected' });
    } catch (error: any) {
        console.error('Health check failed:', error);
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            details: error.message,
            code: error.code
        });
    }
});

// Protected App Routes

// Trades
app.get('/api/trades', authenticateToken, async (req, res) => {
    try {
        const trades = await prisma.trade.findMany({ orderBy: { date: 'desc' } });
        res.json(trades);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trades' });
    }
});

app.post('/api/trades', authenticateToken, async (req, res) => {
    try {
        const trade = await prisma.trade.create({ data: req.body });
        res.json(trade);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create trade: ' + error });
    }
});

app.delete('/api/trades/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.trade.delete({ where: { id: req.params.id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete trade' });
    }
});

// Accounts
app.get('/api/accounts', authenticateToken, async (req, res) => {
    try {
        const accounts = await prisma.account.findMany();
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

app.post('/api/accounts', authenticateToken, async (req, res) => {
    try {
        let data = { ...req.body };
        if (data.loanEndDate) data.loanEndDate = new Date(data.loanEndDate).toISOString();
        if (data.dueDate) data.dueDate = Number(data.dueDate);
        if (data.creditLimit) data.creditLimit = Number(data.creditLimit);
        if (data.balance) data.balance = Number(data.balance);

        const account = await prisma.account.create({ data });
        res.json(account);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create account' });
    }
});

app.put('/api/accounts/:id', authenticateToken, async (req, res) => {
    try {
        let data = { ...req.body };
        if (data.loanEndDate) data.loanEndDate = new Date(data.loanEndDate).toISOString();
        if (data.dueDate) data.dueDate = Number(data.dueDate);
        if (data.creditLimit) data.creditLimit = Number(data.creditLimit);
        if (data.balance !== undefined) data.balance = Number(data.balance);

        const account = await prisma.account.update({
            where: { id: req.params.id },
            data
        });
        res.json(account);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update account' });
    }
});

app.delete('/api/accounts/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.account.delete({ where: { id: req.params.id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// Expenses
app.get('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const expenses = await prisma.expense.findMany({ orderBy: { date: 'desc' } });
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
    try {
        console.log('Received expense data:', req.body);
        let { accountId, toAccountId, amount, type, date, ...rest } = req.body;

        // Ensure date is legitimate ISO-8601 string for Prisma
        if (date && typeof date === 'string' && !date.includes('T')) {
            date = new Date(date).toISOString();
        }

        const numAmount = Number(amount);

        const account = await prisma.account.findUnique({ where: { id: accountId } });
        if (!account) return res.status(404).json({ error: 'Account not found' });

        const isDebtAccount = account.type === 'CREDIT_CARD' || account.type === 'LOAN';

        let operations = [];

        if (type === 'TRANSFER' && toAccountId) {
            const toAccount = await prisma.account.findUnique({ where: { id: toAccountId } });
            if (!toAccount) return res.status(404).json({ error: 'To Account not found' });

            const isToDebtAccount = toAccount.type === 'CREDIT_CARD' || toAccount.type === 'LOAN';

            const fromOperation = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
            const toOperation = isToDebtAccount ? { decrement: numAmount } : { increment: numAmount };

            operations.push(
                prisma.expense.create({
                    data: {
                        accountId,
                        toAccountId,
                        amount: numAmount,
                        type: 'TRANSFER',
                        date,
                        ...rest
                    }
                }),
                prisma.account.update({
                    where: { id: accountId },
                    data: { balance: fromOperation }
                }),
                prisma.account.update({
                    where: { id: toAccountId },
                    data: { balance: toOperation }
                })
            );
        } else {
            const incrementOp = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
            const decrementOp = isDebtAccount ? { decrement: numAmount } : { increment: numAmount };

            operations.push(
                prisma.expense.create({
                    data: {
                        accountId,
                        amount: numAmount,
                        type: type || 'DEBIT',
                        date,
                        ...rest
                    }
                }),
                prisma.account.update({
                    where: { id: accountId },
                    data: {
                        balance: type === 'CREDIT' ? decrementOp : incrementOp
                    }
                })
            );
        }

        const results = await prisma.$transaction(operations);
        const expense = results[0];

        res.json(expense);
    } catch (error: any) {
        console.error('Error creating expense:', error);
        res.status(500).json({
            error: 'Failed to create expense',
            details: error.message,
            code: error.code,
            meta: error.meta
        });
    }
});

app.post('/api/expenses/bulk', authenticateToken, async (req, res) => {
    try {
        const { expenses } = req.body;
        if (!Array.isArray(expenses)) return res.status(400).json({ error: 'Expected an array of expenses' });

        let operations: any[] = [];

        for (let data of expenses) {
            let { accountId, toAccountId, amount, type, date, ...rest } = data;

            if (date && typeof date === 'string' && !date.includes('T')) {
                date = new Date(date).toISOString();
            }

            const numAmount = Number(amount);

            const account = await prisma.account.findUnique({ where: { id: accountId } });
            if (!account) continue;
            
            const isDebtAccount = account.type === 'CREDIT_CARD' || account.type === 'LOAN';

            if (type === 'TRANSFER' && toAccountId) {
                const toAccount = await prisma.account.findUnique({ where: { id: toAccountId } });
                if (!toAccount) continue;
                
                const isToDebtAccount = toAccount.type === 'CREDIT_CARD' || toAccount.type === 'LOAN';
                
                const fromOperation = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
                const toOperation = isToDebtAccount ? { decrement: numAmount } : { increment: numAmount };

                operations.push(
                    prisma.expense.create({
                        data: {
                            accountId,
                            toAccountId,
                            amount: numAmount,
                            type: 'TRANSFER',
                            date,
                            ...rest
                        }
                    }),
                    prisma.account.update({
                        where: { id: accountId },
                        data: { balance: fromOperation }
                    }),
                    prisma.account.update({
                        where: { id: toAccountId },
                        data: { balance: toOperation }
                    })
                );
            } else {
                const incrementOp = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
                const decrementOp = isDebtAccount ? { decrement: numAmount } : { increment: numAmount };

                operations.push(
                    prisma.expense.create({
                        data: {
                            accountId,
                            amount: numAmount,
                            type: type || 'DEBIT',
                            date,
                            ...rest
                        }
                    }),
                    prisma.account.update({
                        where: { id: accountId },
                        data: {
                            balance: type === 'CREDIT' ? decrementOp : incrementOp
                        }
                    })
                );
            }
        }

        await prisma.$transaction(operations);
        res.json({ message: 'Bulk expenses added successfully', count: expenses.length });
    } catch (error: any) {
        console.error('Add bulk expenses error:', error);
        res.status(500).json({ error: 'Failed to add bulk expenses', details: error.message });
    }
});

// --- NEW ACCOUNTS API ---

// Bank Accounts
app.get('/api/bank-accounts', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const accounts = await prisma.bankAccount.findMany({ where: { userId }, include: { transactions: { orderBy: { date: 'desc' } } } });
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bank accounts' });
    }
});

app.post('/api/bank-accounts', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const account = await prisma.bankAccount.create({ data: { ...req.body, userId, balance: Number(req.body.balance || 0) } });
        res.json(account);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create bank account' });
    }
});

app.post('/api/bank-accounts/:id/transaction', authenticateToken, async (req: any, res: any) => {
    try {
        const { amount, type, date, category, description } = req.body;
        const numAmount = Number(amount);
        const isoDate = date && !date.includes('T') ? new Date(date).toISOString() : date;
        const accountId = req.params.id;

        const incrementOp = type === 'CREDIT' ? { increment: numAmount } : { decrement: numAmount };

        const result = await prisma.$transaction([
            prisma.bankTransaction.create({
                data: { bankAccountId: accountId, amount: numAmount, type, date: isoDate, category, description }
            }),
            prisma.bankAccount.update({
                where: { id: accountId },
                data: { balance: incrementOp }
            })
        ]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add transaction' });
    }
});

// Credit Cards
app.get('/api/credit-cards', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const cards = await prisma.creditCard.findMany({ where: { userId }, include: { expenses: { orderBy: { date: 'desc' } } } });
        res.json(cards);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch credit cards' });
    }
});

app.post('/api/credit-cards', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const card = await prisma.creditCard.create({ data: { ...req.body, userId, creditLimit: Number(req.body.creditLimit || 0) } });
        res.json(card);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create credit card' });
    }
});

app.post('/api/credit-cards/:id/expense', authenticateToken, async (req: any, res: any) => {
    try {
        const { amount, date, category, description } = req.body;
        const numAmount = Number(amount);
        const isoDate = date && !date.includes('T') ? new Date(date).toISOString() : date;
        const cardId = req.params.id;

        const result = await prisma.$transaction([
            prisma.creditCardExpense.create({
                data: { creditCardId: cardId, amount: numAmount, date: isoDate, category, description }
            }),
            prisma.creditCard.update({
                where: { id: cardId },
                data: { outstanding: { increment: numAmount } }
            })
        ]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add credit card expense' });
    }
});

app.post('/api/credit-cards/:id/pay-bill', authenticateToken, async (req: any, res: any) => {
    try {
        const { amount, date, bankAccountId } = req.body;
        const numAmount = Number(amount);
        const isoDate = date && !date.includes('T') ? new Date(date).toISOString() : date;
        const cardId = req.params.id;

        const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
        if (!card) return res.status(404).json({ error: 'Card not found' });

        const result = await prisma.$transaction([
            prisma.bankTransaction.create({
                data: { 
                    bankAccountId, 
                    amount: numAmount, 
                    type: 'DEBIT', 
                    date: isoDate, 
                    category: 'Credit Card Bill', 
                    description: `Payment for ${card.cardName}`,
                    // Generating a pseudo-id for uniqueness if needed, but not required as we don't strictly link back to CC payment table in the proposed schema.
                    // Oh wait, I added `creditCardPaymentId` in BankTransaction. We can just store a new uuid there.
                    creditCardPaymentId: req.params.id + '-' + Date.now() 
                }
            }),
            prisma.bankAccount.update({
                where: { id: bankAccountId },
                data: { balance: { decrement: numAmount } }
            }),
            prisma.creditCard.update({
                where: { id: cardId },
                data: { outstanding: { decrement: numAmount } }
            })
        ]);
        res.json(result[2]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to pay credit card bill' });
    }
});

// Loans
app.get('/api/loans', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const loans = await prisma.loan.findMany({ where: { userId }, include: { emis: { orderBy: { emiNumber: 'asc' } } } });
        res.json(loans);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch loans' });
    }
});

app.post('/api/loans', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { loanName, provider, totalAmount, emiAmount, startDate, tenureMonths } = req.body;
        
        const isoDate = startDate && !startDate.includes('T') ? new Date(startDate).toISOString() : startDate;
        
        const loan = await prisma.loan.create({ 
            data: { 
                userId, loanName, provider, 
                totalAmount: Number(totalAmount), 
                emiAmount: Number(emiAmount), 
                startDate: isoDate, 
                tenureMonths: Number(tenureMonths)
            } 
        });

        // Auto-generate EMIs
        let emis = [];
        let currentMonth = new Date(isoDate);
        for(let i=1; i<=Number(tenureMonths); i++) {
            currentMonth.setMonth(currentMonth.getMonth() + 1);
            emis.push({
                loanId: loan.id,
                emiNumber: i,
                dueDate: new Date(currentMonth.toISOString()),
                amount: Number(emiAmount),
                status: 'UPCOMING'
            });
        }
        await prisma.loanEMI.createMany({ data: emis });
        
        res.json(loan);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create loan' });
    }
});

app.post('/api/loans/emi/:emiId/pay', authenticateToken, async (req: any, res: any) => {
    try {
        const { bankAccountId, paymentDate } = req.body;
        const emiId = req.params.emiId;
        const isoDate = paymentDate && !paymentDate.includes('T') ? new Date(paymentDate).toISOString() : paymentDate;

        const emi = await prisma.loanEMI.findUnique({ where: { id: emiId }, include: { loan: true } });
        if (!emi || emi.status === 'PAID') return res.status(400).json({ error: 'EMI not found or already paid' });

        const result = await prisma.$transaction([
            prisma.bankTransaction.create({
                data: { 
                    bankAccountId, 
                    amount: emi.amount, 
                    type: 'DEBIT', 
                    date: isoDate || new Date().toISOString(), 
                    category: 'Loan EMI', 
                    description: `EMI Payment for ${emi.loan.loanName}`,
                    loanEmiPaymentId: emi.id
                }
            }),
            prisma.bankAccount.update({
                where: { id: bankAccountId },
                data: { balance: { decrement: emi.amount } }
            }),
            prisma.loanEMI.update({
                where: { id: emiId },
                data: { status: 'PAID', paymentDate: isoDate || new Date().toISOString(), bankAccountId }
            })
        ]);
        res.json(result[2]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to pay EMI' });
    }
});

// --- END NEW ACCOUNTS API ---

// AI Insights
app.post('/api/ai/analyze-finance', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(400).json({ success: false, error: 'User ID is missing from token' });
        }
        
        const data = await generateFinancialInsights(userId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error('AI Analysis error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate AI insights', details: error.message });
    }
});

// Todos
app.get('/api/todos', authenticateToken, async (req, res) => {
    try {
        const todos = await prisma.todo.findMany({ orderBy: { dueDate: 'asc' } });
        res.json(todos);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
});

app.post('/api/todos', authenticateToken, async (req, res) => {
    try {
        console.log('Received todo data:', req.body);
        let { dueDate, ...rest } = req.body;

        // Ensure dueDate is legitimate ISO-8601 string for Prisma
        if (dueDate && typeof dueDate === 'string' && !dueDate.includes('T')) {
            dueDate = new Date(dueDate).toISOString();
        }

        const todo = await prisma.todo.create({
            data: { ...rest, dueDate }
        });
        res.json(todo);
    } catch (error) {
        console.error('Error creating todo:', error);
        res.status(500).json({ error: 'Failed to create todo', details: error instanceof Error ? error.message : String(error) });
    }
});

app.patch('/api/todos/:id', authenticateToken, async (req, res) => {
    try {
        const todo = await prisma.todo.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

app.delete('/api/todos/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.todo.delete({ where: { id: req.params.id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

// Plans
app.get('/api/plans', authenticateToken, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date query parameter is required' });
        }
        const plans = await prisma.plan.findMany({
            where: { date: String(date) },
            orderBy: { startTime: 'asc' }
        });
        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

app.post('/api/plans', authenticateToken, async (req, res) => {
    try {
        const plan = await prisma.plan.create({ data: req.body });
        res.json(plan);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create plan' });
    }
});

app.put('/api/plans/:id', authenticateToken, async (req, res) => {
    try {
        const plan = await prisma.plan.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(plan);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

app.delete('/api/plans/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.plan.delete({ where: { id: req.params.id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete plan' });
    }
});

// Notes
app.get('/api/notes', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const notes = await prisma.note.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

app.post('/api/notes', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const note = await prisma.note.create({ 
            data: { ...req.body, userId } 
        });
        res.json(note);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create note' });
    }
});

app.put('/api/notes/:id', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const note = await prisma.note.updateMany({
            where: { id: req.params.id, userId },
            data: req.body
        });
        // fetch the updated note
        const updated = await prisma.note.findUnique({ where: { id: req.params.id } });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update note' });
    }
});

app.delete('/api/notes/:id', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        await prisma.note.deleteMany({ where: { id: req.params.id, userId } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
