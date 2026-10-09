import type { GameRecord } from './pgn';
import type { ReviewReport } from './game-review';
import type { InvestigationResult } from './investigation';
import { buildMoveInsight, validatedBestMove } from './insights';
import { extractTacticalEvidence, isVerifiedInvestigation, type TacticalEvidence } from './tactical-evidence';

export type CoachingNarrative = {
  status: 'quick-review' | 'board-confirmed' | 'engine-shown' | 'no-clear-tactic' | 'engine-agrees';
  headline: string;
  explanation: string;
  takeaway: string;
  /** Only linked to a verified step in the played-move investigation. */
  evidenceStep: number | null;
  evidence: TacticalEvidence | null;
  source: 'quick' | 'investigation';
};

function prefixForQuality(quality: string, sameAsBest: boolean): string {
  if (sameAsBest) return 'That matches Stockfish’s choice.';
  switch (quality) {
    case 'Blunder': return 'This is a turning point worth studying.';
    case 'Mistake': return 'There may be a better way through this position.';
    case 'Inaccuracy': return 'Stockfish sees a small improvement here.';
    default: return 'This position is worth a look.';
  }
}
function leadFact(fact: TacticalEvidence, playedSan: string, bestSan: string): CoachingNarrative {
  const alternative = bestSan === playedSan
    ? 'The two analyzed lines begin with the same move, so this search does not establish a better first choice.'
    : 'Stockfish starts its preferred line with ' + bestSan + ' instead of ' + playedSan + '.';
  if (fact.kind === 'mate') {
    const instant = fact.confidence === 'board-confirmed';
    return {
      status: fact.confidence,
      headline: instant ? 'Watch out — this lets your opponent checkmate immediately.' :
        'The line after this move ends in checkmate.',
      explanation: fact.detail + ' ' + alternative,
      takeaway: instant
        ? 'Replay the mating move and compare the king’s safety after the suggested alternative.'
        : 'Step through the mating sequence. A line reaching checkmate is evidence of that line, not proof every reply is forced.',
      evidence: fact, evidenceStep: fact.step, source: 'investigation',
    };
  }
  if (fact.kind === 'material') {
    return {
      status: 'engine-shown',
      headline: 'There is a concrete material difference in these two lines.',
      explanation: fact.detail + ' ' + alternative,
      takeaway: 'Follow the captures and recaptures on the board. The material count is for the moves shown, not a guarantee of what must happen.',
      evidence: fact, evidenceStep: fact.step, source: 'investigation',
    };
  }
  if (fact.kind === 'fork') {
    return {
      status: 'engine-shown',
      headline: 'The reply creates a knight double attack.',
      explanation: fact.detail + ' ' + alternative,
      takeaway: 'Look at both attacked pieces after the knight lands. A fork is an opportunity, but it does not automatically win material.',
      evidence: fact, evidenceStep: fact.step, source: 'investigation',
    };
  }
  return {
    status: 'engine-shown',
    headline: 'A piece becomes pinned to its king in this continuation.',
    explanation: fact.detail + ' ' + alternative,
    takeaway: 'Look at the attacking piece, the pinned piece, and the king in a straight line. The pin itself is clear; its importance still needs judgment.',
    evidence: fact, evidenceStep: fact.step, source: 'investigation',
  };
}

/**
 * Prioritize verified facts, then honest differences between engine lines,
 * then the quick review. Never let the prose invent a tactical cause.
 */
export function composeCoachNarrative(
  game: GameRecord, report: ReviewReport, ply: number, investigation?: InvestigationResult | null,
): CoachingNarrative | null {
  const insight = buildMoveInsight(game, report, ply);
  const move = game.moves[ply - 1];
  if (!insight || !move) return null;

  const playedUci = move.from + move.to + (move.san.match(/=([QRBN])/i)?.[1]?.toLowerCase() ?? '');
  const validDeep = Boolean(investigation &&
    investigation.rootFen === game.positions[ply - 1] &&
    investigation.playedUci === playedUci && isVerifiedInvestigation(investigation));

  if (validDeep && investigation) {
    const best = investigation.best.steps[0];
    const played = investigation.played.steps[0];
    if (!best || !played) return null;
    // An engine might return the same move in a deeper search. Do not blame
    // it for a tactic that occurs in both lines.
    if (best.uci === played.uci) {
      return {
        status: 'engine-agrees',
        headline: 'Your move is Stockfish’s first choice in this deeper search.',
        explanation: 'Both deeper searches begin with ' + played.san + '. The quick game review may have classified the move differently, but this deeper search does not offer a different first move. Further searching could still change the assessment.',
        takeaway: 'Look at the reply in the engine line and see what your move is trying to accomplish.',
        evidence: null, evidenceStep: null, source: 'investigation',
      };
    }
    const candidates = extractTacticalEvidence(investigation, move.color);
    const bestFact = candidates.find(e => e.kind === 'mate' && e.confidence === 'board-confirmed')
      ?? candidates.find(e => e.kind === 'mate')
      ?? candidates.find(e => e.kind === 'material')
      ?? candidates.find(e => e.kind === 'fork')
      ?? candidates.find(e => e.kind === 'pin');
    if (bestFact) return leadFact(bestFact, played.san, best.san);
    return {
      status: 'no-clear-tactic',
      headline: 'Stockfish prefers a different route, but not for an obvious tactic.',
      explanation: 'You played ' + played.san + '. The deeper search prefers ' + best.san +
        '. Its illustrated replies differ, but they do not demonstrate a clear checkmate, material swing, or reliable tactical explanation.',
      takeaway: 'Replay the two lines side by side and compare the resulting positions. We should not guess at a positional reason from a score alone.',
      evidence: null, evidenceStep: null, source: 'investigation',
    };
  }

  // A short review is useful for triage, not enough to establish causation.
  const best = validatedBestMove(game.positions[ply - 1], report.bestMoves[ply - 1]);
  const suggestion = best && best.san !== move.san
    ? ' Stockfish prefers ' + best.san + ' at this review depth.'
    : '';
  if (move.san.endsWith('#')) {
    return {
      status: 'quick-review',
      headline: 'Checkmate — that move finishes the game.',
      explanation: move.san + ' is checkmate in the recorded position. That result is verifiable on the board.',
      takeaway: 'Replay the final move and notice which escape squares or defenses are unavailable.',
      evidence: null, evidenceStep: null, source: 'quick',
    };
  }
  if (insight.sameAsBest) {
    return {
      status: 'quick-review',
      headline: 'Nice — this is the engine’s first choice at the review depth.',
      explanation: 'You played ' + move.san + ', and the initial Stockfish search agrees. A deeper search could still change its assessment.',
      takeaway: 'Step through the continuation and see how your opponent can answer.',
      evidence: null, evidenceStep: null, source: 'quick',
    };
  }
  return {
    status: 'quick-review',
    headline: prefixForQuality(insight.quality, false),
    explanation: 'You played ' + move.san + '.' + suggestion +
      ' The quick review finds a difference in evaluation, but it cannot yet establish the chess reason.',
    takeaway: 'Replay what Stockfish expects next, or use Deeper Investigation below for a more grounded comparison.',
    evidence: null, evidenceStep: null, source: 'quick',
  };
}
