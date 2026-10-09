import type { Analysis } from './engine-utils';

/**
 * Bounded, depth-exact cache. A result for depth 8 must never pretend
 * to be a completed depth-16 calculation.
 */
export class PositionAnalysisCache {
  private entries = new Map<string, Analysis>();
  constructor(private limit = 96) {}
  private key(fen: string, depth: number): string { return depth + '|' + fen; }
  get(fen: string, depth: number): Analysis | null {
    const key = this.key(fen, depth);
    const result = this.entries.get(key);
    if (!result) return null;
    this.entries.delete(key);
    this.entries.set(key, result);
    return { ...result, pv: [...result.pv] };
  }
  put(analysis: Analysis, requestedDepth: number): void {
    if (!analysis.complete || analysis.depth < requestedDepth || this.limit <= 0) return;
    const key = this.key(analysis.fen, requestedDepth);
    this.entries.delete(key);
    this.entries.set(key, { ...analysis, pv: [...analysis.pv] });
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
  get size() { return this.entries.size; }
}
