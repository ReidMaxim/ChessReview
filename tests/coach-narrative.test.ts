import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/lib/game-review';
import { parsePgn } from '../src/lib/pgn';
import { composeCoachNarrative } from '../src/lib/coach-narrative';
import { replayEngineLine } from '../src/lib/coach-intelligence';
import type { InvestigationLine, InvestigationResult } from '../src/lib/investigation';

const cp = (value:number) => ({kind:'cp' as const,value});
function deep(fen:string,best:string[],played:string[]):InvestigationResult {
  const line=(pv:string[]):InvestigationLine=>({rank:1,depth:14,score:cp(0),bound:'exact',
    rootFen:fen,pv,steps:replayEngineLine(fen,pv,16)});
  return {rootFen:fen,playedUci:played[0],best:line(best),played:line(played),
    alternatives:[],requestedDepth:14,elapsedMs:1800};
}
function review(pgn:string, best:string[],scores:number[]) {
  const game=parsePgn(pgn);
  const report=buildReport(game,8,scores.map(cp),best,game.moves.length+1);
  return {game,report};
}

describe('Phase 10C — honest, human-readable coaching',()=>{
  it('leads with a legally verified immediate mate and links the exact evidence step',()=>{
    const {game,report}=review('1. f3 e5 2. g4 Qh4# 0-1',
      ['f2f3','e7e5','g2g4','d8h4',null as unknown as string],[0,0,0,-430,-1500]);
    const result=deep(game.positions[2],['g2g3','d7d5'],['g2g4','d8h4']);
    const story=composeCoachNarrative(game,report,3,result);
    expect(story?.status).toBe('board-confirmed');
    expect(story?.headline).toContain('checkmate');
    expect(story?.explanation).toContain('Qh4#');
    expect(story?.evidenceStep).toBe(1);
    expect(story?.takeaway).toContain('Replay');
  });

  it('never claims a tactic when a deeper investigation shows none',()=>{
    const {game,report}=review('1. e4 e5 *',['e2e4','c7c5',null as unknown as string],[30,20,110]);
    const result=deep(game.positions[1],['c7c5','g1f3'],['e7e5','g1f3']);
    const story=composeCoachNarrative(game,report,2,result);
    expect(story?.status).toBe('no-clear-tactic');
    expect(story?.explanation).toContain('prefers c5');
    expect(story?.explanation).not.toMatch(/fork|pins|wins a queen/i);
  });

  it('credits a played move if deeper Stockfish agrees despite a shallow classification',()=>{
    const {game,report}=review('1. e4 e5 *',['e2e4','c7c5',null as unknown as string],[0,0,300]);
    const result=deep(game.positions[1],['e7e5','g1f3'],['e7e5','g1f3']);
    const story=composeCoachNarrative(game,report,2,result);
    expect(story?.status).toBe('engine-agrees');
    expect(story?.headline).toContain('first choice');
    expect(story?.explanation).not.toContain('mistake');
  });

  it('does not trust an investigation belonging to a different PGN position',()=>{
    const {game,report}=review('1. e4 e5 *',['e2e4','c7c5',null as unknown as string],[0,0,200]);
    const unrelated=deep(new Chess().fen(),['e2e4','e7e5'],['d2d4','d7d5']);
    const story=composeCoachNarrative(game,report,2,unrelated);
    expect(story?.source).toBe('quick');
    expect(story?.explanation).toContain('quick review');
  });

  it('does not invent a reason based only on a shallow score change',()=>{
    const {game,report}=review('1. e4 e5 *',['e2e4','c7c5',null as unknown as string],[0,0,260]);
    const story=composeCoachNarrative(game,report,2);
    expect(story?.status).toBe('quick-review');
    expect(story?.explanation).toContain('cannot yet establish the chess reason');
    expect(story?.explanation).not.toMatch(/loses a rook|king safety|fork/i);
  });

  it('declines to analyze partially reviewed positions',()=>{
    const {game}=review('1. e4 e5 *',['e2e4','c7c5',null as unknown as string],[0,0,250]);
    const partial=buildReport(game,8,[cp(0),cp(0),null],['e2e4',null,null],2);
    expect(composeCoachNarrative(game,partial,2)).toBeNull();
  });

  it('describes a pin as evidence but refuses to present it as the established cause',()=>{
    const {game,report}=review('[SetUp "1"] [FEN "r5k1/8/8/8/8/8/4N2P/4K3 w - - 0 1"] 1. h3 Re8 *',
      ['h2h4','a8e8',null as unknown as string],[0,-80,-130]);
    const result=deep(game.positions[0],['h2h4','a8a7'],['h2h3','a8e8']);
    const story=composeCoachNarrative(game,report,1,result);
    expect(story?.status).toBe('engine-shown');
    expect(story?.headline).toContain('pinned');
    expect(story?.explanation).toContain('not that it caused');
  });
});
