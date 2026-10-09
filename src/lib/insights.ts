import { Chess } from 'chess.js';
import type { GameRecord } from './pgn';
import type { ReviewReport, ReviewRow } from './game-review';
import { formatScore } from './engine-utils';
import { coachLines, describeConsequence } from './coach-intelligence';

export type MoveInsight = {
  ply: number;
  heading: string;
  quality: ReviewRow['quality'];
  assessment: string;
  /** Confidence-bounded explanation grounded in legal engine continuation. */
  consequenceTitle: string;
  consequence: string;
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

  const continuation = coachLines(game, report, ply)?.consequence.steps ?? [];
  const consequence = describeConsequence(game, ply, continuation);
  let assessment = '';
  if (sameAsBest) {
    assessment = 'Nice find. That matches the engine’s first choice here.';
  } else if (mateRelated && consequence.kind === 'mate') {
    assessment = 'That move runs into a mating threat. The line below shows the critical move.';
  } else if (mateRelated) {
    assessment = 'There’s a serious mating threat here. The short engine line might not show every step, so avoid reading too much into the numeric score.';
  } else if (row.loss < 50) {
    assessment = 'Nothing dramatic here. The engine sees only a small difference after this move.';
  } else if (row.loss < 130) {
    assessment = 'Not the cleanest move. The engine prefers a different plan, but the position is still worth playing through.';
  } else if (row.loss < 260) {
    assessment = 'This gives your opponent a better chance. The continuation below is the useful part: see what they can actually play.';
  } else {
    assessment = 'Ouch — this changes the game quite a bit. Let’s look at what Stockfish expects your opponent to do next.';
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
      ? 'Instead, Stockfish would have started with ' + best.san + '. That is the engine’s first choice before ' + played.san + ' — compare the two lines yourself.'
      : 'A legal alternative was not available in the stored engine result for this position.';

  return {
    ply, heading: moveLabel(ply, played.san), quality: row.quality,
    assessment, consequenceTitle: consequence.headline, consequence: consequence.description,
    observations, comparison,
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
      ? 'The biggest turning point so far is ' + moveLabel(first.ply, first.san) +
        '. It is one of ' + critical.length + ' moves worth a closer look. Start with that moment and follow the engine’s response.'
      : 'No major mistakes stood out at this depth. That is encouraging, though a deeper search might uncover more.';

  return {
    reviewedMoves: rows.length, totalMoves: game.moves.length,
    critical: critical.length, whiteCritical, blackCritical,
    best: rows.filter(row => row.quality === 'Best').length,
    captures, checks, turningPoints: ranked.slice(0, 4), description,
    complete: report.completed === report.total,
  };
}
