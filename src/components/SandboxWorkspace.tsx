import { useState, type Dispatch, type SetStateAction } from 'react';
import { Chess } from 'chess.js';
import { ArrowLeft, ArrowRight, Clipboard, Copy, FlipHorizontal, RotateCcw, Undo2 } from 'lucide-react';
import SandboxBoard from './SandboxBoard';
import {
  createSandbox, moveSandboxCursor, playSandboxMove, promotionOptions,
  sandboxFen, sandboxPgn, type SandboxState,
} from '../lib/sandbox';

type Props = {
  session: SandboxState;
  setSession: Dispatch<SetStateAction<SandboxState>>;
  orientation: 'white' | 'black';
  setOrientation: Dispatch<SetStateAction<'white' | 'black'>>;
};

const choices: Record<string, string> = { q: '♛ Queen', r: '♜ Rook', b: '♝ Bishop', n: '♞ Knight' };

export default function SandboxWorkspace({ session, setSession, orientation, setOrientation }: Props) {
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState('');
  const [message, setMessage] = useState('');
  const fen = sandboxFen(session);
  const chess = new Chess(fen);
  const last = session.cursor ? session.moves[session.cursor - 1] : undefined;
  const lastMove = last ? [last.from, last.to] as [string, string] : undefined;

  function commit(from: string, to: string, promotion?: string) {
    setSession(previous => playSandboxMove(previous, from, to, promotion) ?? previous);
    setPending(null);
    setMessage('');
  }

  function handleMove(from: string, to: string) {
    const options = promotionOptions(fen, from, to);
    if (options.length > 0) {
      setPending({ from, to });
      return;
    }
    commit(from, to);
  }

  function reset() {
    setSession(createSandbox());
    setPending(null);
    setFenInput('');
    setFenError('');
    setMessage('New starting position ready.');
  }

  function importFen() {
    try {
      if (!fenInput.trim()) throw new Error('Paste a FEN position first.');
      setSession(createSandbox(fenInput.trim()));
      setPending(null);
      setFenInput('');
      setFenError('');
      setMessage('Position loaded locally.');
    } catch {
      setFenError('Invalid FEN. Check the piece placement, active turn and remaining fields.');
    }
  }

  async function copy(value: string, label: string) {
    if (!navigator.clipboard) {
      setMessage('Clipboard unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setMessage(label + ' copied to clipboard.');
    } catch {
      setMessage('Could not write to the clipboard.');
    }
  }

  return (
    <div className="workspace" aria-label="Free board sandbox workspace">
      <section className="board-card" aria-label="Practice chessboard">
        <div className="game-header">
          <div className="player-stack">
            <div className="avatar avatar-black">♚</div>
            <div><div className="player-role">BLACK</div><div className="player-name">Practice pieces</div></div>
          </div>
        </div>
        <div className="board-mat">
          <SandboxBoard fen={fen} orientation={orientation} lastMove={lastMove}
            locked={Boolean(pending)} onMove={handleMove}/>
        </div>
        <div className="game-footer">
          <div className="player-stack">
            <div className="avatar avatar-white">♔</div>
            <div><div className="player-role">WHITE</div><div className="player-name">Practice pieces</div></div>
          </div>
          <button className="plain-icon" aria-label="Flip sandbox board" title="Flip board"
            onClick={() => setOrientation(side => side === 'white' ? 'black' : 'white')}><FlipHorizontal size={19}/></button>
        </div>
      </section>
      <section className="review-card sandbox-panel" aria-label="Free board controls">
        <div className="review-head">
          <div className="review-title-group">
            <div className="micro-heading">FREE BOARD / STUDY MODE</div>
            <h2>Your analysis sandbox</h2>
            <div className="metadata"><span className="result-tag">LOCAL PRACTICE</span><span>{session.cursor} played moves</span></div>
          </div>
        </div>
        <div className="sandbox-content">
          <p className="sandbox-help">Move either side's pieces in turn, explore openings, or load a practice position. The board enforces legal moves, including checks, castling and en passant.</p>
          <div className="sandbox-turn">
            <span className="sandbox-turn-symbol">{chess.turn() === 'w' ? '♔' : '♚'}</span>
            <div><span className="small-muted">CURRENT POSITION</span><strong>{chess.isCheckmate() ? 'Checkmate' : chess.isDraw() ? 'Game drawn' : chess.inCheck() ? (chess.turn() === 'w' ? 'White in check' : 'Black in check') : chess.turn() === 'w' ? 'White to move' : 'Black to move'}</strong></div>
          </div>
          <div className="section-heading"><span>PRACTICE LINE</span><span>{session.cursor} / {session.moves.length}</span></div>
          <div className="sandbox-history" aria-label="Practice move history">
            {session.moves.length ? (
              session.moves.map((move,index) =>
                <button key={index} className={'sandbox-move-chip' + (session.cursor === index + 1 ? ' selected' : '') + (index >= session.cursor ? ' future' : '')}
                  onClick={() => { setSession(previous => moveSandboxCursor(previous,index + 1)); setPending(null); }}>
                  {Math.floor(index / 2) + 1}{index % 2 ? '...' : '.'} {move.san}
                </button>)
            ) : <span className="sandbox-no-moves">Make your first move on the board.</span>}
          </div>
          <div className="sandbox-controls">
            <button aria-label="Undo sandbox move" disabled={session.cursor === 0 || Boolean(pending)}
              onClick={() => setSession(previous => moveSandboxCursor(previous,previous.cursor - 1))}><Undo2 size={16}/> Undo</button>
            <button aria-label="Redo sandbox move" disabled={session.cursor >= session.moves.length || Boolean(pending)}
              onClick={() => setSession(previous => moveSandboxCursor(previous,previous.cursor + 1))}><ArrowRight size={16}/> Redo</button>
            <button aria-label="Reset sandbox board" onClick={reset}><RotateCcw size={16}/> Reset</button>
          </div>
          <div className="sandbox-exports">
            <button onClick={() => void copy(fen,'FEN')}><Copy size={15}/> Copy FEN</button>
            <button disabled={session.cursor === 0} onClick={() => void copy(sandboxPgn(session),'PGN')}><Clipboard size={15}/> Copy PGN</button>
          </div>
          <div className="sandbox-fen-entry">
            <label htmlFor="sandbox-fen-input">LOAD FEN POSITION</label>
            <textarea id="sandbox-fen-input" rows={2} value={fenInput} onChange={event => {setFenInput(event.target.value);setFenError('');}} placeholder="Paste a legal FEN for offline study" />
            {fenError && <p className="sandbox-error" role="alert">{fenError}</p>}
            <button onClick={importFen} className="sandbox-load-button"><ArrowLeft size={14}/> Load position</button>
          </div>
          {message && <p className="sandbox-message" role="status">{message}</p>}
          <div className="sandbox-footnote">This practice board is independent from imported games. No engine suggestions or live competitive-game assistance are provided here.</div>
        </div>
      </section>
      {pending && (
        <div className="modal-backdrop">
          <section className="import-modal sandbox-promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
            <div className="micro-heading">PAWN PROMOTION</div>
            <h2 id="promotion-title">Choose a piece</h2>
            <div className="promotion-choices">
              {promotionOptions(fen,pending.from,pending.to).map(choice =>
                <button key={choice} onClick={() => commit(pending.from,pending.to,choice)}>{choices[choice] || choice}</button>)}
            </div>
            <button className="sandbox-cancel-promotion" onClick={() => setPending(null)}>Cancel promotion</button>
          </section>
        </div>
      )}
    </div>
  );
}
