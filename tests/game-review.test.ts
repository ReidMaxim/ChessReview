import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { parsePgn } from '../src/lib/pgn';
import { classifyMove, buildReport, scoreToCp, scoreToGraph, terminalScore } from '../src/lib/game-review';

const cp = (value: number) => ({kind:'cp' as const, value});
describe('Whole-game evaluation bookkeeping', () => {
  const game = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
  it('marks an exact Stockfish best move and reports each position count', () => {
    const scores = [cp(25), cp(20), cp(35), cp(35), cp(30)];
    const best = ['e2e4','e7e5','g1f3','b8c6',null];
    const report = buildReport(game, 8, scores, best, 5);
    expect(report.completed).toBe(5);
    expect(report.rows.map(r=>r.quality)).toEqual(['Best','Best','Best','Best']);
    expect(report.rows.map(r=>r.ply)).toEqual([1,2,3,4]);
  });
  it('calculates loss from the player who just moved', () => {
    const white = classifyMove(cp(10),cp(-260),game.moves[0],null);
    expect(white.loss).toBe(270);
    expect(white.quality).toBe('Blunder');
    const black = classifyMove(cp(300),cp(100),game.moves[1],null);
    expect(black.loss).toBe(0);
    expect(black.quality).toBe('Good');
    const badBlack = classifyMove(cp(50),cp(360),game.moves[1],null);
    expect(badBlack.loss).toBe(310);
    expect(badBlack.quality).toBe('Blunder');
  });
  it('recognizes mate and draw positions without calling the engine', () => {
    const game = new Chess();
    game.move('f3');game.move('e5');game.move('g4');game.move('Qh4#');
    expect(terminalScore(game.fen())).toEqual({kind:'mate',value:-1});
    expect(scoreToCp({kind:'mate',value:-1})).toBe(-1500);
    expect(scoreToGraph({kind:'mate',value:1})).toBe(5);
  });
});
