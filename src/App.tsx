import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronsLeft, ChevronsRight,
  Clipboard, Copy, ExternalLink, FlipHorizontal, Github, Keyboard,
  Upload, X,
} from 'lucide-react';
import Board from './components/Board';
import SandboxWorkspace from './components/SandboxWorkspace';
import { createSandbox, type SandboxState } from './lib/sandbox';
import EnginePanel from './components/EnginePanel';
import GameReviewPanel, { type ReviewStatus } from './components/GameReviewPanel';
import CoachNotes, { type LinePreview } from './components/CoachNotes';
import { coachLines } from './lib/coach-intelligence';
import { validatedBestMove } from './lib/insights';
import { GameReviewSession, type ReviewReport } from './lib/game-review';
import { StockfishClient, type EngineState } from './lib/engine';
import type { Analysis } from './lib/engine-utils';
import { parsePgn, type GameRecord } from './lib/pgn';

function scoreLabel(result: string | undefined): string {
  if (result === '1-0') return 'White wins';
  if (result === '0-1') return 'Black wins';
  if (result === '1/2-1/2') return 'Draw';
  return 'Unfinished';
}

function name(game: GameRecord | null, side: 'White' | 'Black') {
  return game?.headers[side] || side + ' pieces';
}

export default function App() {
  // Open to the ordinary starting position, with no fictitious game loaded.
  const [game, setGame] = useState<GameRecord | null>(null);
  const [mode, setMode] = useState<'review' | 'sandbox'>('review');
  const [sandbox, setSandbox] = useState<SandboxState>(() => createSandbox());
  const [sandboxOrientation, setSandboxOrientation] = useState<'white' | 'black'>('white');
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const movePanelRef = useRef<HTMLDivElement>(null);
  const [engineOn,setEngineOn] = useState(false);
  const [depth,setDepth] = useState(12);
  const [engineStatus,setEngineStatus] = useState<EngineState | 'off'>('off');
  const [engineError,setEngineError] = useState('');
  const [analysis,setAnalysis] = useState<Analysis | null>(null);
  const engineRef = useRef<StockfishClient | null>(null);
  const reviewRef = useRef<GameReviewSession | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('idle');
  const [reviewDepth, setReviewDepth] = useState(8);
  const [reviewReport, setReviewReport] = useState<ReviewReport | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [hintPly, setHintPly] = useState<number | null>(null);
  const [linePreview, setLinePreview] = useState<LinePreview | null>(null);

  const annotated = useMemo(
    () => new Map(reviewReport?.rows.map(row => [row.ply, row.quality]) ?? []),
    [reviewReport],
  );

  useEffect(() => () => reviewRef.current?.cancel(), []);

  const totalMoves = game?.moves.length ?? 0;
  const currentMove = game && ply > 0 ? game.moves[ply - 1] : undefined;
  const currentFen = game?.positions[ply] ?? new Chess().fen();
  const position = useMemo(() => new Chess(currentFen), [currentFen]);
  const pairs = useMemo(
    () => !game ? [] : Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, i) => ({
      number: i + 1,
      white: game.moves[i * 2],
      black: game.moves[i * 2 + 1],
      whitePly: i * 2 + 1,
      blackPly: i * 2 + 2,
    })),
    [game],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (mode !== 'review' || event.altKey || event.ctrlKey || event.metaKey || importOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (linePreview) {
        const lines = game && reviewReport ? coachLines(game, reviewReport, linePreview.anchorPly) : null;
        const len = lines?.[linePreview.kind].steps.length ?? 0;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? len :
          Math.max(0, Math.min(len, linePreview.step + (event.key === 'ArrowRight' ? 1 : -1)));
        setLinePreview(current => current ? { ...current, step: next } : null);
        return;
      }
      setHintPly(null);
      if (event.key === 'ArrowLeft') setPly(p => Math.max(0, p - 1));
      if (event.key === 'ArrowRight') setPly(p => Math.min(totalMoves, p + 1));
      if (event.key === 'Home') setPly(0);
      if (event.key === 'End') setPly(totalMoves);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalMoves, importOpen, mode, linePreview, game, reviewReport]);

  useEffect(() => {
    const active = movePanelRef.current?.querySelector('.move-chip.active');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [ply, game]);

  // Start one Worker when opted in; reuse it as the reviewer navigates moves.
  useEffect(() => {
    if (!engineOn || !game) {
      engineRef.current?.dispose();
      engineRef.current = null;
      setEngineStatus('off');
      setAnalysis(null);
      return;
    }
    try {
      const engine = new StockfishClient({
        onState: (state, message = '') => {
          setEngineStatus(state);
          setEngineError(message);
        },
        onAnalysis: setAnalysis,
      });
      engineRef.current = engine;
    } catch (caught) {
      setEngineStatus('error');
      setEngineError(caught instanceof Error ? caught.message : 'Engine failed to start.');
    }
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [engineOn, Boolean(game)]);

  useEffect(() => {
    if (engineOn && game) engineRef.current?.analyze(currentFen, depth);
  }, [engineOn, game, currentFen, depth]);

  function navigateTo(target: number) {
    setLinePreview(null);
    setHintPly(null);
    setPly(Math.max(0, Math.min(game?.moves.length ?? 0, target)));
  }

  function showAlternative(target: number) {
    if (!game || !reviewReport) return;
    setLinePreview(null);
    const candidate = validatedBestMove(game.positions[target - 1], reviewReport.bestMoves[target - 1] ?? null);
    if (!candidate) return;
    setEngineOn(false);
    setHintPly(target);
    setPly(target - 1);
  }

  function replayLine(target: number, kind: LinePreview['kind']) {
    if (!game || !reviewReport) return;
    const lines = coachLines(game, reviewReport, target);
    if (!lines?.[kind].steps.length) return;
    setHintPly(null);
    setEngineOn(false);
    setLinePreview({ anchorPly: target, kind, step: 0 });
  }

  function moveLinePreview(step: number) {
    setLinePreview(prev => {
      if (!prev || !game || !reviewReport) return null;
      const lines = coachLines(game, reviewReport, prev.anchorPly);
      const len = lines?.[prev.kind].steps.length ?? 0;
      return { ...prev, step: Math.max(0, Math.min(len, step)) };
    });
  }

  function switchMode(next: 'review' | 'sandbox') {
    if (next === mode) return;
    setHintPly(null);
    setLinePreview(null);
    if (next === 'sandbox') {
      // Keep the PGN and results available for later, but suspend both engines.
      setEngineOn(false);
      reviewRef.current?.cancel();
      reviewRef.current = null;
      if (reviewStatus === 'running') setReviewStatus('cancelled');
    }
    setMode(next);
  }

  function startFullReview() {
    if (!game) return;
    setHintPly(null);
    setLinePreview(null);
    reviewRef.current?.cancel();
    setEngineOn(false);
    setReviewError('');
    setReviewReport(null);
    setReviewStatus('running');
    const session = new GameReviewSession(game, reviewDepth, {
      onProgress: setReviewReport,
      onComplete: report => {
        setReviewReport(report);
        setReviewStatus('complete');
        reviewRef.current = null;
      },
      onError: message => {
        setReviewError(message);
        setReviewStatus('error');
        reviewRef.current = null;
      },
    });
    reviewRef.current = session;
    session.start();
  }

  function cancelFullReview() {
    reviewRef.current?.cancel();
    reviewRef.current = null;
    setReviewStatus('cancelled');
  }

  function loadPgn(value: string) {
    try {
      const next = parsePgn(value);
      reviewRef.current?.cancel();
      reviewRef.current = null;
      setReviewReport(null);
      setHintPly(null);
      setLinePreview(null);
      setReviewStatus('idle');
      setReviewError('');
      setEngineOn(false);
      setAnalysis(null);
      setGame(next);
      setMode('review');
      // Start at White's first move, not the game's final position.
      // Users can press Home to see the initial setup.
      setPly(1);
      setError('');
      setNotice('');
      setImportOpen(false);
      setDraft('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import this game.');
    }
  }

  function copyFen() {
    if (!navigator.clipboard) {
      setNotice('Clipboard access is unavailable in this browser.');
      return;
    }
    void navigator.clipboard.writeText(displayFen)
      .then(() => setNotice('FEN copied to clipboard.'))
      .catch(() => setNotice('Could not access the clipboard.'));
  }

  const lastMove = currentMove ? [currentMove.from, currentMove.to] as [string, string] : undefined;
  const result = game?.headers.Result;
  const visibleAnalysis = engineOn && analysis?.fen === currentFen ? analysis : null;
  const hintedMove = hintPly !== null && ply === hintPly - 1 && game && reviewReport
    ? validatedBestMove(game.positions[hintPly - 1], reviewReport.bestMoves[hintPly - 1] ?? null)?.uci
    : null;

  // Engine line replay is strictly a temporary display, not a PGN edit.
  const previewLine = linePreview && game && reviewReport
    ? coachLines(game, reviewReport, linePreview.anchorPly)?.[linePreview.kind] : null;
  const displayFen = previewLine
    ? (linePreview?.step ? previewLine.steps[linePreview.step - 1]?.fen ?? previewLine.startFen : previewLine.startFen)
    : currentFen;
  const displayPosition = useMemo(() => new Chess(displayFen), [displayFen]);
  const replayStep = previewLine && linePreview?.step
    ? previewLine.steps[linePreview.step - 1] : null;
  const displayLastMove = replayStep ? [replayStep.from, replayStep.to] as [string, string] : lastMove;
  const displaySuggestedMove = previewLine && linePreview
    ? previewLine.steps[linePreview.step]?.uci ?? null : hintedMove ?? visibleAnalysis?.pv[0] ?? null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">♞</div>
          <div>
            <strong>CHESS<span>REVIEW</span></strong>
            <div className="brand-subtitle">THE OPEN ANALYSIS STUDIO</div>
          </div>
        </div>
        <div className="top-actions">
          <span className="local-label"><span className="status-dot" /> LOCAL-FIRST</span>
          <a className="icon-link github-link" href="https://github.com/ReidMaxim/ChessReview" target="_blank" rel="noreferrer" aria-label="View source on GitHub" title="Source on GitHub"><Github size={19} /></a>
          <button className="primary-button top-import" onClick={() => { setError(''); setImportOpen(true); }}><Upload size={16} /> Import game</button>
        </div>
      </header>

      <main className="page">
        <div className="eyebrow"><span className="eyebrow-line" /> YOUR GAME, DECODED <span className="tiny-bullet">◆</span> REVIEW WORKSPACE</div>

        <div className="intro-row">
          <div>
            <h1>Every move tells <em>a story.</em></h1>
            <p className="intro-copy">{mode === 'review' ? 'Import a finished game to explore every decision, with optional local Stockfish analysis.' : 'Experiment with legal moves, explore positions, and export your practice lines.'}</p>
          </div>
          <div className="phase-label"><span className="phase-indicator">06.5</span><span>COACH INTELLIGENCE<br /><b>REPLAY REAL ENGINE LINES</b></span></div>
        </div>

        <div className="workspace-modes" role="group" aria-label="ChessReview workspace mode">
          <button className={'mode-choice' + (mode === 'review' ? ' active' : '')} aria-label="Open Game Review" aria-pressed={mode === 'review'} onClick={() => switchMode('review')}>♟ Game Review</button>
          <button className={'mode-choice' + (mode === 'sandbox' ? ' active' : '')} aria-label="Open Free Board" aria-pressed={mode === 'sandbox'} onClick={() => switchMode('sandbox')}>♙ Free Board</button>
          <span className="mode-tip">{mode === 'review' ? 'Completed games · engine assistance' : 'Offline practice · no engine'}</span>
        </div>

        {mode === 'sandbox' ? (
          <SandboxWorkspace session={sandbox} setSession={setSandbox}
            orientation={sandboxOrientation} setOrientation={setSandboxOrientation}/>
        ) : (
        <div className="workspace">
          <section className="board-card" aria-label="Game board">
            <div className="game-header">
              <div className="player-stack">
                <div className="avatar avatar-black">♚</div>
                <div><div className="player-role">BLACK</div><div className="player-name">{name(game, 'Black')}</div></div>
                {game?.headers.BlackElo && <span className="elo">{game.headers.BlackElo}</span>}
              </div>
            </div>

            <div className="board-mat">
              <Board fen={displayFen} orientation={orientation} lastMove={displayLastMove} inCheck={displayPosition.inCheck()} bestMove={displaySuggestedMove} />
            </div>

            {linePreview && previewLine && (
              <div className="board-replay-ribbon" role="group" aria-label="Engine replay on main board">
                <span><b>ENGINE LINE</b> · {linePreview.kind === 'alternative' ? 'Better option' : 'After the move'} · {linePreview.step}/{previewLine.steps.length}</span>
                <div>
                  <button aria-label="Previous move on main replay" disabled={linePreview.step === 0} onClick={() => moveLinePreview(linePreview.step - 1)}>←</button>
                  <button aria-label="Next move on main replay" disabled={linePreview.step >= previewLine.steps.length} onClick={() => moveLinePreview(linePreview.step + 1)}>→</button>
                  <button aria-label="Exit main replay" onClick={() => setLinePreview(null)}>Exit</button>
                </div>
              </div>
            )}
            <div className="game-footer">
              <div className="player-stack">
                <div className="avatar avatar-white">♔</div>
                <div><div className="player-role">WHITE</div><div className="player-name">{name(game, 'White')}</div></div>
                {game?.headers.WhiteElo && <span className="elo">{game.headers.WhiteElo}</span>}
              </div>
              <button className="plain-icon" onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')} title="Flip board" aria-label="Flip board"><FlipHorizontal size={19} /></button>
            </div>
          </section>

          <section className="review-card" aria-label="Game navigation and moves">
            <div className="review-head">
              <div className="review-title-group">
                <div className="micro-heading">GAME FILE <span className="file-hash">/ 001</span></div>
                <h2>{game?.headers.Event || (game ? 'Imported chess game' : 'Ready for a new game')}</h2>
                <div className="metadata">
                  <span className="result-tag">{game ? scoreLabel(result) : 'NO GAME LOADED'}</span>
                  {game ? <span>{totalMoves} plies</span> : <span>Import a PGN to begin</span>}
                  {game?.headers.Date && game.headers.Date !== '????.??.??' && <span>{game.headers.Date}</span>}
                </div>
              </div>
              <button className="plain-icon" title="Import another game" aria-label="Import another game" onClick={() => { setError(''); setImportOpen(true); }}><Clipboard size={19} /></button>
            </div>

            <div className="timeline">
              <div className="section-heading"><span>MOVE HISTORY</span><span>{ply} / {totalMoves}</span></div>
              <div className="move-scroll" ref={movePanelRef}>
                {!game ? (
                  <div className="empty-state">
                    <Clipboard size={26} aria-hidden="true" />
                    <strong>No game imported yet</strong>
                    <p>Your board is ready. Bring in a finished PGN to see its moves here.</p>
                    <button className="primary-button" onClick={() => { setError(''); setImportOpen(true); }}>
                      <Upload size={16} /> Import your PGN
                    </button>
                  </div>
                ) : (
                <div className="move-grid" role="group" aria-label="Move list">
                  {pairs.map(pair => (
                    <div className="move-row" key={pair.number}>
                      <span className="move-number">{pair.number}.</span>
                      <button className={'move-chip' + (ply === pair.whitePly ? ' active' : '') + (annotated.has(pair.whitePly) ? ' annotated annotated-' + annotated.get(pair.whitePly)!.toLowerCase() : '')} onClick={() => navigateTo(pair.whitePly)} aria-current={ply === pair.whitePly ? 'step' : undefined}>{pair.white?.san}</button>
                      {pair.black ? <button className={'move-chip' + (ply === pair.blackPly ? ' active' : '') + (annotated.has(pair.blackPly) ? ' annotated annotated-' + annotated.get(pair.blackPly)!.toLowerCase() : '')} onClick={() => navigateTo(pair.blackPly)} aria-current={ply === pair.blackPly ? 'step' : undefined}>{pair.black.san}</button> : <span />}
                    </div>
                  ))}
                </div>
                )}
              </div>
            </div>

            <div className="transport">
              <button className="transport-btn" aria-label="Go to beginning" title="Beginning (Home)" onClick={() => navigateTo(0)} disabled={!game || ply === 0}><ChevronsLeft size={20} /></button>
              <button className="transport-btn" aria-label="Previous move" title="Previous (←)" onClick={() => navigateTo(ply - 1)} disabled={!game || ply === 0}><ArrowLeft size={20} /></button>
              <div className="move-progress"><div className="progress-track"><div style={{ width: (totalMoves ? 100 * ply / totalMoves : 0) + '%' }} /></div><span>{!game ? 'NO GAME LOADED' : ply === 0 ? 'START POSITION' : currentMove?.number + (currentMove?.color === 'w' ? '. WHITE' : '... BLACK')}</span></div>
              <button className="transport-btn" aria-label="Next move" title="Next (→)" onClick={() => navigateTo(ply + 1)} disabled={!game || ply === totalMoves}><ArrowRight size={20} /></button>
              <button className="transport-btn" aria-label="Go to end" title="End (End)" onClick={() => navigateTo(totalMoves)} disabled={!game || ply === totalMoves}><ChevronsRight size={20} /></button>
            </div>

            <GameReviewPanel available={Boolean(game)} status={reviewStatus} report={reviewReport}
              error={reviewError} depth={reviewDepth} setDepth={setReviewDepth}
              selectedPly={ply} onPly={navigateTo} onRun={startFullReview} onCancel={cancelFullReview}/>

            {game && reviewReport && (
              <CoachNotes game={game} report={reviewReport} selectedPly={ply}
                hintPly={hintPly} onNavigate={navigateTo} onHint={showAlternative}
                preview={linePreview} onPreview={replayLine} onStep={moveLinePreview}
                onClosePreview={() => setLinePreview(null)}/>
            )}

            <EnginePanel available={Boolean(game) && reviewStatus !== 'running'} enabled={engineOn} onToggle={() => { setHintPly(null); setEngineOn(on => !on); }}
              depth={depth} onDepth={setDepth} status={engineStatus} message={engineError}
              analysis={visibleAnalysis} fen={currentFen}/>

            <div className="position-panel">
              <div className="position-panel-head"><span className="micro-heading">POSITION INSPECTOR</span><span className="step-counter">{String(ply).padStart(2, '0')} / {String(totalMoves).padStart(2, '0')}</span></div>
              <div className="position-focus">
                <div className="position-symbol">{position.isCheckmate() ? '♚' : currentMove?.san.includes('+') ? '+' : '♞'}</div>
                <div><span className="small-muted">{linePreview ? 'ENGINE LINE · NOT GAME PGN' : !game ? 'BOARD READY' : position.isCheckmate() ? 'CHECKMATE' : ply === 0 ? 'GAME START' : 'LAST MOVE'}</span>
                  <div className="big-san">{linePreview ? (replayStep ? replayStep.san : 'Beginning of line') : currentMove ? (currentMove.number + (currentMove.color === 'w' ? '. ' : '... ') + currentMove.san) : 'Initial position'}</div>
                </div>
              </div>
              <div className="inspector-bottom">
                <span>{linePreview ? 'Exploring a verified engine continuation' : !game ? 'Import a PGN to begin' : position.isCheckmate() ? 'Game ended by checkmate' : position.turn() === 'w' ? 'White to move' : 'Black to move'}</span>
                <button className="copy-button" onClick={copyFen}><Copy size={14} /> Copy FEN</button>
              </div>
              {notice && <p className="notice" role="status">{notice}</p>}
            </div>

            <div className="upcoming">
              <div className="upcoming-icon"><BookOpen size={19} /></div>
              <div><strong>Notes are grounded in chess evidence.</strong><p>Complete a game review to unlock Coach Notes: move-by-move commentary, a game recap, and legal Stockfish alternatives. Training puzzles remain a future idea.</p></div>
            </div>
          </section>
        </div>
        )}

        <div className="bottom-bar">
          <div className="shortcuts"><Keyboard size={16} /> <b>KEYBOARD</b> <span>← →</span> moves <span>HOME / END</span> jump</div>
          <div className="open-note"><Check size={16} /> Open source by design <span className="separator">·</span> Your PGN stays in this browser</div>
        </div>

        <footer className="footer">
          <div>CHESSREVIEW <span>© OPEN-SOURCE PROJECT</span></div>
          <a href="https://github.com/ReidMaxim/ChessReview" target="_blank" rel="noreferrer">Source & documentation <ExternalLink size={14} /></a>
        </footer>
      </main>

      {importOpen && (
        <div className="modal-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) setImportOpen(false); }}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="modal-head"><div><div className="micro-heading">ADD TO WORKSPACE</div><h2 id="import-title">Import a game</h2></div><button className="plain-icon" onClick={() => setImportOpen(false)} aria-label="Close"><X size={21} /></button></div>
            <p>Paste a complete PGN from any chess platform. Everything is parsed locally—no login required.</p>
            <label htmlFor="pgn-input">PGN NOTATION</label>
            <textarea id="pgn-input" autoFocus spellCheck={false} value={draft} onChange={e => { setDraft(e.target.value); setError(''); }} placeholder={'[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 ...'} />
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button className="primary-button" onClick={() => loadPgn(draft)}><Upload size={16} /> Load PGN</button>
            </div>
            <div className="modal-footnote">For a blank interactive practice board, select Free Board. Chess.com username import and drag-and-drop files are planned for later milestones.</div>
          </section>
        </div>
      )}
    </div>
  );
}
