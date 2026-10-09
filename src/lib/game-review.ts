import { Chess } from 'chess.js';
import type { GameRecord, GameMove } from './pgn';
import { StockfishClient } from './engine';
import type { Analysis, Score } from './engine-utils';

export type Quality = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
export type ReviewRow = {
  ply: number;
  san: string;
  color: 'w' | 'b';
  score: Score;
  loss: number;
  quality: Quality;
};
export type ReviewReport = {
  depth: number;
  scores: (Score | null)[];
  bestMoves: (string | null)[];
  /** Principal variations in UCI format, rooted at each indexed game position. */
  variations: string[][];
  rows: ReviewRow[];
  completed: number;
  total: number;
};

/** The graph clamps large wins, and uses White-positive centipawn scores. */
export function scoreToCp(score: Score): number {
  if (score.kind === 'cp') return score.value;
  // A forced mate is categorically more decisive than a centipawn advantage.
  return score.value >= 0 ? 1500 : -1500;
}

export function scoreToGraph(score: Score): number {
  return Math.max(-5, Math.min(5, scoreToCp(score) / 100));
}

function isBest(move: GameMove, uci: string | null): boolean {
  if (!uci || uci.slice(0, 4) !== move.from + move.to) return false;
  const promotion = move.san.match(/=([QRBN])/i)?.[1].toLowerCase();
  return uci.length === 4 ? !promotion : uci[4] === promotion;
}

/**
 * This deliberately uses simple, transparent centipawn-loss buckets.
 * They are not Chess.com's proprietary Game Review classifications.
 */
export function classifyMove(before: Score, after: Score, move: GameMove, bestUci: string | null): ReviewRow {
  const difference = (scoreToCp(before) - scoreToCp(after)) * (move.color === 'w' ? 1 : -1);
  const loss = Math.max(0, Math.round(difference));
  const quality: Quality = isBest(move, bestUci) ? 'Best' :
    loss < 50 ? 'Good' : loss < 130 ? 'Inaccuracy' : loss < 260 ? 'Mistake' : 'Blunder';
  return {
    ply: (move.number - 1) * 2 + (move.color === 'w' ? 1 : 2),
    san: move.san, color: move.color, score: after, loss, quality,
  };
}

/** A final mate or drawn position requires no engine search. */
export function terminalScore(fen: string): Score | null {
  const position = new Chess(fen);
  if (position.isCheckmate()) {
    return { kind: 'mate', value: position.turn() === 'w' ? -1 : 1 };
  }
  if (position.isDraw()) return { kind: 'cp', value: 0 };
  return null;
}

export function buildReport(game: GameRecord, depth: number, scores: (Score | null)[], bestMoves: (string | null)[], completed: number, variations: string[][] = []): ReviewReport {
  const rows: ReviewRow[] = [];
  for (let i = 1; i <= completed; i++) {
    const before = scores[i - 1];
    const after = scores[i];
    if (before && after) rows.push(classifyMove(before, after, game.moves[i - 1], bestMoves[i - 1]));
  }
  return { depth, scores: scores.slice(), bestMoves: bestMoves.slice(), variations: variations.map(line => line.slice()), rows, completed, total: game.moves.length + 1 };
}

/**
 * Analyze positions 0..N in sequence. On-demand only; no polling or APIs.
 * Worker reuse keeps WASM initialization to one time per review.
 */
export class GameReviewSession {
  private engine: StockfishClient | null = null;
  private stopped = false;
  private index = 0;
  private mostRecent: Analysis | null = null;
  private scores: (Score | null)[];
  private bestMoves: (string | null)[];
  private variations: string[][];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private game: GameRecord,
    private depth: number,
    private callbacks: {
      onProgress: (report: ReviewReport) => void;
      onComplete: (report: ReviewReport) => void;
      onError: (message: string) => void;
    },
  ) {
    this.scores = Array(game.positions.length).fill(null);
    this.bestMoves = Array(game.positions.length).fill(null);
    this.variations = Array.from({ length: game.positions.length }, () => []);
  }

  start() {
    if (this.stopped || this.engine) return;
    try {
      this.engine = new StockfishClient({
        onAnalysis: latest => {
          if (!this.stopped && latest && latest.fen === this.game.positions[this.index]) this.mostRecent = latest;
        },
        onState: (state, message) => {
          if (this.stopped) return;
          if (state === 'complete') this.finishPosition();
          if (state === 'error') this.fail(message || 'Stockfish failed to analyze the game.');
        },
      });
      this.analyzePosition();
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Could not start the game review.');
    }
  }

  private analyzePosition() {
    if (this.stopped) return;
    if (this.index >= this.game.positions.length) {
      const report = this.report();
      this.cancel();
      this.callbacks.onComplete(report);
      return;
    }
    this.mostRecent = null;
    const fen = this.game.positions[this.index];
    const terminal = terminalScore(fen);
    if (terminal) {
      this.scores[this.index] = terminal;
      this.bestMoves[this.index] = null;
      this.index++;
      this.callbacks.onProgress(this.report());
      this.analyzePosition();
      return;
    }
    this.timer = setTimeout(() => this.fail('This position took too long. Try a lower review depth.'), 45000);
    this.engine?.analyze(fen, this.depth);
  }

  private finishPosition() {
    if (this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.mostRecent) {
      this.fail('Stockfish returned no score for one position. Please retry the review.');
      return;
    }
    this.scores[this.index] = this.mostRecent.score;
    this.bestMoves[this.index] = this.mostRecent.pv[0] ?? null;
    this.variations[this.index] = this.mostRecent.pv.slice(0, 16);
    this.index++;
    this.callbacks.onProgress(this.report());
    this.analyzePosition();
  }

  private report() {
    return buildReport(this.game, this.depth, this.scores, this.bestMoves, this.index, this.variations);
  }

  private fail(message: string) {
    if (this.stopped) return;
    this.cancel();
    this.callbacks.onError(message);
  }

  cancel() {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.engine?.dispose();
    this.engine = null;
  }
}
