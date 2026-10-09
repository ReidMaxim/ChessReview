import { Chess, type Square } from 'chess.js';
import type { GameRecord } from './pgn';
import type { ReviewReport } from './game-review';
import type { InvestigationResult } from './investigation';

const pieceName: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};
const pieceValue: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export type LineStep = {
  uci: string;
  san: string;
  fen: string;
  from: string;
  to: string;
  player: 'White' | 'Black';
  piece: string;
  captured: string | null;
  check: boolean;
  checkmate: boolean;
  promoted: string | null;
  fork: string[]; // Verified knight attacks; not necessarily winning.
};

export type CoachLine = {
  startFen: string;
  steps: LineStep[];
  label: 'alternative' | 'consequence';
};

function knightTargets(chess: Chess, to: string, color: 'w' | 'b'): string[] {
  const file = to.charCodeAt(0) - 97;
  const rank = Number(to[1]) - 1;
  const targets: string[] = [];
  for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) {
    const x = file + dx, y = rank + dy;
    if (x < 0 || x > 7 || y < 0 || y > 7) continue;
    const square = (String.fromCharCode(97 + x) + (y + 1)) as Square;
    const target = chess.get(square);
    if (target && target.color !== color && pieceValue[target.type] >= 3) {
      targets.push(pieceName[target.type] + ' on ' + square);
    }
  }
  return targets;
}

/**
 * Only replay legal UCI moves. Engine PVs may be incomplete / shortened;
 * stop at the first illegality rather than display an invented continuation.
 */
export function replayEngineLine(fen: string, pv: string[] = [], limit = 10): LineStep[] {
  const chess = new Chess(fen);
  const steps: LineStep[] = [];
  for (const uci of pv.slice(0, limit)) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch { break; }
    if (!move) break;
    const fork = move.piece === 'n' ? knightTargets(chess, move.to, move.color) : [];
    steps.push({
      uci, san: move.san, fen: chess.fen(),
      from: move.from, to: move.to,
      player: move.color === 'w' ? 'White' : 'Black',
      piece: pieceName[move.piece], captured: move.captured ? pieceName[move.captured] : null,
      check: chess.inCheck(), checkmate: chess.isCheckmate(),
      promoted: move.promotion ? pieceName[move.promotion] : null,
      fork: fork.length >= 2 ? fork : [],
    });
    if (chess.isGameOver()) break;
  }
  return steps;
}

export function coachLines(game: GameRecord, report: ReviewReport, ply: number, investigation?: InvestigationResult | null): {
  alternative: CoachLine; consequence: CoachLine;
} | null {
  if (ply < 1 || ply > game.moves.length || ply >= report.completed) return null;
  const alternativeFen = game.positions[ply - 1];
  const consequenceFen = game.positions[ply];
  // A completed investigation compares these continuations from the SAME
  // pre-move root. Remove the played move before replaying the opponent
  // response from the resulting FEN.
  const matched = investigation?.rootFen === alternativeFen &&
    investigation.playedUci === game.moves[ply - 1].from + game.moves[ply - 1].to +
      (game.moves[ply - 1].san.match(/=([QRBN])/i)?.[1]?.toLowerCase() ?? '');
  const before = matched ? investigation.best.pv : report.variations[ply - 1] ?? [];
  const after = matched ? investigation.played.pv.slice(1) : report.variations[ply] ?? [];
  return {
    alternative: { startFen: alternativeFen, label: 'alternative', steps: replayEngineLine(alternativeFen, before) },
    consequence: { startFen: consequenceFen, label: 'consequence', steps: replayEngineLine(consequenceFen, after) },
  };
}

export type Consequence = { headline: string; description: string; kind: string };

export function describeConsequence(game: GameRecord, ply: number, line: LineStep[]): Consequence {
  const played = game.moves[ply - 1];
  const opponent = played.color === 'w' ? 'Black' : 'White';
  const opponentSteps = line.filter(step => step.player === opponent);
  const first = line[0];
  if (!first) {
    return {
      headline: 'No continuation saved yet.',
      description: 'We have an evaluation, but not enough engine moves to explain the follow-up. Try a deeper look.',
      kind: 'insufficient',
    };
  }
  if (first.checkmate && first.player === opponent) {
    return {
      headline: 'That allows an immediate checkmate.',
      description: opponent + ' can play ' + first.san + ' right away. The position on the board confirms checkmate.',
      kind: 'mate',
    };
  }
  const fork = opponentSteps.find(step => step.fork.length >= 2);
  if (fork) {
    return {
      headline: 'A knight fork appears in the engine line.',
      description: 'After ' + fork.san + ', ' + opponent + '’s knight attacks ' +
        fork.fork.slice(0, 2).join(' and ') + '. This is a verified attack pattern, not proof that material is lost.',
      kind: 'fork',
    };
  }
  const mate = opponentSteps.find(step => step.checkmate);
  if (mate) {
    return {
      headline: 'The shown continuation ends in checkmate.',
      description: opponent + ' delivers checkmate with ' + mate.san + ' in this sample engine line. The engine may find other defenses or continuations at greater depth.',
      kind: 'mate',
    };
  }
  const capture = opponentSteps.find(step => step.captured && pieceValue[
    Object.keys(pieceName).find(key => pieceName[key] === step.captured) ?? 'p'
  ] >= 3);
  if (capture) {
    return {
      headline: 'A valuable piece gets captured in the engine line.',
      description: opponent + ' plays ' + capture.san + ', capturing a ' + capture.captured +
        '. Follow the line to see what happens next—this alone does not establish a net material loss.',
      kind: 'material',
    };
  }
  const check = opponentSteps.find(step => step.check);
  if (check) {
    return {
      headline: 'The opponent can respond with check.',
      description: 'The analyzed line includes ' + opponent + '’s ' + check.san +
        '. A check forces a response, but it does not automatically win material.',
      kind: 'check',
    };
  }
  return {
    headline: 'The engine sees a better continuation.',
    description: 'One line starts ' + first.san + '. Step through the sequence below to see how the position develops. A numerical evaluation alone cannot prove the tactical reason.',
    kind: 'positional',
  };
}

/** Match the actual move against the engine’s first best reply without SAN guesses. */
export function moveMatchesLine(game: GameRecord, ply: number, bestLine: LineStep[]): boolean {
  const actual = game.moves[ply - 1];
  const first = bestLine[0];
  return Boolean(actual && first && actual.from === first.from && actual.to === first.to &&
    (actual.san.match(/=([QRBN])/i)?.[1].toLowerCase() ?? '') === (first.uci[4] ?? ''));
}
