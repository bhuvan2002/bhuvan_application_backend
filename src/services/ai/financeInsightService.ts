import { PrismaClient } from '@prisma/client';
import { calculateExpenseAnalytics } from '../analytics/expenseAnalytics';
import { calculateIncomeAnalytics, calculateSavingsRate } from '../analytics/incomeAnalytics';
import { calculateTrendAnalytics } from '../analytics/trendAnalytics';
import { buildFinancePrompt, FinancialSummaryData } from './financePromptBuilder';
import { generateCompletion } from './ollamaService';

const prisma = new PrismaClient();

export const generateFinancialInsights = async (userId: string) => {
    // 1. Fetch transactions for the last 60 days to compare current month vs last month
    const now = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(now.getDate() - 60);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // Only fetch for specific user if userId is provided, else all (based on how your app scopes data)
    // Note: The Account model has userId. Expenses belong to Accounts.
    // So we fetch expenses where account.userId === userId
    const expenses = await prisma.expense.findMany({
        include: { account: true }
    });

    // Split into current month (last 30 days) and previous month (day -60 to -30) for trend analysis only
    const currentPeriodExpenses = expenses.filter(e => new Date(e.date) >= thirtyDaysAgo);
    const previousPeriodExpenses = expenses.filter(e => new Date(e.date) >= sixtyDaysAgo && new Date(e.date) < thirtyDaysAgo);

    // 2. Run Analytics on ALL data
    const expenseData = calculateExpenseAnalytics(expenses);
    const incomeData = calculateIncomeAnalytics(expenses);
    const savingsRate = calculateSavingsRate(incomeData.totalIncome, expenseData.totalExpenses);
    const trendData = calculateTrendAnalytics(currentPeriodExpenses, previousPeriodExpenses);

    const summaryData: FinancialSummaryData = {
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
    const prompt = buildFinancePrompt(summaryData);

    // 4. Call Ollama
    let insightsJson = { insights: [] };
    try {
        const aiResponseText = await generateCompletion(prompt);
        // Try to parse the response, handling potential formatting issues from LLM
        const cleanedResponse = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
        insightsJson = JSON.parse(cleanedResponse);
    } catch (error: any) {
        console.error("Failed to parse AI insights or contact Ollama", error);
        // Fallback or just throw
        throw new Error(error.message || 'Failed to generate insights from AI.');
    }

    // 5. Return structured data
    return {
        summary: summaryData,
        insights: insightsJson.insights
    };
};
