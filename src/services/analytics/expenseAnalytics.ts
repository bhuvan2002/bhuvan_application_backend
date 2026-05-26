import { Expense } from '@prisma/client';

export const calculateExpenseAnalytics = (expenses: Expense[]) => {
    const debitExpenses = expenses.filter(e => e.type === 'DEBIT');
    
    const totalExpenses = debitExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    const categoryTotals = debitExpenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
    }, {} as Record<string, number>);

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
        const desc = e.description?.trim().toLowerCase();
        if (desc) {
            acc[desc] = (acc[desc] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const recurringCandidates = Object.entries(descriptionCounts)
        .filter(([_, count]) => count > 1)
        .map(([desc]) => desc);

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekTotals = debitExpenses.reduce((acc, e) => {
        const dayName = daysOfWeek[new Date(e.date).getDay()];
        acc[dayName] = (acc[dayName] || 0) + e.amount;
        return acc;
    }, {} as Record<string, number>);

    return {
        totalExpenses,
        categoryTotals,
        dayOfWeekTotals,
        highestSpendingCategory: highestCategory,
        highestSpendingAmount: highestCategoryAmount,
        potentialRecurringExpenses: recurringCandidates.slice(0, 5) // top 5
    };
};
