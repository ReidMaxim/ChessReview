
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { parseUciInfo, formatScore, variationSan } from '../src/lib/engine-utils';
describe('UCI normalization', () => {
  const initial = new Chess().fen();
  const afterE4 = (() => { const c = new Chess(); c.move('e4'); return c.fen(); })();
  it('reports white-perspective scores after each side', () => {
    expect(parseUciInfo('info depth 8 score cp 25 pv e2e4 e7e5',initial)?.score.value).toBe(25);
    expect(parseUciInfo('info depth 8 score cp 25 pv e7e5 g1f3',afterE4)?.score.value).toBe(-25);
    expect(parseUciInfo('info depth 9 score mate -2 pv e7e5 g1f3',afterE4)?.score.value).toBe(2);
  });
  it('discards invalid telemetry and prints SAN', () => {
    expect(parseUciInfo('info depth 8 nodes 4096',initial)).toBeNull();
    expect(variationSan(initial,['e2e4','e7e5','g1f3'])).toBe('e4 e5 Nf3');
    expect(formatScore({kind:'cp',value:-45})).toBe('-0.45');
  });
});
