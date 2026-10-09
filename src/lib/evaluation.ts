import type { Score } from './engine-utils';

/** Percentage of the bar occupied by White, NOT a calibrated win probability. */
export function whiteBarShare(score: Score | null): number {
  if (!score) return 50;
  if (score.kind === 'mate') {
    if (score.value > 0) return 100;
    if (score.value < 0) return 0;
    return 50;
  }
  if (!Number.isFinite(score.value)) return 50;
  return 50 + 50 * Math.tanh(score.value / 450);
}

export function barAdvantageText(score: Score | null): string {
  if (!score) return 'No evaluation yet';
  if (score.kind === 'mate') {
    if (score.value === 0) return 'Mate on board';
    return (score.value > 0 ? 'White' : 'Black') + ' has a forced mate in ' + Math.abs(score.value);
  }
  if (score.value > 40) return 'White advantage';
  if (score.value < -40) return 'Black advantage';
  return 'Position approximately equal';
}
