"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateSavingsRate = exports.calculateIncomeAnalytics = void 0;
const calculateIncomeAnalytics = (expenses) => {
    const creditExpenses = expenses.filter(e => e.type === 'CREDIT');
    const transferExpenses = expenses.filter(e => e.type === 'TRANSFER');
    const totalIncome = creditExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalTransfers = transferExpenses.reduce((sum, e) => sum + e.amount, 0);
    return {
        totalIncome,
        totalTransfers
    };
};
exports.calculateIncomeAnalytics = calculateIncomeAnalytics;
const calculateSavingsRate = (totalIncome, totalExpenses) => {
    if (totalIncome === 0)
        return 0;
    const savings = totalIncome - totalExpenses;
    if (savings <= 0)
        return 0;
    return Math.round((savings / totalIncome) * 100);
};
exports.calculateSavingsRate = calculateSavingsRate;
