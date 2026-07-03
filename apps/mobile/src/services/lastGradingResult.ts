/**
 * Session-scoped hand-off of the most recent graded take.
 *
 * The Record screen submits the take, stores the grade here, then navigates to
 * the Results tab, which prefers this over the mock result. Module state (not
 * route params) because a GradingResult is too structured to round-trip
 * through URL search params, and "latest result" is also the right thing for
 * the Results tab to show when opened directly.
 */
import type { GradingResult } from '@/types';

let lastResult: GradingResult | null = null;

export function setLastGradingResult(result: GradingResult | null): void {
  lastResult = result;
}

export function getLastGradingResult(): GradingResult | null {
  return lastResult;
}
