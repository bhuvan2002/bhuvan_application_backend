import { PrismaClient } from '@prisma/client';

export interface CreditCardCalculation {
    id: string;
    currentSpent: number;
    prevStatement: number;
    amountDue: number;
    currentCycleStart: string;
    currentCycleEnd: string;
    prevCycleStart: string;
    prevCycleEnd: string;
    currentCyclePayments: number;
}

/**
 * Handles month boundaries, year changes, and clamping for variable month lengths.
 * (e.g. Feb 28/29, Nov 30 for day 31).
 */
export function getSafeCycleDate(year: number, month: number, day: number): Date {
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const clampedDay = Math.min(day, lastDayOfMonth);
    return new Date(Date.UTC(year, month, clampedDay, 0, 0, 0, 0));
}

export function calculateCycleDateRange(billingCycle: number, refDate: Date = new Date()) {
    const cycleDay = billingCycle || 1;
    const year = refDate.getUTCFullYear();
    const month = refDate.getUTCMonth();
    const day = refDate.getUTCDate();

    let currentCycleStart: Date;
    let currentCycleEnd: Date;
    let prevCycleStart: Date;
    let prevCycleEnd: Date;

    if (day >= cycleDay) {
        currentCycleStart = getSafeCycleDate(year, month, cycleDay);
        currentCycleEnd = getSafeCycleDate(year, month + 1, cycleDay);
        prevCycleStart = getSafeCycleDate(year, month - 1, cycleDay);
        prevCycleEnd = currentCycleStart;
    } else {
        currentCycleStart = getSafeCycleDate(year, month - 1, cycleDay);
        currentCycleEnd = getSafeCycleDate(year, month, cycleDay);
        prevCycleStart = getSafeCycleDate(year, month - 2, cycleDay);
        prevCycleEnd = currentCycleStart;
    }

    return {
        currentCycleStart,
        currentCycleEnd,
        prevCycleStart,
        prevCycleEnd
    };
}

/**
 * Dynamic calculation of credit card spending and statements on server side.
 * Uses optimized SQL queries where available, with safe fallback.
 */
