import type { GameRecord } from './pgn';
import type { ReviewReport } from './game-review';
import type { InvestigationResult } from './investigation';
import { isVerifiedInvestigation } from './tactical-evidence';

export type PracticeChoice = { uci: string; san: string; kind: 'played' | 'engine' };
export type CoachPractice = {
  /** Includes the position so moving between games cannot reuse an old answer. */
  id: string;
  played: PracticeChoice;
  engine: PracticeChoice;
  choices: PracticeChoice[];
  depth: number;
  bounded: boolean;
};

/**
 * Make a two-choice teaching prompt only from the two independently searched,
 * legally replayed lines rooted in the exact position before the selected move.
 * No invented distractors, tactical conclusions or win claims.
 */
export function buildCoachPractice(
  game: GameRecord,
  report: ReviewReport,
  ply: number,
  investigation?: InvestigationResult | null,
): CoachPractice | null {
  if (!investigation || ply < 1 || ply >= report.completed) return null;
  const move = game.moves[ply - 1];
  const rootFen = game.positions[ply - 1];
  if (!move || !rootFen || investigation.rootFen !== rootFen) return null;
  const playedUci = move.from + move.to + (move.san.match(/=([QRBN])/i)?.[1]?.toLowerCase() ?? '');
  if (investigation.playedUci !== playedUci || !isVerifiedInvestigation(investigation)) return null;

  const bestStep = investigation.best.steps[0];
  const playedStep = investigation.played.steps[0];
  if (!bestStep || !playedStep || bestStep.uci === playedStep.uci ||
      playedStep.uci !== playedUci) return null;

  const played: PracticeChoice = { uci: playedStep.uci, san: playedStep.san, kind: 'played' };
  const engine: PracticeChoice = { uci: bestStep.uci, san: bestStep.san, kind: 'engine' };
  const choices = ply % 2 === 0 ? [engine, played] : [played, engine];
  return {
    id: rootFen + '|' + ply + '|' + played.uci + '|' + engine.uci,
    played, engine, choices,
    depth: investigation.best.depth,
    bounded: investigation.best.bound !== 'exact' || investigation.played.bound !== 'exact',
  };
}

export function practiceFeedback(practice: CoachPractice, selectedUci: string): string | null {
  if (selectedUci === practice.engine.uci) {
    return 'That is Stockfish’s current first choice in the deeper search. Replay the suggested line to see one possible reply. It is not necessarily the only good move.';
  }
  if (selectedUci === practice.played.uci) {
    return 'That is the move from your game. This deeper search starts with ' +
      practice.engine.san + ' instead. Compare the lines to investigate why; their replies are examples, not forced outcomes.';
  }
  return null;
}
