import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { OPERA_PGN } from '../src/lib/demo';
import { parsePgn } from '../src/lib/pgn';

describe('PGN import contract', () => {
  it('replays the Opera Game with accurate positions', () => {
    const game = parsePgn(OPERA_PGN);
    expect(game.moves).toHaveLength(33);
    expect(game.positions).toHaveLength(34);
    expect(game.headers.White).toBe('Paul Morphy');
    expect(game.moves.at(-1)?.san).toBe('Rd8#');
    expect(new Chess(game.positions.at(-1)).isCheckmate()).toBe(true);
  });

  it('rejects invalid and empty PGNs', () => {
    expect(() => parsePgn('')).toThrow(/Paste a PGN/);
    expect(() => parsePgn('1. e4 e5 2. KingToMars')).toThrow(/could not be read/);
  });

  it('never mutates the initial position when replaying moves', () => {
    const game = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
    expect(game.positions[0]).toBe(new Chess().fen());
    expect(game.moves.map(move => move.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(game.positions).toHaveLength(5);
  });
});
