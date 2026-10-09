import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { replayEngineLine } from './coach-intelligence';
import type { InvestigationResult } from './investigation';

const points: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const opposite = (color: Color): Color => color === 'w' ? 'b' : 'w';
const playerName = (color: Color) => color === 'w' ? 'White' : 'Black';
const capturedValue: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

export type TacticalEvidence = {
  kind: 'mate' | 'material' | 'fork' | 'pin';
  confidence: 'board-confirmed' | 'engine-shown';
  headline: string;
  detail: string;
  line: 'played';
  /** Zero-based index of the proving legal move, including played move. */
  step: number;
  squares: Square[];
};
export type AbsolutePin = { attacker: Square; pinned: Square; king: Square; targetColor: Color };

function square(file: number, rank: number): Square | null {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8
    ? (String.fromCharCode(97 + file) + String(rank + 1)) as Square : null;
}
function coords(s: Square): [number, number] {
  return [s.charCodeAt(0) - 97, Number(s[1]) - 1];
}

/** An uninterrupted king -> friendly piece -> enemy slider ray. Pure geometry. */
export function findAbsolutePins(fen: string, targetColor: Color): AbsolutePin[] {
  let board: Chess;
  try { board = new Chess(fen); } catch { return []; }
  let king: Square | null = null;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const sq = square(x, y)!;
    const piece = board.get(sq);
    if (piece?.type === 'k' && piece.color === targetColor) king = sq;
  }
  if (!king) return [];
  const [kx, ky] = coords(king);
  const pins: AbsolutePin[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let file = kx + dx, rank = ky + dy, pinned: Square | null = null;
    while (true) {
      const sq = square(file, rank);
      if (!sq) break;
      const piece = board.get(sq);
      if (piece) {
        if (!pinned) {
          if (piece.color !== targetColor || piece.type === 'k') break;
          pinned = sq;
        } else {
          const straight = dx === 0 || dy === 0;
          if (piece.color !== targetColor &&
              (piece.type === 'q' || (straight && piece.type === 'r') || (!straight && piece.type === 'b'))) {
            pins.push({ attacker: sq, pinned, king, targetColor });
          }
          break;
        }
      }
      file += dx; rank += dy;
    }
  }
  return pins;
}

function materialBalance(fen: string, perspective: Color): number {
  const board = new Chess(fen);
  return board.board().flat().reduce((value, piece) =>
    value + (piece ? points[piece.type] * (piece.color === perspective ? 1 : -1) : 0), 0);
}

export function isVerifiedInvestigation(result: InvestigationResult): boolean {
  if (result.best.rootFen !== result.rootFen || result.played.rootFen !== result.rootFen ||
      result.played.pv[0] !== result.playedUci) return false;
  for (const line of [result.best, result.played]) {
    const replay = replayEngineLine(result.rootFen, line.pv, 16);
    if (!replay.length || replay.length !== line.pv.length ||
        replay.some((step, i) => step.fen !== line.steps[i]?.fen)) return false;
  }
  return true;
}

/**
 * Compares legally replayed lines from one common root.
 * Reports an observation, never "this mistake forces a win" without proof.
 */
