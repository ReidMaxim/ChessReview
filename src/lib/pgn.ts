import { Chess } from 'chess.js';

export type GameMove = {
  san: string;
  from: string;
  to: string;
  color: 'w' | 'b';
  number: number;
  fenAfter: string;
};

export type GameRecord = {
  pgn: string;
  headers: Record<string, string>;
  positions: string[];
  moves: GameMove[];
};

/**
 * PGN is the sole input contract. Future username/file importers should
 * retrieve PGN and call this function, not duplicate chess-state logic.
 */
export function parsePgn(rawPgn: string): GameRecord {
  const pgn = rawPgn.trim();
  if (!pgn) throw new Error('Paste a PGN before importing a game.');

  const parsed = new Chess();
  try {
    parsed.loadPgn(pgn);
  } catch {
    throw new Error('This PGN could not be read. Check that it contains a complete, legal move sequence.');
  }
  const history = parsed.history({ verbose: true });
  if (!history.length) throw new Error('The PGN does not contain any chess moves.');

  // chess.js allows nullable header values; keep our normalized record string-only.
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.header())) {
    if (typeof value === 'string') headers[key] = value;
  }
  const setupFen = headers.SetUp === '1' && headers.FEN ? headers.FEN : undefined;
  let replay: Chess;
  try {
    replay = setupFen ? new Chess(setupFen) : new Chess();
  } catch {
    throw new Error('The PGN contains an invalid starting position.');
  }

  const positions = [replay.fen()];
  const moves: GameMove[] = history.map((move, index) => {
    replay.move(move.san);
    const fenAfter = replay.fen();
    positions.push(fenAfter);
    return {
      san: move.san,
      from: move.from,
      to: move.to,
      color: move.color,
      number: Math.floor(index / 2) + 1,
      fenAfter,
    };
  });

  return { pgn, headers, positions, moves };
}
