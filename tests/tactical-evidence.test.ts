import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { replayEngineLine } from '../src/lib/coach-intelligence';
import { extractTacticalEvidence, findAbsolutePins } from '../src/lib/tactical-evidence';
import type { InvestigationLine, InvestigationResult } from '../src/lib/investigation';

function investigation(fen: string, best: string[], played: string[]): InvestigationResult {
  function line(pv: string[], rank: number): InvestigationLine {
    return { rank, depth: 14, score: { kind: 'cp', value: 0 }, bound: 'exact',
      rootFen: fen, pv, steps: replayEngineLine(fen, pv, 16) };
  }
  return { rootFen: fen, playedUci: played[0], best: line(best, 1),
    alternatives: [], played: line(played, 1), elapsedMs: 1000, requestedDepth: 14 };
}

describe('Phase 10B — evidence rather than untested guesses', () => {
  it('confirms an immediately legal mate, not just a mate evaluation', () => {
    const game = new Chess();
    game.move('f3'); game.move('e5');
    const data = investigation(game.fen(), ['g2g3','d7d5'], ['g2g4','d8h4']);
    const insight = extractTacticalEvidence(data, 'w');
    expect(insight[0]).toMatchObject({ kind: 'mate', confidence: 'board-confirmed', step: 1 });
    expect(insight[0].detail).toContain('Qh4');
  });

  it('spots a material swing only when material really changes in the shown line', () => {
    const fen = '6k1/8/8/8/8/8/r7/R5K1 w - - 0 1';
    const data = investigation(fen, ['a1a2'], ['g1h1','a2a1']);
    expect(data.played.steps.map(step => step.san)).toHaveLength(2);
    const items = extractTacticalEvidence(data, 'w');
    expect(items.find(item => item.kind === 'material')?.detail).toContain('rook');
    expect(items.find(item => item.kind === 'material')?.confidence).toBe('engine-shown');
  });

  it('does not mistake an ordinary rook trade followed by recapture for material lost', () => {
    const fen = '6k1/8/8/8/8/8/rB6/R5K1 b - - 0 1';
    const data = investigation(fen, ['a2a3','g1f1'], ['a2a1','b2a1']);
    expect(data.played.steps.map(s => s.san)).toHaveLength(2);
    expect(extractTacticalEvidence(data, 'b').some(item => item.kind === 'material')).toBe(false);
  });

  it('separates a knight double attack in the played line from a line without one', () => {
    const fen = '2q4k/1r6/8/5N2/8/8/8/7K b - - 0 1';
    const played = investigation(fen, ['c8c6','f5d6'], ['h8g8','f5d6']);
    const item = extractTacticalEvidence(played, 'b').find(x => x.kind === 'fork');
    expect(item?.detail).toContain('queen on c8');
    expect(item?.detail).toContain('rook on b7');
    const without = investigation(fen, ['c8c6','f5d6'], ['h8g8','f5e3']);
    expect(extractTacticalEvidence(without, 'b').some(x => x.kind === 'fork')).toBe(false);
  });

  it('checks an absolute pin along a clear ray, not through a second blocker', () => {
    expect(findAbsolutePins('4k3/4n3/8/8/8/8/8/4R1K1 w - - 0 1','b'))
      .toContainEqual({ attacker: 'e1', pinned: 'e7', king: 'e8', targetColor: 'b' });
    expect(findAbsolutePins('4k3/4n3/4p3/8/8/8/8/4R1K1 w - - 0 1','b')).toEqual([]);
  });

  it('reports a newly introduced pin as observed, not a proven evaluation cause', () => {
    const fen = 'r5k1/8/8/8/8/8/4N2P/4K3 w - - 0 1';
    const data = investigation(fen, ['h2h4','a8a7'], ['h2h3','a8e8']);
    const pin = extractTacticalEvidence(data, 'w').find(x => x.kind === 'pin');
    expect(pin?.squares).toEqual(['e8','e2','e1']);
    expect(pin?.detail).toContain('not that it caused');
  });

  it('refuses explanation when a stored PV has inconsistent move/FEN evidence', () => {
    const fen = new Chess().fen();
    const data = investigation(fen, ['e2e4','e7e5'], ['g1f3','d7d5']);
    data.played.steps[1].fen = 'not-a-real-position';
    expect(extractTacticalEvidence(data, 'w')).toEqual([]);
  });
});