export function extractTacticalEvidence(result: InvestigationResult, mover: Color): TacticalEvidence[] {
  if (!isVerifiedInvestigation(result)) return [];
  const enemy = opposite(mover);
  const enemyName = playerName(enemy);
  const played = result.played.steps, best = result.best.steps;
  const evidence: TacticalEvidence[] = [];

  const opponentMatedInBest = best.some(s => s.checkmate && s.player === enemyName);
  const mateIndex = played.findIndex((s, i) => i > 0 && s.player === enemyName && s.checkmate);
  if (mateIndex >= 0 && !opponentMatedInBest) {
    const move = played[mateIndex];
    const immediate = mateIndex === 1;
    evidence.push({
      kind: 'mate', confidence: immediate ? 'board-confirmed' : 'engine-shown',
      headline: immediate ? 'That move allows checkmate immediately.' : 'The displayed continuation ends in checkmate.',
      detail: immediate
        ? enemyName + ' can respond with ' + move.san + '. That legal reply is checkmate.'
        : enemyName + ' ends this demonstrated engine line with ' + move.san +
          '. Other continuations may be possible.',
      line: 'played', step: mateIndex,
      squares: [move.from as Square, move.to as Square],
    });
  }

  // A raw capture is not material won: count the final inventory AFTER recaptures.
  // Because the lines can have different horizons, label all comparisons illustrative.
  const startMaterial = materialBalance(result.rootFen, enemy);
  const playedGain = materialBalance(played[played.length - 1].fen, enemy) - startMaterial;
  const bestGain = materialBalance(best[best.length - 1].fen, enemy) - startMaterial;
  if (playedGain >= 3 && playedGain - bestGain >= 3 && mateIndex === -1) {
    const captures = played.map((step, i) => ({ step, i }))
      .filter(({ step }) => step.player === enemyName && step.captured)
      .sort((a, b) => (capturedValue[b.step.captured ?? ''] ?? 0) - (capturedValue[a.step.captured ?? ''] ?? 0));
    const capture = captures[0];
    if (capture) evidence.push({
      kind: 'material', confidence: 'engine-shown',
      headline: 'The displayed continuation ends worse in material.',
      detail: enemyName + ' captures a ' + capture.step.captured + ' with ' + capture.step.san +
        '. By the end of the displayed sequence, ' + enemyName + ' has improved its material balance by ' +
        playedGain + ' points relative to the start; the alternative does not show the same loss. This is not a guarantee of a forced material win.',
      line: 'played', step: capture.i,
      squares: [capture.step.from as Square, capture.step.to as Square],
    });
  }

  // A double attack is observable. It is not necessarily a successful fork.
  for (let i = 1; i < played.length; i++) {
    const step = played[i];
    if (step.player !== enemyName || step.fork.length < 2) continue;
    const next = played[i + 1];
    const knightImmediatelyTaken = next?.captured === 'knight' && next.to === step.to;
    const appearsInBest = best.some(s => s.player === enemyName && s.to === step.to && s.fork.length >= 2);
    if (knightImmediatelyTaken || appearsInBest) continue;
    evidence.push({
      kind: 'fork', confidence: 'engine-shown',
      headline: 'A knight double attack appears in the line.',
      detail: 'After ' + step.san + ', ' + enemyName + "'s knight attacks " +
        step.fork.slice(0, 2).join(' and ') + '. This does not establish that material is won.',
      line: 'played', step: i, squares: [step.to as Square],
    });
    break;
  }

  // A pin is a verifiable geometry fact, not automatically the cause of a blunder.
  const originalPins = findAbsolutePins(result.rootFen, mover);
  const bestPins = findAbsolutePins(best[0].fen, mover);
  for (let i = 1; i < played.length; i++) {
    const step = played[i];
    if (step.player !== enemyName) continue;
    const newPin = findAbsolutePins(step.fen, mover).find(pin =>
      !originalPins.some(p => p.attacker === pin.attacker && p.pinned === pin.pinned) &&
      !bestPins.some(p => p.attacker === pin.attacker && p.pinned === pin.pinned));
    if (newPin) {
      evidence.push({
        kind: 'pin', confidence: 'engine-shown',
        headline: 'An absolute pin appears in the continuation.',
        detail: 'After ' + step.san + ', a ' + enemyName + ' piece on ' + newPin.attacker +
          ' pins the piece on ' + newPin.pinned + ' to its king on ' + newPin.king +
          '. The board confirms the pin, but not that it caused the evaluation change.',
        line: 'played', step: i,
        squares: [newPin.attacker, newPin.pinned, newPin.king],
      });
      break;
    }
  }
  return evidence.slice(0, 3);
}
