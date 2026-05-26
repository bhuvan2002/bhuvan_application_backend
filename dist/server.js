"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const financeInsightService_1 = require("./services/ai/financeInsightService");
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const port = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.sendStatus(401);
    jsonwebtoken_1.default.verify(token, SECRET_KEY, (err, user) => {
        if (err)
            return res.sendStatus(403);
        req.user = user;
        next();
    });
};
// Auth Routes
app.post('/api/auth/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, password, role } = req.body;
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma.user.create({
            data: { username, password: hashedPassword, role: role || 'TRADER' }
        });
        res.json({ message: 'User created successfully' });
    }
    catch (error) {
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
}));
app.post('/api/auth/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, password } = req.body;
        const user = yield prisma.user.findUnique({ where: { username } });
        if (!user || !(yield bcryptjs_1.default.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, role: user.role, username: user.username });
    }
    catch (error) {
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
}));
// Health check endpoint to verify DB connection
app.get('/api/health', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma.$queryRaw `SELECT 1`;
        res.json({ status: 'ok', database: 'connected' });
    }
    catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            details: error.message,
            code: error.code
        });
    }
}));
// Protected App Routes
// Trades
app.get('/api/trades', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const trades = yield prisma.trade.findMany({ orderBy: { date: 'desc' } });
        res.json(trades);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch trades' });
    }
}));
app.post('/api/trades', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const trade = yield prisma.trade.create({ data: req.body });
        res.json(trade);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create trade: ' + error });
    }
}));
app.delete('/api/trades/:id', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma.trade.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete trade' });
    }
}));
// Accounts
app.get('/api/accounts', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const accounts = yield prisma.account.findMany();
        res.json(accounts);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
}));
app.post('/api/accounts', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let data = Object.assign({}, req.body);
        if (data.loanEndDate)
            data.loanEndDate = new Date(data.loanEndDate).toISOString();
        if (data.dueDate)
            data.dueDate = Number(data.dueDate);
        if (data.creditLimit)
            data.creditLimit = Number(data.creditLimit);
        if (data.balance)
            data.balance = Number(data.balance);
        const account = yield prisma.account.create({ data });
        res.json(account);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create account' });
    }
}));
app.put('/api/accounts/:id', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let data = Object.assign({}, req.body);
        if (data.loanEndDate)
            data.loanEndDate = new Date(data.loanEndDate).toISOString();
        if (data.dueDate)
            data.dueDate = Number(data.dueDate);
        if (data.creditLimit)
            data.creditLimit = Number(data.creditLimit);
        if (data.balance !== undefined)
            data.balance = Number(data.balance);
        const account = yield prisma.account.update({
            where: { id: req.params.id },
            data
        });
        res.json(account);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update account' });
    }
}));
app.delete('/api/accounts/:id', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma.account.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete account' });
    }
}));
// Expenses
app.get('/api/expenses', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const expenses = yield prisma.expense.findMany({ orderBy: { date: 'desc' } });
        res.json(expenses);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
}));
app.post('/api/expenses', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Received expense data:', req.body);
        let _a = req.body, { accountId, toAccountId, amount, type, date } = _a, rest = __rest(_a, ["accountId", "toAccountId", "amount", "type", "date"]);
        // Ensure date is legitimate ISO-8601 string for Prisma
        if (date && typeof date === 'string' && !date.includes('T')) {
            date = new Date(date).toISOString();
        }
        const numAmount = Number(amount);
        const account = yield prisma.account.findUnique({ where: { id: accountId } });
        if (!account)
            return res.status(404).json({ error: 'Account not found' });
        const isDebtAccount = account.type === 'CREDIT_CARD' || account.type === 'LOAN';
        let operations = [];
        if (type === 'TRANSFER' && toAccountId) {
            const toAccount = yield prisma.account.findUnique({ where: { id: toAccountId } });
            if (!toAccount)
                return res.status(404).json({ error: 'To Account not found' });
            const isToDebtAccount = toAccount.type === 'CREDIT_CARD' || toAccount.type === 'LOAN';
            const fromOperation = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
            const toOperation = isToDebtAccount ? { decrement: numAmount } : { increment: numAmount };
            operations.push(prisma.expense.create({
                data: Object.assign({ accountId,
                    toAccountId, amount: numAmount, type: 'TRANSFER', date }, rest)
            }), prisma.account.update({
                where: { id: accountId },
                data: { balance: fromOperation }
            }), prisma.account.update({
                where: { id: toAccountId },
                data: { balance: toOperation }
            }));
        }
        else {
            const incrementOp = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
            const decrementOp = isDebtAccount ? { decrement: numAmount } : { increment: numAmount };
            operations.push(prisma.expense.create({
                data: Object.assign({ accountId, amount: numAmount, type: type || 'DEBIT', date }, rest)
            }), prisma.account.update({
                where: { id: accountId },
                data: {
                    balance: type === 'CREDIT' ? decrementOp : incrementOp
                }
            }));
        }
        const results = yield prisma.$transaction(operations);
        const expense = results[0];
        res.json(expense);
    }
    catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({
            error: 'Failed to create expense',
            details: error.message,
            code: error.code,
            meta: error.meta
        });
    }
}));
app.post('/api/expenses/bulk', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { expenses } = req.body;
        if (!Array.isArray(expenses))
            return res.status(400).json({ error: 'Expected an array of expenses' });
        let operations = [];
        for (let data of expenses) {
            let { accountId, toAccountId, amount, type, date } = data, rest = __rest(data, ["accountId", "toAccountId", "amount", "type", "date"]);
            if (date && typeof date === 'string' && !date.includes('T')) {
                date = new Date(date).toISOString();
            }
            const numAmount = Number(amount);
            const account = yield prisma.account.findUnique({ where: { id: accountId } });
            if (!account)
                continue;
            const isDebtAccount = account.type === 'CREDIT_CARD' || account.type === 'LOAN';
            if (type === 'TRANSFER' && toAccountId) {
                const toAccount = yield prisma.account.findUnique({ where: { id: toAccountId } });
                if (!toAccount)
                    continue;
                const isToDebtAccount = toAccount.type === 'CREDIT_CARD' || toAccount.type === 'LOAN';
                const fromOperation = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
                const toOperation = isToDebtAccount ? { decrement: numAmount } : { increment: numAmount };
                operations.push(prisma.expense.create({
                    data: Object.assign({ accountId,
                        toAccountId, amount: numAmount, type: 'TRANSFER', date }, rest)
                }), prisma.account.update({
                    where: { id: accountId },
                    data: { balance: fromOperation }
                }), prisma.account.update({
                    where: { id: toAccountId },
                    data: { balance: toOperation }
                }));
            }
            else {
                const incrementOp = isDebtAccount ? { increment: numAmount } : { decrement: numAmount };
                const decrementOp = isDebtAccount ? { decrement: numAmount } : { increment: numAmount };
                operations.push(prisma.expense.create({
                    data: Object.assign({ accountId, amount: numAmount, type: type || 'DEBIT', date }, rest)
                }), prisma.account.update({
                    where: { id: accountId },
                    data: {
                        balance: type === 'CREDIT' ? decrementOp : incrementOp
                    }
                }));
            }
        }
        yield prisma.$transaction(operations);
        res.json({ message: 'Bulk expenses added successfully', count: expenses.length });
    }
    catch (error) {
        console.error('Add bulk expenses error:', error);
        res.status(500).json({ error: 'Failed to add bulk expenses', details: error.message });
    }
}));
// AI Insights
app.post('/api/ai/analyze-finance', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return res.status(400).json({ success: false, error: 'User ID is missing from token' });
        }
        const data = yield (0, financeInsightService_1.generateFinancialInsights)(userId);
        res.json({ success: true, data });
    }
    catch (error) {
        console.error('AI Analysis error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate AI insights', details: error.message });
    }
}));
// Todos
app.get('/api/todos', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const todos = yield prisma.todo.findMany({ orderBy: { dueDate: 'asc' } });
        res.json(todos);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
}));
app.post('/api/todos', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Received todo data:', req.body);
        let _a = req.body, { dueDate } = _a, rest = __rest(_a, ["dueDate"]);
        // Ensure dueDate is legitimate ISO-8601 string for Prisma
        if (dueDate && typeof dueDate === 'string' && !dueDate.includes('T')) {
            dueDate = new Date(dueDate).toISOString();
        }
        const todo = yield prisma.todo.create({
            data: Object.assign(Object.assign({}, rest), { dueDate })
        });
        res.json(todo);
    }
    catch (error) {
        console.error('Error creating todo:', error);
        res.status(500).json({ error: 'Failed to create todo', details: error instanceof Error ? error.message : String(error) });
    }
}));
app.patch('/api/todos/:id', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const todo = yield prisma.todo.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(todo);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update todo' });
    }
}));
app.delete('/api/todos/:id', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma.todo.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete todo' });
    }
}));
// Plans
app.get('/api/plans', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date query parameter is required' });
        }
        const plans = yield prisma.plan.findMany({
            where: { date: String(date) },
            orderBy: { startTime: 'asc' }
        });
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
}));
app.post('/api/plans', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const plan = yield prisma.plan.create({ data: req.body });
        res.json(plan);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create plan' });
    }
}));
app.put('/api/plans/:id', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const plan = yield prisma.plan.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(plan);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update plan' });
    }
}));
app.delete('/api/plans/:id', authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma.plan.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete plan' });
    }
}));
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
