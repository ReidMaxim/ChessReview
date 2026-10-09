import { Chess } from 'chess.js';
import { replayEngineLine, type LineStep } from './coach-intelligence';
import type { Score } from './engine-utils';

/** Short, bounded searches. Only the selected move gets extra CPU time. */
export const INVESTIGATION_PROFILE = {
  depth: 14,
  movetimeMs: 2500,
  multiPv: 2,
} as const;

export type InvestigationStage = 'loading' | 'alternatives' | 'played' | 'verifying';
export type ScoreBound = 'exact' | 'lower' | 'upper';
export type InvestigationLine = {
  rank: number;
  depth: number;
  score: Score;
  bound: ScoreBound;
  rootFen: string;
  pv: string[];
  steps: LineStep[];
};
export type InvestigationResult = {
  rootFen: string;
  playedUci: string;
  best: InvestigationLine;
  alternatives: InvestigationLine[];
  played: InvestigationLine;
  requestedDepth: number;
  elapsedMs: number;
};

export type ParsedInvestigationInfo = {
  rank: number;
  depth: number;
  score: Score;
  bound: ScoreBound;
  pv: string[];
};

/** UCI scores are side-to-move relative. Keep bounds distinct from exact scores. */
export function parseInvestigationInfo(line: string, rootFen: string): ParsedInvestigationInfo | null {
  if (!line.startsWith('info ')) return null;
  const depth = /\bdepth\s+(\d+)/.exec(line);
  const score = /\bscore\s+(cp|mate)\s+(-?\d+)/.exec(line);
  const pv = /\bpv\s+(.+)$/.exec(line);
  if (!depth || !score || !pv) return null;
  const rawMoves = pv[1].trim().split(/\s+/);
  if (!rawMoves.length || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(rawMoves[0])) return null;
  const rank = Number(/\bmultipv\s+(\d+)/.exec(line)?.[1] ?? 1);
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null;
  const scoreSegment = line.slice(score.index + score[0].length, pv.index);
  const bound: ScoreBound = /\blowerbound\b/.test(scoreSegment) ? 'lower'
    : /\bupperbound\b/.test(scoreSegment) ? 'upper' : 'exact';
  const perspective = rootFen.split(/\s+/)[1] === 'b' ? -1 : 1;
  return {
    rank, depth: Number(depth[1]),
    score: { kind: score[1] as Score['kind'], value: Number(score[2]) * perspective },
    bound,
    pv: rawMoves,
  };
}

export function validateInvestigationLine(
  rootFen: string,
  info: ParsedInvestigationInfo,
  expectedFirstMove?: string,
): InvestigationLine | null {
  let valid: LineStep[];
  try { valid = replayEngineLine(rootFen, info.pv, 16); }
  catch { return null; }
  if (!valid.length || (expectedFirstMove && valid[0].uci !== expectedFirstMove)) return null;
  return {
    rank: info.rank, depth: info.depth, score: info.score, bound: info.bound,
    rootFen, pv: valid.map(s => s.uci), steps: valid,
  };
}

/** The investigation only accepts an actual legal move for its root FEN. */
export function validateInvestigationMove(fen: string, uci: string): boolean {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return false;
  try {
    return Boolean(new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    }));
  } catch { return false; }
}

type Callbacks = {
  onProgress: (stage: InvestigationStage) => void;
  onComplete: (result: InvestigationResult) => void;
  onError: (message: string) => void;
};

type Phase = 'initializing' | 'ready-for-best' | 'searching-best' | 'ready-for-played' | 'searching-played';

/**
 * Exclusive investigative worker. Never shares a search stream with live
 * analysis or game review. Dispose on game/ply changes; stale callbacks drop.
 */
export class InvestigationSession {
  private worker: Worker | null = null;
  private phase: Phase = 'initializing';
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private grace: ReturnType<typeof setTimeout> | null = null;
  private latest = new Map<number, ParsedInvestigationInfo>();
  private best: InvestigationLine[] = [];
  private began = 0;

