import { parseUciInfo, type Analysis } from './engine-utils';

export type EngineState = 'loading' | 'ready' | 'analyzing' | 'complete' | 'paused' | 'error';
type Request = { fen: string; depth: number; cancelled: boolean; latest: Analysis | null };
type Callbacks = {
  onState: (state: EngineState, message?: string) => void;
  onAnalysis: (result: Analysis | null) => void;
};

/**
 * One browser Worker, UCI searches serialized. When switching positions,
 * stop the old search and wait for its bestmove before analyzing the next.
 */
export class StockfishClient {
  private worker: Worker;
  private ready = false;
  private active: Request | null = null;
  private queued: { fen: string; depth: number } | null = null;
  private closed = false;

  constructor(private callbacks: Callbacks) {
    try {
      this.worker = new Worker(import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js');
    } catch {
      throw new Error('Your browser could not start the Stockfish worker.');
    }
    this.worker.onmessage = event => {
      if (typeof event.data !== 'string') return;
      for (const line of event.data.split(/\r?\n/)) this.handle(line.trim());
    };
    this.worker.onerror = event => {
      event.preventDefault();
      if (this.closed) return;
      this.callbacks.onState('error', 'Stockfish could not load; check your browser and try reloading.');
      this.dispose();
    };
    this.callbacks.onState('loading');
    this.worker.postMessage('uci');
  }

  private handle(line: string) {
    if (this.closed) return;
    if (line === 'uciok') {
      this.worker.postMessage('isready');
      return;
    }
    if (line === 'readyok') {
      this.ready = true;
      this.callbacks.onState('ready');
      this.runQueued();
      return;
    }
    if (line.startsWith('info ') && this.active && !this.active.cancelled) {
      const info = parseUciInfo(line, this.active.fen);
      if (info && (!this.active.latest || info.depth >= this.active.latest.depth)) {
        this.active.latest = { ...info, fen: this.active.fen, complete: false };
        this.callbacks.onAnalysis(this.active.latest);
      }
      return;
    }
    if (line.startsWith('bestmove ') && this.active) {
      const finished = this.active;
      this.active = null;
      if (!finished.cancelled) {
        if (finished.latest) this.callbacks.onAnalysis({ ...finished.latest, complete: true });
        this.callbacks.onState('complete');
      }
      this.runQueued();
    }
  }

  private runQueued() {
    if (!this.ready || this.closed || this.active || !this.queued) return;
    const { fen, depth } = this.queued;
    this.queued = null;
    this.active = { fen, depth, cancelled: false, latest: null };
    this.worker.postMessage('position fen ' + fen);
    this.worker.postMessage('go depth ' + depth);
    this.callbacks.onState('analyzing');
  }

  analyze(fen: string, depth: number) {
    if (this.closed) return;
    this.queued = { fen, depth };
    this.callbacks.onAnalysis(null);
    if (this.active && !this.active.cancelled) {
      this.active.cancelled = true;
      this.worker.postMessage('stop');
    }
    this.runQueued();
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    this.active = null;
    this.queued = null;
  }
}
