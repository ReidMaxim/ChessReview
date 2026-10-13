import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/lib/game-review';
import { replayEngineLine } from '../src/lib/coach-intelligence';
import { buildCoachPractice, practiceFeedback } from '../src/lib/coach-practice';
import { parsePgn } from '../src/lib/pgn';
import type { InvestigationLine, InvestigationResult } from '../src/lib/investigation';

const cp = (value: number) => ({ kind: 'cp' as const, value });
function deep(fen: string, best: string[], played: string[]): InvestigationResult {
  const line = (pv: string[]): InvestigationLine => ({
    rank: 1, depth: 14, score: cp(0), bound: 'exact', rootFen: fen,
    pv, steps: replayEngineLine(fen, pv, 16),
  });
  return {
    rootFen: fen, playedUci: played[0], best: line(best), played: line(played),
    alternatives: [], requestedDepth: 14, elapsedMs: 1000,
  };
}
function example() {
  const game = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
  const report = buildReport(game, 8, [cp(0), cp(0), cp(0), cp(-430), cp(-1500)],
    ['f2f3', 'e7e5', 'g2g3', 'd8h4', null], game.moves.length + 1);
  const analysis = deep(game.positions[2], ['g2g3', 'd7d5'], ['g2g4', 'd8h4']);
  return { game, report, analysis };
}

describe('Phase 10D — engine-grounded practice', () => {
  it('only offers legally verified played and deep-engine first moves', () => {
    const { game, report, analysis } = example();
    const exercise = buildCoachPractice(game, report, 3, analysis);
    expect(exercise).not.toBeNull();
    expect(exercise?.choices.map(x => x.san)).toEqual(['g4', 'g3']);
    expect(exercise?.played.uci).toBe('g2g4');
    expect(exercise?.engine.uci).toBe('g2g3');
    expect(exercise?.depth).toBe(14);
    expect(exercise?.bounded).toBe(false);
  });

  it('gives measured feedback rather than claiming a forced win', () => {
    const { game, report, analysis } = example();
    const exercise = buildCoachPractice(game, report, 3, analysis)!;
    expect(practiceFeedback(exercise, exercise.engine.uci)).toContain('current first choice');
    expect(practiceFeedback(exercise, exercise.played.uci)).toContain('examples, not forced');
    expect(practiceFeedback(exercise, 'a1a8')).toBeNull();
  });

  it('never invents a puzzle before the deeper investigation is available', () => {
    const { game, report } = example();
    expect(buildCoachPractice(game, report, 3)).toBeNull();
    const partial = buildReport(game, 8, [cp(0), cp(0), cp(0), null, null], [null, null, null], 3);
    expect(buildCoachPractice(game, partial, 3)).toBeNull();
  });

  it('declines a different-root or corrupted continuation', () => {
    const { game, report, analysis } = example();
    const wrongRoot = deep(new Chess().fen(), ['e2e4', 'e7e5'], ['g1f3', 'd7d5']);
    expect(buildCoachPractice(game, report, 3, wrongRoot)).toBeNull();
    analysis.best.steps[1].fen = 'bad-position';
    expect(buildCoachPractice(game, report, 3, analysis)).toBeNull();
  });

  it('does not ask for a better move when deeper Stockfish chooses the played move', () => {
    const { game, report } = example();
    const analysis = deep(game.positions[2], ['g2g4', 'd8h4'], ['g2g4', 'd8h4']);
    expect(buildCoachPractice(game, report, 3, analysis)).toBeNull();
  });

  it('labels score bounds as uncertainty, without changing the verified legal choices', () => {
    const { game, report, analysis } = example();
    analysis.played.bound = 'lower';
    const exercise = buildCoachPractice(game, report, 3, analysis);
    expect(exercise?.bounded).toBe(true);
  });
});
