// Small presentation helpers shared by the TSX views (Ledger interface system).
import type { BudgetSummary } from './money.js';

// Org tiles: initials on a fixed colour per organization (white text >= 4.5:1 on all three).
const TILE_CLASSES = ['tile-rust', 'tile-teal', 'tile-violet'] as const;

// Sum of code points. (A djb2-style hash multiplies by 33, which is divisible by 3, so
// `hash % 3` would depend only on the last character and most orgs got the same colour.)
function charSum(text: string): number {
  let sum = 0;
  for (const ch of text) sum += ch.codePointAt(0) ?? 0;
  return sum;
}

/** "Addis Build Collective" -> "AB"; "Hana" -> "HA" */
export function initials(name = ''): string {
  const [first, second] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return '?';
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export const tileClass = (orgName = ''): string => TILE_CLASSES[charSum(orgName) % TILE_CLASSES.length] ?? TILE_CLASSES[0];

export const firstName = (name = ''): string => name.trim().split(/\s+/)[0] ?? name;

type MeterInput = Pick<BudgetSummary, 'budget_santim' | 'spent_santim' | 'actual_santim' | 'percent_used' | 'percent_actual'>;

/**
 * Budget meter built from two stacked <progress> elements (no inline styles under the CSP):
 * the light bar is committed spend, the dark bar is the done part. Over budget, the scale
 * becomes the spend, the light bar stops at the budget mark and the red track shows the overrun.
 */
export function meter(p: MeterInput) {
  const over = p.spent_santim > p.budget_santim || p.actual_santim > p.budget_santim;
  const max = Math.max(p.budget_santim, p.spent_santim, p.actual_santim, 1);
  return {
    over,
    max,
    // Both bars stop at the budget mark; anything past it shows as the red track (the overrun).
    committed: Math.min(p.spent_santim, p.budget_santim),
    actual: Math.min(p.actual_santim, p.budget_santim),
    label: over
      ? `${p.percent_used} percent committed and ${p.percent_actual} percent actually spent, over budget`
      : `Budget: ${p.percent_used} percent committed, ${p.percent_actual} percent actually spent`,
  };
}
