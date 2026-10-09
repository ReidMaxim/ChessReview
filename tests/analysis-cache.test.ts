import { describe, it, expect } from 'vitest';
import { PositionAnalysisCache } from '../src/lib/analysis-cache';

const score = (fen: string, depth: number, complete = true) => ({
  fen, depth, complete, score: {kind: 'cp' as const, value: 34}, pv: ['e2e4', 'e7e5'],
});
describe('Depth-correct bounded engine cache', () => {
  it('does not mistake intermediate or shallow analysis for a finished deep result', () => {
    const cache = new PositionAnalysisCache(3);
    cache.put(score('A', 7), 12);
    cache.put(score('B', 12, false), 12);
    expect(cache.size).toBe(0);
    cache.put(score('A', 12), 12);
    expect(cache.get('A', 12)?.score.value).toBe(34);
    expect(cache.get('A', 16)).toBeNull();
  });
  it('keeps only the newest two positions and safely clones PV moves', () => {
    const cache = new PositionAnalysisCache(2);
    cache.put(score('A', 10), 10);
    cache.put(score('B', 10), 10);
    const hit = cache.get('A', 10);
    hit!.pv[0] = 'h2h4';
    expect(cache.get('A', 10)?.pv[0]).toBe('e2e4');
    cache.put(score('C', 10), 10);
    expect(cache.get('B', 10)).toBeNull();
    expect(cache.get('A', 10)).not.toBeNull();
    expect(cache.get('C', 10)).not.toBeNull();
  });
});
