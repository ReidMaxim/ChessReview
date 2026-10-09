import { Chess, type Square } from 'chess.js';

export type SandboxMove = {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  fen: string;
};

export type SandboxState = {
  initialFen: string;
  moves: SandboxMove[];
  cursor: number;
};

export function createSandbox(fen?: string): SandboxState {
  const board = new Chess(fen);
  return { initialFen: board.fen(), moves: [], cursor: 0 };
}

export function sandboxFen(state: SandboxState): string {
  return state.cursor ? state.moves[state.cursor - 1].fen : state.initialFen;
}

/** Branch from the selected cursor; future moves from an undone line are discarded. */
export function playSandboxMove(
  state: SandboxState,
  from: string, to: string, promotion?: string,
): SandboxState | null {
  const board = new Chess(sandboxFen(state));
  try {
    const move = board.move({ from: from as Square, to: to as Square, promotion });
    if (!move) return null;
    return {
      ...state,
      moves: [...state.moves.slice(0, state.cursor), {
        san: move.san,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        fen: board.fen(),
      }],
      cursor: state.cursor + 1,
    };
  } catch {
    return null;
  }
}

export function moveSandboxCursor(state: SandboxState, cursor: number): SandboxState {
  if (cursor < 0 || cursor > state.moves.length) return state;
  return { ...state, cursor };
}

export function sandboxPgn(state: SandboxState): string {
  const board = new Chess(state.initialFen);
  if (state.initialFen !== new Chess().fen()) {
    board.header('SetUp', '1', 'FEN', state.initialFen);
  }
  for (const move of state.moves.slice(0, state.cursor)) {
    board.move({ from: move.from as Square, to: move.to as Square, promotion: move.promotion });
  }
  return board.pgn();
}

/** Distinguish promotion moves from ordinary moves before applying a drag. */
export function promotionOptions(fen: string, from: string, to: string): string[] {
  try {
    const chess = new Chess(fen);
    const options = chess.moves({ square: from as Square, verbose: true })
      .filter(move => move.to === to && Boolean(move.promotion))
      .map(move => move.promotion!);
    return Array.from(new Set(options));
  } catch {
    return [];
  }
}