  constructor(
    private rootFen: string,
    private playedUci: string,
    private callbacks: Callbacks,
    private options: { depth: number; movetimeMs: number; multiPv: number } = INVESTIGATION_PROFILE,
    private workerFactory: () => Worker = () =>
      new Worker(import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js'),
  ) {}

  start() {
    if (this.stopped || this.worker) return;
    if (!validateInvestigationMove(this.rootFen, this.playedUci)) {
      this.fail('The selected move is not legal in this position.');
      return;
    }
    this.began = Date.now();
    try {
      const worker = this.workerFactory();
      this.worker = worker;
      worker.onmessage = event => {
        if (typeof event.data !== 'string') return;
        for (const line of event.data.split(/\r?\n/)) this.handle(line.trim());
      };
      worker.onerror = event => {
        event.preventDefault();
        this.fail('Stockfish could not start the deeper investigation.');
      };
      this.callbacks.onProgress('loading');
      this.setTimer(12000, 'Stockfish did not initialize in time.');
      worker.postMessage('uci');
    } catch {
      this.fail('The browser could not initialize Stockfish investigation.');
    }
  }

  private send(command: string) { this.worker?.postMessage(command); }

  private handle(line: string) {
    if (this.stopped) return;
    if (line === 'uciok' && this.phase === 'initializing') {
      this.clearTimers();
      this.phase = 'ready-for-best';
      this.send('setoption name MultiPV value ' + this.options.multiPv);
      this.setTimer(12000, 'Stockfish was not ready to analyze alternatives.');
      this.send('isready');
      return;
    }
    if (line === 'readyok') {
      if (this.phase === 'ready-for-best') this.beginSearch('searching-best');
      else if (this.phase === 'ready-for-played') this.beginSearch('searching-played');
      return;
    }
    if (line.startsWith('info ') && (this.phase === 'searching-best' || this.phase === 'searching-played')) {
      const parsed = parseInvestigationInfo(line, this.rootFen);
      if (!parsed || (this.phase === 'searching-played' && parsed.rank !== 1)) return;
      const previous = this.latest.get(parsed.rank);
      if (!previous || parsed.depth >= previous.depth) this.latest.set(parsed.rank, parsed);
      return;
    }
    if (line.startsWith('bestmove ') && (this.phase === 'searching-best' || this.phase === 'searching-played')) {
      this.clearTimers();
      if (this.phase === 'searching-best') {
        this.best = [...this.latest.values()].map(info => validateInvestigationLine(this.rootFen, info))
          .filter((x): x is InvestigationLine => Boolean(x))
          .sort((a,b) => a.rank - b.rank);
        if (!this.best.some(x => x.rank === 1)) {
          this.fail('Stockfish did not return a valid best-move line.');
          return;
        }
        this.latest.clear();
        this.phase = 'ready-for-played';
        this.send('setoption name MultiPV value 1');
        this.setTimer(12000, 'Stockfish was not ready to examine your move.');
        this.send('isready');
      } else {
        this.callbacks.onProgress('verifying');
        const playedInfo = this.latest.get(1);
        const played = playedInfo && validateInvestigationLine(this.rootFen, playedInfo, this.playedUci);
        if (!played) {
          this.fail('Stockfish did not return a legal continuation of the played move.');
          return;
        }
        const best = this.best.find(x => x.rank === 1);
        if (!best) { this.fail('The best line was lost.'); return; }
        const result: InvestigationResult = {
          rootFen: this.rootFen, playedUci: this.playedUci,
          best, alternatives: this.best.filter(x => x.rank > 1),
          played, requestedDepth: this.options.depth, elapsedMs: Date.now() - this.began,
        };
        this.dispose();
        this.callbacks.onComplete(result);
      }
    }
  }

  private beginSearch(phase: 'searching-best' | 'searching-played') {
    this.clearTimers();
    this.phase = phase;
    this.latest.clear();
    this.callbacks.onProgress(phase === 'searching-best' ? 'alternatives' : 'played');
    this.send('position fen ' + this.rootFen);
    this.send('go depth ' + this.options.depth + ' movetime ' + this.options.movetimeMs +
      (phase === 'searching-played' ? ' searchmoves ' + this.playedUci : ''));
    this.setTimer(this.options.movetimeMs + 5000, 'Stockfish did not finish its search.');
  }

  private setTimer(ms: number, message: string) {
    this.clearTimers();
    this.timer = setTimeout(() => {
      if (this.stopped) return;
      this.send('stop');
      this.grace = setTimeout(() => this.fail(message), 2200);
    }, ms);
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.grace) clearTimeout(this.grace);
    this.timer = null;
    this.grace = null;
  }

  private fail(message: string) {
    if (this.stopped) return;
    this.dispose();
    this.callbacks.onError(message);
  }

  cancel() { this.dispose(); }

  private dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    this.worker?.terminate();
    this.worker = null;
  }
}
