import { describe, it, expect } from 'vitest';
import { parsePgn } from '../src/lib/pgn';
import { buildReport } from '../src/lib/game-review';
import { buildGameSummary, buildMoveInsight, validatedBestMove } from '../src/lib/insights';

const cp = (value: number) => ({ kind: 'cp' as const, value });

describe('Evidence-grounded Coach Notes', () => {
  const game = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
  const report = buildReport(game, 8,
    [cp(20), cp(20), cp(210), cp(200), cp(210)],
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', null], 5);

  it('uses the correct pre-move FEN for Black alternatives', () => {
    const note = buildMoveInsight(game, report, 2);
    expect(note?.heading).toBe('1... e5');
    expect(note?.bestSan).toBe('c5');
    expect(note?.bestUci).toBe('c7c5');
    expect(note?.quality).toBe('Mistake');
    expect(note?.scoreBefore).toBe('+0.20');
    expect(note?.scoreAfter).toBe('+2.10');
    expect(note?.comparison).toContain('BEFORE e5');
  });

  it('never suggests a malformed or illegal engine move', () => {
    expect(validatedBestMove(game.positions[1], 'h1h8')).toBeNull();
    expect(validatedBestMove(game.positions[1], 'invalid')).toBeNull();
    expect(validatedBestMove(game.positions[1], 'c7c5')?.san).toBe('c5');
  });

  it('identifies captured pieces and checkmate only from legal moves', () => {
    const capture = parsePgn('1. e4 d5 2. exd5 *');
    const capReport = buildReport(capture, 8, [cp(0),cp(0),cp(0),cp(0)], ['e2e4','d7d5','e4d5',null], 4);
    expect(buildMoveInsight(capture,capReport,3)?.observations).toContain('White captured a pawn on d5.');
    const mate = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
    const mateReport = buildReport(mate, 8, [cp(0),cp(0),cp(0),cp(0),{kind:'mate',value:-1}], ['f2f3','e7e5','g2g4','d8h4',null], 5);
    expect(buildMoveInsight(mate,mateReport,4)?.observations).toContain('This move delivered checkmate.');
  });

  it('does not pretend that partially analyzed moves have explanations', () => {
    const partial = buildReport(game,8,[cp(10),cp(10),null,null,null],['e2e4',null,null,null,null],2);
    expect(buildMoveInsight(game,partial,2)).toBeNull();
    expect(buildMoveInsight(game,partial,0)).toBeNull();
    expect(buildGameSummary(game,partial).complete).toBe(false);
  });

  it('summarizes measured turning points without inventing causes', () => {
    const summary = buildGameSummary(game,report);
    expect(summary.critical).toBe(1);
    expect(summary.blackCritical).toBe(1);
    expect(summary.whiteCritical).toBe(0);
    expect(summary.turningPoints[0].ply).toBe(2);
    expect(summary.description).toContain('e5');
  });
});