export async function calculateCreditCardDetails(
    prisma: PrismaClient,
    refDateStr?: string
): Promise<Map<string, CreditCardCalculation>> {
    const resultMap = new Map<string, CreditCardCalculation>();

    try {
        const dateParam = refDateStr || new Date().toISOString().split('T')[0];

        const sql = `
        WITH card_cycles AS (
          SELECT 
            a.id,
            a.name,
            COALESCE(a."billingCycle", 1) as "billingCycle",
            $1::date as today,
            CASE 
              WHEN EXTRACT(DAY FROM $1::date) >= COALESCE(a."billingCycle", 1) THEN
                (make_date(EXTRACT(YEAR FROM $1::date)::int, EXTRACT(MONTH FROM $1::date)::int, 1) 
                 + (LEAST(COALESCE(a."billingCycle", 1), EXTRACT(DAY FROM (make_date(EXTRACT(YEAR FROM $1::date)::int, EXTRACT(MONTH FROM $1::date)::int, 1) + interval '1 month - 1 day')))::int - 1) * interval '1 day')::date
              ELSE
                (make_date(EXTRACT(YEAR FROM ($1::date - interval '1 month'))::int, EXTRACT(MONTH FROM ($1::date - interval '1 month'))::int, 1) 
                 + (LEAST(COALESCE(a."billingCycle", 1), EXTRACT(DAY FROM (make_date(EXTRACT(YEAR FROM ($1::date - interval '1 month'))::int, EXTRACT(MONTH FROM ($1::date - interval '1 month'))::int, 1) + interval '1 month - 1 day')))::int - 1) * interval '1 day')::date
            END as current_cycle_start
          FROM "Account" a
          WHERE a.type = 'CREDIT_CARD'
        ),
        card_cycles_full AS (
          SELECT 
            cc.*,
            (make_date(EXTRACT(YEAR FROM (current_cycle_start + interval '1 month'))::int, EXTRACT(MONTH FROM (current_cycle_start + interval '1 month'))::int, 1)
             + (LEAST("billingCycle", EXTRACT(DAY FROM (make_date(EXTRACT(YEAR FROM (current_cycle_start + interval '1 month'))::int, EXTRACT(MONTH FROM (current_cycle_start + interval '1 month'))::int, 1) + interval '1 month - 1 day')))::int - 1) * interval '1 day')::date as current_cycle_end,
            (make_date(EXTRACT(YEAR FROM (current_cycle_start - interval '1 month'))::int, EXTRACT(MONTH FROM (current_cycle_start - interval '1 month'))::int, 1)
             + (LEAST("billingCycle", EXTRACT(DAY FROM (make_date(EXTRACT(YEAR FROM (current_cycle_start - interval '1 month'))::int, EXTRACT(MONTH FROM (current_cycle_start - interval '1 month'))::int, 1) + interval '1 month - 1 day')))::int - 1) * interval '1 day')::date as prev_cycle_start,
            current_cycle_start as prev_cycle_end
          FROM card_cycles cc
        ),
        spends_and_payments AS (
          SELECT 
            c.id as account_id,
            COALESCE(SUM(
              CASE 
                WHEN e."accountId" = c.id 
                     AND (e.type = 'DEBIT' OR e.type IS NULL)
                     AND e.date >= c.current_cycle_start 
                     AND e.date < c.current_cycle_end 
                THEN e.amount 
                WHEN e."accountId" = c.id 
                     AND e.type = 'CREDIT'
                     AND e.date >= c.current_cycle_start 
                     AND e.date < c.current_cycle_end 
                THEN -e.amount 
                ELSE 0 
              END
            ), 0) as current_spent,

            COALESCE(SUM(
              CASE 
                WHEN e."accountId" = c.id 
                     AND (e.type = 'DEBIT' OR e.type IS NULL)
                     AND e.date >= c.prev_cycle_start 
                     AND e.date < c.prev_cycle_end 
                THEN e.amount 
                WHEN e."accountId" = c.id 
                     AND e.type = 'CREDIT'
                     AND e.date >= c.prev_cycle_start 
                     AND e.date < c.prev_cycle_end 
                THEN -e.amount 
                ELSE 0 
              END
            ), 0) as prev_statement_gross,

            COALESCE(SUM(
              CASE 
                WHEN (e."toAccountId" = c.id AND e.type = 'TRANSFER')
                     AND e.date >= c.current_cycle_start 
                     AND e.date < c.current_cycle_end 
                THEN e.amount 
                WHEN e."accountId" = c.id 
                     AND e.type = 'CREDIT'
                     AND e.date >= c.current_cycle_start 
                     AND e.date < c.current_cycle_end 
                THEN e.amount 
                ELSE 0 
              END
            ), 0) as current_cycle_payments
          FROM card_cycles_full c
          LEFT JOIN "Expense" e 
            ON (e."accountId" = c.id OR e."toAccountId" = c.id)
          GROUP BY c.id
        )
        SELECT 
          c.id,
          c.name,
          c.prev_cycle_start::text,
          c.prev_cycle_end::text,
          c.current_cycle_start::text,
          c.current_cycle_end::text,
          ROUND(sp.current_spent::numeric, 2)::float as current_spent,
          ROUND(GREATEST(0, sp.prev_statement_gross)::numeric, 2)::float as prev_statement,
          ROUND(GREATEST(0, GREATEST(0, sp.prev_statement_gross) - sp.current_cycle_payments)::numeric, 2)::float as amount_due,
          ROUND(sp.current_cycle_payments::numeric, 2)::float as current_cycle_payments
        FROM card_cycles_full c
        JOIN spends_and_payments sp ON c.id = sp.account_id;
        `;

        const rows: any[] = await prisma.$queryRawUnsafe(sql, dateParam);
        for (const row of rows) {
            resultMap.set(row.id, {
                id: row.id,
                currentSpent: Number(row.current_spent || 0),
                prevStatement: Number(row.prev_statement || 0),
                amountDue: Number(row.amount_due || 0),
                currentCycleStart: row.current_cycle_start,
                currentCycleEnd: row.current_cycle_end,
                prevCycleStart: row.prev_cycle_start,
                prevCycleEnd: row.prev_cycle_end,
                currentCyclePayments: Number(row.current_cycle_payments || 0)
            });
        }
    } catch (sqlError) {
        console.warn('SQL credit card calculation encountered error, using programmatic fallback:', sqlError);
        // Programmatic fallback
        const refDate = refDateStr ? new Date(refDateStr) : new Date();
        const cards = await prisma.account.findMany({ where: { type: 'CREDIT_CARD' } });

        for (const card of cards) {
            const { currentCycleStart, currentCycleEnd, prevCycleStart, prevCycleEnd } =
                calculateCycleDateRange(card.billingCycle || 1, refDate);

            const expenses = await prisma.expense.findMany({
                where: {
                    OR: [{ accountId: card.id }, { toAccountId: card.id }],
                    date: { gte: prevCycleStart, lt: currentCycleEnd }
                }
            });

            let currentSpent = 0;
            let prevStatementGross = 0;
            let currentCyclePayments = 0;

            for (const e of expenses) {
                const d = new Date(e.date);
                const isDebit = e.accountId === card.id && (e.type === 'DEBIT' || !e.type);
                const isCredit = e.accountId === card.id && e.type === 'CREDIT';
                const isTransferIn = e.toAccountId === card.id && e.type === 'TRANSFER';

                // Previous cycle
                if (d >= prevCycleStart && d < prevCycleEnd) {
                    if (isDebit) prevStatementGross += e.amount;
                    if (isCredit) prevStatementGross -= e.amount;
                }

                // Current cycle
                if (d >= currentCycleStart && d < currentCycleEnd) {
                    if (isDebit) currentSpent += e.amount;
                    if (isCredit) currentSpent -= e.amount;
                    if (isTransferIn || isCredit) currentCyclePayments += e.amount;
                }
            }

            const prevStatement = Math.max(0, Math.round(prevStatementGross * 100) / 100);
            const amountDue = Math.max(0, Math.round((prevStatement - currentCyclePayments) * 100) / 100);

            resultMap.set(card.id, {
                id: card.id,
                currentSpent: Math.round(currentSpent * 100) / 100,
                prevStatement,
                amountDue,
                currentCycleStart: currentCycleStart.toISOString(),
                currentCycleEnd: currentCycleEnd.toISOString(),
                prevCycleStart: prevCycleStart.toISOString(),
                prevCycleEnd: prevCycleEnd.toISOString(),
                currentCyclePayments: Math.round(currentCyclePayments * 100) / 100
            });
        }
    }

    return resultMap;
}

/**
 * Enriches accounts array with dynamically calculated credit card spending and statement properties.
 */
export async function enrichAccountsWithCreditCardDetails(
    prisma: PrismaClient,
    accounts: any[],
    refDateStr?: string
): Promise<any[]> {
    const hasCreditCard = accounts.some(a => a.type === 'CREDIT_CARD');
    if (!hasCreditCard) return accounts;

    const ccDetailsMap = await calculateCreditCardDetails(prisma, refDateStr);

    return accounts.map(acc => {
        if (acc.type !== 'CREDIT_CARD') return acc;
        const details = ccDetailsMap.get(acc.id);
        if (!details) return acc;

        return {
            ...acc,
            currentSpent: details.currentSpent,
            prevStatement: details.prevStatement,
            amountDue: details.amountDue,
            currentCycleStart: details.currentCycleStart,
            currentCycleEnd: details.currentCycleEnd,
            prevCycleStart: details.prevCycleStart,
            prevCycleEnd: details.prevCycleEnd,
            currentCyclePayments: details.currentCyclePayments
        };
    });
}
