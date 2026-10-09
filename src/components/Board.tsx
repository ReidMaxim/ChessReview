import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Key } from 'chessground/types';

type Props = {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: [string, string];
  inCheck: boolean;
};

export default function Board({ fen, orientation, lastMove, inCheck }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const ground = useRef<ReturnType<typeof Chessground> | null>(null);

  useEffect(() => {
    if (!element.current) return;
    ground.current = Chessground(element.current, {
      fen,
      orientation,
      coordinates: true,
      viewOnly: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
    });
    return () => {
      ground.current?.destroy();
      ground.current = null;
    };
    // Creating a Chessground instance is a one-time DOM operation.
    // Subsequent moves are applied by the effect below.
  }, []);

  useEffect(() => {
    ground.current?.set({
      fen,
      orientation,
      lastMove: lastMove ? [lastMove[0] as Key, lastMove[1] as Key] : undefined,
      check: inCheck,
    });
  }, [fen, orientation, lastMove?.[0], lastMove?.[1], inCheck]);

  return (
    <div className="board-container">
      <div ref={element} className="chessground" aria-label="Chess position viewer" />
    </div>
  );
}
