"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateExpenseAnalytics = void 0;
const calculateExpenseAnalytics = (expenses) => {
    const debitExpenses = expenses.filter(e => e.type === 'DEBIT');
    const totalExpenses = debitExpenses.reduce((sum, e) => sum + e.amount, 0);
    const categoryTotals = debitExpenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
    }, {});
    let highestCategory = '';
    let highestCategoryAmount = 0;
    for (const [category, amount] of Object.entries(categoryTotals)) {
        if (amount > highestCategoryAmount) {
            highestCategory = category;
            highestCategoryAmount = amount;
        }
    }
    // A simple recurring expense heuristic: same description > 1 time
    const descriptionCounts = debitExpenses.reduce((acc, e) => {
        var _a;
        const desc = (_a = e.description) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
        if (desc) {
            acc[desc] = (acc[desc] || 0) + 1;
        }
        return acc;
    }, {});
    const recurringCandidates = Object.entries(descriptionCounts)
        .filter(([_, count]) => count > 1)
        .map(([desc]) => desc);
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekTotals = debitExpenses.reduce((acc, e) => {
        const dayName = daysOfWeek[new Date(e.date).getDay()];
        acc[dayName] = (acc[dayName] || 0) + e.amount;
        return acc;
    }, {});
    return {
        totalExpenses,
        categoryTotals,
        dayOfWeekTotals,
        highestSpendingCategory: highestCategory,
        highestSpendingAmount: highestCategoryAmount,
        potentialRecurringExpenses: recurringCandidates.slice(0, 5) // top 5
    };
};
exports.calculateExpenseAnalytics = calculateExpenseAnalytics;
