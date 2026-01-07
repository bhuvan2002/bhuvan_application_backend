import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
        const account = await prisma.account.create({ data: req.body });
        res.json(account);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create account' });
    }
});

app.put('/api/accounts/:id', authenticateToken, async (req, res) => {
    try {
        const account = await prisma.account.update({
            where: { id: req.params.id },
            data: req.body
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
        let { accountId, amount, type, date, ...rest } = req.body;

        // Ensure date is legitimate ISO-8601 string for Prisma
        if (date && typeof date === 'string' && !date.includes('T')) {
            date = new Date(date).toISOString();
        }

        const numAmount = Number(amount);

        // Transaction to create expense and update account balance
        const [expense] = await prisma.$transaction([
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
                    balance: type === 'CREDIT'
                        ? { increment: numAmount }
                        : { decrement: numAmount }
                }
            })
        ]);

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

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
