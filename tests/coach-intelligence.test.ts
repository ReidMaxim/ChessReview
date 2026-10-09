import { describe, expect, it } from 'vitest';
import { parsePgn } from '../src/lib/pgn';
import { buildReport } from '../src/lib/game-review';
import { replayEngineLine, describeConsequence, coachLines } from '../src/lib/coach-intelligence';

const cp = (value: number) => ({kind: 'cp' as const, value});

describe('Coach Intelligence — verified legal engine lines', () => {
  it('retains and replays variations from both sides of the played move', () => {
    const game = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
    const scores = [cp(20),cp(20),cp(35),cp(30),cp(25)];
    const best = ['e2e4','e7e5','g1f3','b8c6',null];
    const variations = [
      ['e2e4','e7e5','g1f3'], ['e7e5','g1f3'], ['g1f3','b8c6'],
      ['b8c6','f1b5'],[],
    ];
    const report = buildReport(game,8,scores,best,5,variations);
    const lines = coachLines(game, report, 2);
    expect(lines?.alternative.steps.map(s=>s.san)).toEqual(['e5','Nf3']);
    expect(lines?.consequence.steps.map(s=>s.san)).toEqual(['Nf3','Nc6']);
    expect(lines?.alternative.steps[0].from).toBe('e7');
    expect(lines?.consequence.startFen).toBe(game.positions[2]);
    expect(report.variations[2]).toEqual(['g1f3','b8c6']);
  });
  it('verifies immediate checkmate before saying it is mate', () => {
    const game = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
    const line = replayEngineLine(game.positions[3], ['d8h4']);
    expect(line[0]?.checkmate).toBe(true);
    expect(describeConsequence(game,3,line).kind).toBe('mate');
    expect(describeConsequence(game,3,line).headline).toContain('checkmate');
  });
  it('identifies geometric knight forks, without guaranteeing a win', () => {
    const fen = '2q4k/1r6/8/5N2/8/8/8/7K w - - 0 1';
    const line = replayEngineLine(fen, ['f5d6']);
    expect(new Set(line[0].fork)).toEqual(new Set(['rook on b7','queen on c8'])); 
    expect(line[0].fork).toHaveLength(2);
  });
  it('tracks an actual material capture rather than an inferred hanging piece', () => {
    const fen = '3r3k/8/8/8/8/8/3Q4/7K b - - 0 1';
    const line = replayEngineLine(fen,['d8d2']);
    expect(line[0].captured).toBe('queen');
    expect(line[0].san).toContain('xd2');
  });
  it('stops before illegal or fabricated PV moves', () => {
    const game = parsePgn('1. e4 e5 *');
    const line = replayEngineLine(game.positions[0],['e2e4','e7e5','h1h8','g1f3']);
    expect(line.map(x=>x.san)).toEqual(['e4','e5']);
    expect(replayEngineLine(game.positions[0],['b1b9'])).toEqual([]);
  });
});
