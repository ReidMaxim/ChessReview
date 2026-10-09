import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { createSandbox, moveSandboxCursor, playSandboxMove, promotionOptions, sandboxFen, sandboxPgn } from '../src/lib/sandbox';

describe('Independent free board sandbox', () => {
  it('starts from a standard board and enforces legal moves', () => {
    const initial = createSandbox();
    expect(sandboxFen(initial)).toBe(new Chess().fen());
    expect(playSandboxMove(initial,'e2','e5')).toBeNull();
    const one = playSandboxMove(initial,'e2','e4')!;
    const two = playSandboxMove(one,'e7','e5')!;
    expect(two.cursor).toBe(2);
    expect(two.moves.map(m => m.san)).toEqual(['e4','e5']);
    expect(sandboxPgn(two)).toMatch(/1\. e4 e5/);
  });
  it('supports undo, redo and branching without mutating history', () => {
    const e4 = playSandboxMove(createSandbox(),'e2','e4')!;
    const e5 = playSandboxMove(e4,'e7','e5')!;
    const undone = moveSandboxCursor(e5,1);
    expect(sandboxFen(undone)).toBe(sandboxFen(e4));
    expect(moveSandboxCursor(undone,2).cursor).toBe(2);
    const alternative = playSandboxMove(undone,'c7','c5')!;
    expect(alternative.moves.map(m=>m.san)).toEqual(['e4','c5']);
    expect(alternative.cursor).toBe(2);
  });
  it('detects and applies all promotion choices', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    expect(promotionOptions(fen,'a7','a8').sort()).toEqual(['b','n','q','r']);
    const promoted = playSandboxMove(createSandbox(fen),'a7','a8','n')!;
    expect(promoted.moves[0].san).toMatch(/=N/);
    expect(new Chess(sandboxFen(promoted)).get('a8')?.type).toBe('n');
  });
});
