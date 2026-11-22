import type { BudgetStatus } from './domain.js';

// Money is stored and computed as integer santim (1 ETB = 100 santim). Floats only appear for display.

const AMOUNT = /^(\d{1,10})(?:\.(\d{1,2}))?$/; // up to 9,999,999,999.99 ETB

/** "1,500.5" | 1500.5 -> 150050. Throws on anything that is not a non-negative amount with <= 2 decimals. */
export function etbToSantim(input: string | number | null | undefined): number {
  const text = String(input ?? '').trim().replace(/,/g, '');
  const match = AMOUNT.exec(text);
  if (!match) throw new Error('invalid ETB amount');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

const formatter = new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' });

/** 39500050 -> "ETB 395,000.50" */
export const formatEtb = (santim: number): string => formatter.format(santim / 100);

/** 39500050 -> "395000.50" (for API responses and form inputs) */
export const santimToEtb = (santim: number): string => (santim / 100).toFixed(2);

const pct = (part: number, whole: number): number =>
  whole === 0 ? (part > 0 ? 100 : 0) : Math.round((part / whole) * 1000) / 10;

/**
 * Budget status, the same model Zoho Projects uses:
 *   overrun  - money actually spent exceeds the budget
 *   at_risk  - committed (sum of estimates) exceeds the budget, actual spend doesn't (yet)
 *   on_track - neither
 */
export function budgetStatus(budgetSantim: number, committedSantim: number, actualSantim: number): BudgetStatus {
  if (actualSantim > budgetSantim) return 'overrun';
  if (committedSantim > budgetSantim) return 'at_risk';
  return 'on_track';
}

/**
 * Budget summary for a project. "spent" is the committed amount (sum of task estimates);
 * "actual" is what has really been paid (sum of recorded actual costs).
 */
export function budgetSummary(budgetSantim: number, spentSantim: number, doneSantim = 0, actualSantim = 0) {
  const remaining = budgetSantim - spentSantim;
  return {
    budget_santim: budgetSantim,
    spent_santim: spentSantim,
    done_santim: doneSantim,
    actual_santim: actualSantim,
    remaining_santim: remaining,
    budget_etb: santimToEtb(budgetSantim),
    spent_etb: santimToEtb(spentSantim),
    done_etb: santimToEtb(doneSantim),
    actual_etb: santimToEtb(actualSantim),
    remaining_etb: santimToEtb(remaining),
    percent_used: pct(spentSantim, budgetSantim),
    percent_actual: pct(actualSantim, budgetSantim),
    over_budget: spentSantim > budgetSantim,
    status: budgetStatus(budgetSantim, spentSantim, actualSantim),
  };
}

export type BudgetSummary = ReturnType<typeof budgetSummary>;
