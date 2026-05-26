import { Expense } from '@prisma/client';

export const calculateTrendAnalytics = (currentPeriodExpenses: Expense[], previousPeriodExpenses: Expense[]) => {
    const currentTotal = currentPeriodExpenses.filter(e => e.type === 'DEBIT').reduce((sum, e) => sum + e.amount, 0);
    const previousTotal = previousPeriodExpenses.filter(e => e.type === 'DEBIT').reduce((sum, e) => sum + e.amount, 0);

    let momIncreasePercentage = 0;
    if (previousTotal > 0) {
        momIncreasePercentage = Math.round(((currentTotal - previousTotal) / previousTotal) * 100);
    } else if (currentTotal > 0) {
        momIncreasePercentage = 100; // If previous was 0 and current > 0, it's a 100% increase conceptually
    }

    // Find unusual spending spikes (e.g., a category that is way higher this month than last month)
    const currentCategoryTotals = getCategoryTotals(currentPeriodExpenses);
    const previousCategoryTotals = getCategoryTotals(previousPeriodExpenses);
    
    const unusualSpikes: string[] = [];
    
    for (const [category, currentAmount] of Object.entries(currentCategoryTotals)) {
        const previousAmount = previousCategoryTotals[category] || 0;
        if (previousAmount > 0) {
            const spikePercentage = ((currentAmount - previousAmount) / previousAmount) * 100;
            if (spikePercentage > 50 && currentAmount > 500) { // arbitrary threshold: 50% increase and more than 500
                unusualSpikes.push(`${category} (+${Math.round(spikePercentage)}%)`);
            }
        }
    }

    return {
        previousMonthExpenses: previousTotal,
        monthOverMonthChangePercentage: momIncreasePercentage,
        unusualSpikes
    };
};

const getCategoryTotals = (expenses: Expense[]) => {
    return expenses.filter(e => e.type === 'DEBIT').reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
    }, {} as Record<string, number>);
};
