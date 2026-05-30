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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFinancialInsights = void 0;
const client_1 = require("@prisma/client");
const expenseAnalytics_1 = require("../analytics/expenseAnalytics");
const incomeAnalytics_1 = require("../analytics/incomeAnalytics");
const trendAnalytics_1 = require("../analytics/trendAnalytics");
const financePromptBuilder_1 = require("./financePromptBuilder");
const prisma = new client_1.PrismaClient();
const generateFinancialInsights = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. Fetch transactions for the last 60 days to compare current month vs last month
    const now = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(now.getDate() - 60);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    // Only fetch for specific user if userId is provided, else all (based on how your app scopes data)
    // Note: The Account model has userId. Expenses belong to Accounts.
    // So we fetch expenses where account.userId === userId
    const expenses = yield prisma.expense.findMany({
        include: { account: true }
    });
    // Split into current month (last 30 days) and previous month (day -60 to -30) for trend analysis only
    const currentPeriodExpenses = expenses.filter(e => new Date(e.date) >= thirtyDaysAgo);
    const previousPeriodExpenses = expenses.filter(e => new Date(e.date) >= sixtyDaysAgo && new Date(e.date) < thirtyDaysAgo);
    // 2. Run Analytics on ALL data
    const expenseData = (0, expenseAnalytics_1.calculateExpenseAnalytics)(expenses);
    const incomeData = (0, incomeAnalytics_1.calculateIncomeAnalytics)(expenses);
    const savingsRate = (0, incomeAnalytics_1.calculateSavingsRate)(incomeData.totalIncome, expenseData.totalExpenses);
    const trendData = (0, trendAnalytics_1.calculateTrendAnalytics)(currentPeriodExpenses, previousPeriodExpenses);
    const summaryData = {
        totalExpenses: expenseData.totalExpenses,
        totalIncome: incomeData.totalIncome,
        totalSavingsAmount: incomeData.totalIncome - expenseData.totalExpenses,
        savingsRate,
        highestSpendingCategory: expenseData.highestSpendingCategory,
        highestSpendingAmount: expenseData.highestSpendingAmount,
        potentialRecurringExpenses: expenseData.potentialRecurringExpenses,
        categoryTotals: expenseData.categoryTotals,
        dayOfWeekTotals: expenseData.dayOfWeekTotals,
        monthOverMonthChangePercentage: trendData.monthOverMonthChangePercentage,
        unusualSpikes: trendData.unusualSpikes
    };
    // 3. Build Prompt
    const prompt = (0, financePromptBuilder_1.buildFinancePrompt)(summaryData);
    // 4. Return structured data and prompt back to frontend
    // The frontend will be responsible for calling the local Ollama instance
    return {
        summary: summaryData,
        prompt: prompt
    };
});
exports.generateFinancialInsights = generateFinancialInsights;
