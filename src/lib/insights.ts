import { Chess } from 'chess.js';
import type { GameRecord } from './pgn';
import type { ReviewReport, ReviewRow } from './game-review';
import { formatScore } from './engine-utils';

export type MoveInsight = {
  ply: number;
  heading: string;
  quality: ReviewRow['quality'];
  assessment: string;
  observations: string[];
  comparison: string;
  bestSan: string | null;
  bestUci: string | null;
  sameAsBest: boolean;
  scoreBefore: string;
  scoreAfter: string;
};

export type GameSummary = {
  reviewedMoves: number;
  totalMoves: number;
  critical: number;
  whiteCritical: number;
  blackCritical: number;
  best: number;
  captures: number;
  checks: number;
  turningPoints: ReviewRow[];
  description: string;
  complete: boolean;
};

const names: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop',
  r: 'rook', q: 'queen', k: 'king',
};
const moveLabel = (ply: number, san: string): string =>
  String(Math.ceil(ply / 2)) + (ply % 2 ? '. ' : '... ') + san;

/** Verify every UCI engine suggestion in the *pre-move* position. */
export function validatedBestMove(fen: string, uci: string | null): { san: string; uci: string } | null {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    const move = new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return move ? { san: move.san, uci } : null;
  } catch { return null; }
}

/**
 * Describes only what is demonstrated by the stored engine scores and
 * legal board state. No speculative positional or tactical narratives.
 */
export function buildMoveInsight(game: GameRecord, report: ReviewReport, ply: number): MoveInsight | null {
  if (ply < 1 || ply > game.moves.length || ply >= report.completed) return null;
  const row = report.rows.find(item => item.ply === ply);
  const previous = report.scores[ply - 1];
  const after = report.scores[ply];
  if (!row || !previous || !after) return null;

  const position = new Chess(game.positions[ply - 1]);
  const recorded = game.moves[ply - 1];
  let played;
  try { played = position.move(recorded.san); }
  catch { return null; }

  const player = recorded.color === 'w' ? 'White' : 'Black';
  const best = validatedBestMove(game.positions[ply - 1], report.bestMoves[ply - 1]);
  const sameAsBest = Boolean(best && best.san === played.san);
  const mateRelated = previous.kind === 'mate' || after.kind === 'mate';

  let assessment = '';
  if (sameAsBest) {
    assessment = 'Stockfish selected this same move as its first choice at the review depth.';
  } else if (mateRelated) {
    assessment = 'The engine sees a forced-mate situation around this move. The numerical loss and category are coarse estimates when mate scores are involved.';
  } else if (row.loss < 50) {
    assessment = 'The position changed by less than half a pawn in the mover’s disadvantage at this search depth. This is a small engine-estimated difference.';
  } else {
    assessment = 'At depth ' + report.depth + ', ' + player + ' gave up about ' +
      (row.loss / 100).toFixed(2) + ' pawns of engine evaluation with this move. That measures the change in the position, not a proven tactical reason.';
  }

  const observations: string[] = [];
  if (played.captured) observations.push(player + ' captured a ' + names[played.captured] + ' on ' + played.to + '.');
  if (played.isKingsideCastle()) observations.push(player + ' castled on the kingside.');
  if (played.isQueensideCastle()) observations.push(player + ' castled on the queenside.');
  if (played.promotion) observations.push(player + ' promoted a pawn to a ' + names[played.promotion] + '.');
  if (position.isCheckmate()) observations.push('This move delivered checkmate.');
  else if (position.inCheck()) observations.push('This move gave check to the opposing king.');

  // A legal capture does not by itself mean a piece is hanging: recaptures and
  // sacrifices can be correct, so the language must stay factual.
  const possibleCapture = position.moves({ verbose: true })
    .find(candidate => candidate.captured && candidate.to === played.to && played.piece !== 'p');
  if (possibleCapture) {
    observations.push('The opponent now has a legal capture of the moved ' +
      names[played.piece] + ' on ' + played.to + '. That capture may or may not be favorable.');
  }
  if (!observations.length) observations.push('The ' + names[played.piece] + ' moved from ' + played.from + ' to ' + played.to + '.');

  const comparison = sameAsBest
    ? 'The move you played matches Stockfish’s leading suggestion.'
    : best
      ? 'Stockfish preferred ' + best.san + ' from the position BEFORE ' + played.san +
        '. It is an alternative to examine, not a claim that it forces a particular result.'
      : 'A legal alternative was not available in the stored engine result for this position.';

  return {
    ply, heading: moveLabel(ply, played.san), quality: row.quality,
    assessment, observations, comparison,
    bestSan: best?.san ?? null, bestUci: best?.uci ?? null, sameAsBest,
    scoreBefore: formatScore(previous), scoreAfter: formatScore(after),
  };
}

export function buildGameSummary(game: GameRecord, report: ReviewReport): GameSummary {
  const rows = report.rows;
  const critical = rows.filter(row => row.quality === 'Mistake' || row.quality === 'Blunder');
  const whiteCritical = critical.filter(row => row.color === 'w').length;
  const blackCritical = critical.length - whiteCritical;
  const checks = rows.filter(row => /[+#]$/.test(row.san)).length;
  const captures = rows.filter(row => row.san.includes('x')).length;
  const ranked = [...critical].sort((a, b) => b.loss - a.loss || a.ply - b.ply);
  const first = ranked[0];

  const description = !rows.length
    ? 'The first positions are still being evaluated.'
    : first
      ? String(critical.length) + ' moves in the analyzed portion crossed the mistake threshold. The largest estimated loss was ' +
        moveLabel(first.ply, first.san) + ' (' + (first.loss / 100).toFixed(2) + ' pawns).'
      : 'No moves in the analyzed portion crossed our mistake threshold at depth ' +
        report.depth + '. That does not mean every move was optimal.';

  return {
    reviewedMoves: rows.length, totalMoves: game.moves.length,
    critical: critical.length, whiteCritical, blackCritical,
    best: rows.filter(row => row.quality === 'Best').length,
    captures, checks, turningPoints: ranked.slice(0, 4), description,
    complete: report.completed === report.total,
  };
}
