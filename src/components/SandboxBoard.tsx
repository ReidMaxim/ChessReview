import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import type { Key } from 'chessground/types';

type Props = {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: [string, string];
  locked: boolean;
  onMove: (from: string, to: string) => void;
};

/** Chessground handles rendering and drag/drop; chess.js owns move legality. */
export default function SandboxBoard({ fen, orientation, lastMove, locked, onMove }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ground = useRef<ReturnType<typeof Chessground> | null>(null);
  const moveHandler = useRef(onMove);
  moveHandler.current = onMove;

  useEffect(() => {
    if (!host.current) return;
    ground.current = Chessground(host.current, {
      fen, orientation, coordinates: true, viewOnly: false,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: false, visible: false },
      movable: {
        free: false, showDests: true,
        events: { after: (from, to) => moveHandler.current(from, to) },
      },
    });
    return () => {
      ground.current?.destroy();
      ground.current = null;
    };
  }, []);

  useEffect(() => {
    const chess = new Chess(fen);
    const color = chess.turn() === 'w' ? 'white' : 'black';
    const legal = new Map<Key, Key[]>();
    if (!locked && !chess.isGameOver()) {
      for (const move of chess.moves({ verbose: true })) {
        const from = move.from as Key;
        const destinations = legal.get(from) || [];
        if (!destinations.includes(move.to as Key)) destinations.push(move.to as Key);
        legal.set(from, destinations);
      }
    }
    ground.current?.set({
      fen,
      orientation,
      turnColor: color,
      lastMove: lastMove ? [lastMove[0] as Key, lastMove[1] as Key] : undefined,
      check: chess.inCheck(),
      movable: {
        free: false,
        color: locked || chess.isGameOver() ? undefined : color,
        dests: legal,
      },
    });
  }, [fen, orientation, locked, lastMove?.[0], lastMove?.[1]]);

  return (
    <div className="board-container">
      <div ref={host} className="chessground" aria-label="Interactive practice chessboard"/>
    </div>
  );
}
