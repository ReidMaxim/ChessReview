import { Chess } from 'chess.js';

export type Score = { kind: 'cp' | 'mate'; value: number };
export type EngineInfo = { depth: number; score: Score; pv: string[] };
export type Analysis = EngineInfo & { fen: string; complete: boolean };

/** Normalize UCI scores to White's perspective, regardless of who moves. */
export function parseUciInfo(line: string, fen: string): EngineInfo | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const multi = line.match(/\bmultipv\s+(\d+)/);
  if (multi && multi[1] !== '1') return null;
  const depth = line.match(/\bdepth\s+(\d+)/);
  const score = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvStart = line.match(/\bpv\s+(.+)$/);
  if (!depth || !score || !pvStart) return null;
  const pv = pvStart[1].split(/\s+/).filter(v => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(v));
  if (!pv.length) return null;
  return {
    depth: Number(depth[1]),
    score: {
      kind: score[1] as Score['kind'],
      value: Number(score[2]) * (fen.split(' ')[1] === 'b' ? -1 : 1),
    },
    pv,
  };
}
export function formatScore(score: Score) {
  if (score.kind === 'mate') return score.value === 0 ? 'Mate' : score.value > 0
    ? 'White mate in ' + score.value : 'Black mate in ' + Math.abs(score.value);
  return (score.value >= 0 ? '+' : '') + (score.value / 100).toFixed(2);
}
export function scoreDescription(score: Score) {
  if (score.kind === 'mate') return 'Forced mate (engine estimate)';
  if (score.value >= 50) return 'White advantage';
  if (score.value <= -50) return 'Black advantage';
  return 'Approximately equal';
}
export function variationSan(fen: string, pv: string[], limit = 8) {
  try {
    const chess = new Chess(fen);
    const labels: string[] = [];
    for (const move of pv.slice(0, limit)) {
      const result = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      if (!result) break;
      labels.push(result.san);
    }
    return labels.join(' ');
  } catch { return ''; }
}
