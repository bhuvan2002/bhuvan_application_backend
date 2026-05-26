"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFinancePrompt = void 0;
const buildFinancePrompt = (data) => {
    const hasData = data.totalExpenses > 0 || data.totalIncome > 0;
    if (!hasData) {
        return `
You are a financial advisor. The user has requested an analysis but they have 0 income and 0 expenses recorded.
Provide exactly 1 insight of type "suggestion" telling the user to start adding their incomes and expenses to see AI insights.

Return EXACTLY in the following JSON format and nothing else. DO NOT wrap in markdown blocks.
{
  "insights": [
    {
      "type": "suggestion",
      "title": "Add Your Transactions",
      "message": "Start logging your income and expenses to unlock personalized financial insights."
    }
  ]
}
`;
    }
    return `
Analyze the following all-time financial data and provide practical, actionable insights.
Act as an expert financial advisor.

FINANCIAL SUMMARY:
- Total Income (Credit): ₹${data.totalIncome}
- Total Expenses (Debit): ₹${data.totalExpenses}
- Total Savings Amount: ₹${data.totalSavingsAmount}
- Savings Rate: ${data.savingsRate}%
- Highest Spending Category: ${data.highestSpendingCategory} (₹${data.highestSpendingAmount})
- Month-over-Month Expense Change: ${data.monthOverMonthChangePercentage}%
- Potential Recurring Expenses: ${data.potentialRecurringExpenses.length > 0 ? data.potentialRecurringExpenses.join(', ') : 'None detected'}
- Unusual Spending Spikes: ${data.unusualSpikes.length > 0 ? data.unusualSpikes.join(', ') : 'None detected'}

CATEGORY BREAKDOWN (Percentage of Total Expenses):
${Object.entries(data.categoryTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cat, amount]) => {
        const percentage = data.totalExpenses > 0 ? Math.round((amount / data.totalExpenses) * 100) : 0;
        return `- ${cat}: ₹${amount} (${percentage}%)`;
    })
        .join('\n')}

DAY OF WEEK SPENDING BREAKDOWN:
${Object.entries(data.dayOfWeekTotals)
        .sort(([, a], [, b]) => b - a)
        .map(([day, amount]) => {
        const percentage = data.totalExpenses > 0 ? Math.round((amount / data.totalExpenses) * 100) : 0;
        return `- ${day}: ₹${amount} (${percentage}%)`;
    })
        .join('\n')}

INSTRUCTIONS:
1. Provide exactly 4 insights.
2. Categorize each insight as either "warning", "positive", or "suggestion".
3. Insight 1 (Savings Analysis): Explain exactly how much money they are saving from their income versus spending. Tell them if their savings rate is healthy.
4. Insight 2 (Category Analysis): Analyze the category they spend the most on. Provide a specific projection (e.g., "If you reduce your ${data.highestSpendingCategory || 'highest'} expense by 20%, your total savings could increase by X%"). You must perform this basic math calculation.
5. Insight 3 (Day of Week Analysis): Explicitly mention which day of the week they spend the most money on based on the provided breakdown. Advise them on how to curb spending on this day.
6. Insight 4 (General Suggestion/Warning): Based on month-over-month changes or recurring expenses.
7. Keep messages concise (2-3 sentences maximum).

Return EXACTLY in the following JSON format and nothing else. DO NOT wrap in markdown blocks like \`\`\`json.
{
  "insights": [
    {
      "type": "warning | positive | suggestion",
      "title": "Short Title",
      "message": "Concise message here."
    }
  ]
}
`;
};
exports.buildFinancePrompt = buildFinancePrompt;
