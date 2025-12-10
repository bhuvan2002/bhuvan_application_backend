import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
// Trades
app.get('/api/trades', async (req, res) => {
    try {
        const trades = await prisma.trade.findMany({ orderBy: { date: 'desc' } });
        res.json(trades);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trades' });
    }
});

app.post('/api/trades', async (req, res) => {
    try {
        const trade = await prisma.trade.create({ data: req.body });
        res.json(trade);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create trade: ' + error });
    }
});

app.delete('/api/trades/:id', async (req, res) => {
    try {
        await prisma.trade.delete({ where: { id: req.params.id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete trade' });
    }
});

// Accounts
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await prisma.account.findMany();
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

app.post('/api/accounts', async (req, res) => {
    try {
        const account = await prisma.account.create({ data: req.body });
        res.json(account);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// Expenses
app.get('/api/expenses', async (req, res) => {
    try {
        const expenses = await prisma.expense.findMany({ orderBy: { date: 'desc' } });
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const { accountId, amount, ...rest } = req.body;

        // Transaction to create expense and update account balance
        const [expense] = await prisma.$transaction([
            prisma.expense.create({ data: { accountId, amount, ...rest } }),
            prisma.account.update({
                where: { id: accountId },
                data: { balance: { decrement: amount } }
            })
        ]);

        res.json(expense);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create expense' });
    }
});

// Todos
app.get('/api/todos', async (req, res) => {
    try {
        const todos = await prisma.todo.findMany({ orderBy: { dueDate: 'asc' } });
        res.json(todos);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
});

app.post('/api/todos', async (req, res) => {
    try {
        const todo = await prisma.todo.create({ data: req.body });
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create todo' });
    }
});

app.patch('/api/todos/:id', async (req, res) => {
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

app.delete('/api/todos/:id', async (req, res) => {
    try {
        await prisma.todo.delete({ where: { id: req.params.id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
