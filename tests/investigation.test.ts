import { describe, expect, it, vi } from 'vitest';
import { parseInvestigationInfo, validateInvestigationLine, validateInvestigationMove, InvestigationSession } from '../src/lib/investigation';
import { Chess } from 'chess.js';

const start = new Chess().fen();
const black = new Chess().move('e4'); // use a real Black-to-move FEN below
const blackFen = (() => { const c = new Chess(); c.move('e4'); return c.fen(); })();
void black;

describe('Phase 10A UCI evidence parsing', () => {
  it('keeps independent ranks, mate scores, depth and bound flags', () => {
    const a = parseInvestigationInfo('info depth 12 multipv 2 score cp -42 upperbound nodes 123 pv d2d4 d7d5',start);
    expect(a).toMatchObject({rank:2,depth:12,score:{kind:'cp',value:-42},bound:'upper',pv:['d2d4','d7d5']});
    const mate = parseInvestigationInfo('info depth 17 score mate -3 lowerbound pv e7e5 g1f3',blackFen);
    expect(mate).toMatchObject({rank:1,depth:17,score:{kind:'mate',value:3},bound:'lower'});
    expect(parseInvestigationInfo('info depth 9 score cp 27 nodes 99',start)).toBeNull();
  });

  it('validates the played move and truncates illegal engine tails', () => {
    expect(validateInvestigationMove(start,'e2e4')).toBe(true);
    expect(validateInvestigationMove(start,'e2e5')).toBe(false);
    const parsed = parseInvestigationInfo('info depth 12 multipv 1 score cp 30 pv e2e4 e7e5 h1h8 d2d4',start)!;
    const line = validateInvestigationLine(start,parsed);
    expect(line?.steps.map(x=>x.san)).toEqual(['e4','e5']);
    expect(validateInvestigationLine(start,parsed,'d2d4')).toBeNull();
  });
});

class MockWorker {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: string[] = [];
  terminated = false;
  postMessage(message: string) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  emit(message: string) { this.onmessage?.({data:message} as MessageEvent<string>); }
}

describe('Phase 10A serialized investigation', () => {
  it('waits for UCI readiness, compares shared-root best and forced played move', () => {
    const worker = new MockWorker();
    const onComplete = vi.fn(), onError = vi.fn(), onProgress = vi.fn();
    const session = new InvestigationSession(start,'g1f3',{onComplete,onError,onProgress},
      {depth:12,movetimeMs:1000,multiPv:2},()=>worker as unknown as Worker);
    session.start();
    expect(worker.sent).toEqual(['uci']);
    worker.emit('uciok');
    expect(worker.sent.slice(-2)).toEqual(['setoption name MultiPV value 2','isready']);
    worker.emit('readyok');
    expect(worker.sent.at(-1)).toBe('go depth 12 movetime 1000');
    worker.emit('info depth 9 multipv 1 score cp 30 pv e2e4 e7e5');
    worker.emit('info depth 9 multipv 2 score cp 16 pv d2d4 d7d5');
    worker.emit('bestmove e2e4');
    expect(worker.sent.slice(-2)).toEqual(['setoption name MultiPV value 1','isready']);
    worker.emit('readyok');
    expect(worker.sent.at(-1)).toBe('go depth 12 movetime 1000 searchmoves g1f3');
    worker.emit('info depth 9 multipv 1 score cp -12 pv g1f3 d7d5');
    worker.emit('bestmove g1f3');
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.best.steps[0].san).toBe('e4');
    expect(result.played.steps[0].san).toBe('Nf3');
    expect(result.alternatives[0].steps[0].san).toBe('d4');
    expect(result.best.rootFen).toBe(result.played.rootFen);
    expect(result.played.score.value).toBe(-12);
    expect(worker.terminated).toBe(true);
    session.cancel();
  });

  it('drops stale responses completely after cancellation', () => {
    const worker = new MockWorker();
    const onComplete = vi.fn(), onError=vi.fn(), onProgress=vi.fn();
    const session = new InvestigationSession(start,'g1f3',{onComplete,onError,onProgress},
      {depth:12,movetimeMs:1000,multiPv:2},()=>worker as unknown as Worker);
    session.start();worker.emit('uciok');worker.emit('readyok');
    session.cancel();
    worker.emit('info depth 15 multipv 1 score cp 33 pv e2e4');
    worker.emit('bestmove e2e4');
    expect(worker.terminated).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects forced results that start with a different move', () => {
    const worker=new MockWorker(),onComplete=vi.fn(),onError=vi.fn();
    const session=new InvestigationSession(start,'g1f3',
      {onComplete,onError,onProgress:vi.fn()},
      {depth:10,movetimeMs:1000,multiPv:2},()=>worker as unknown as Worker);
    session.start();worker.emit('uciok');worker.emit('readyok');
    worker.emit('info depth 10 score cp 40 pv e2e4 e7e5');worker.emit('bestmove e2e4');
    worker.emit('readyok');worker.emit('info depth 10 score cp 0 pv d2d4 d7d5');worker.emit('bestmove d2d4');
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('legal continuation'));
  });
});
