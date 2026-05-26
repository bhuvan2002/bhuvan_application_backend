import { Expense } from '@prisma/client';

export const calculateIncomeAnalytics = (expenses: Expense[]) => {
    const creditExpenses = expenses.filter(e => e.type === 'CREDIT');
    const transferExpenses = expenses.filter(e => e.type === 'TRANSFER');
    
    const totalIncome = creditExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalTransfers = transferExpenses.reduce((sum, e) => sum + e.amount, 0);

    return {
        totalIncome,
        totalTransfers
    };
};

export const calculateSavingsRate = (totalIncome: number, totalExpenses: number) => {
    if (totalIncome === 0) return 0;
    const savings = totalIncome - totalExpenses;
    if (savings <= 0) return 0;
    return Math.round((savings / totalIncome) * 100);
};
