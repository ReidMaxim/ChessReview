import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  ArrowLeft, ArrowRight, Check, ChevronsLeft, ChevronsRight,
  Clipboard, Copy, ExternalLink, FlipHorizontal, Github, Keyboard,
  ListOrdered, BarChart3, BrainCircuit, Cpu, PlayCircle, CircleStop,
  Settings2, Upload, X,
} from 'lucide-react';
import Board from './components/Board';
import EvaluationBar from './components/EvaluationBar';
import AnalysisSettings from './components/AnalysisSettings';
import { readPreferences, savePreferences, type AnalysisPreferences } from './lib/preferences';
import { terminalScore } from './lib/game-review';
import SandboxWorkspace from './components/SandboxWorkspace';
import { createSandbox, type SandboxState } from './lib/sandbox';
import EnginePanel from './components/EnginePanel';
import GameReviewPanel, { type ReviewStatus } from './components/GameReviewPanel';
import CoachNotes, { type LinePreview } from './components/CoachNotes';
import { coachLines } from './lib/coach-intelligence';
import { validatedBestMove } from './lib/insights';
import { GameReviewSession, type ReviewReport } from './lib/game-review';
import { StockfishClient, type EngineState } from './lib/engine';
import { formatScore, type Analysis } from './lib/engine-utils';
import { parsePgn, type GameRecord } from './lib/pgn';
import { useDialogFocus } from './lib/dialog-focus';

function scoreLabel(result: string | undefined): string {
  if (result === '1-0') return 'White wins';
  if (result === '0-1') return 'Black wins';
  if (result === '1/2-1/2') return 'Draw';
  return 'Unfinished';
}

function name(game: GameRecord | null, side: 'White' | 'Black') {
  return game?.headers[side] || side + ' pieces';
}

type DeckTool = 'moves' | 'review' | 'coach' | 'engine';

export default function App() {
  // Open to the ordinary starting position, with no fictitious game loaded.
  const [game, setGame] = useState<GameRecord | null>(null);
  const [mode, setMode] = useState<'review' | 'sandbox'>('review');
  const [tool, setTool] = useState<DeckTool>('moves');
  const toolScrollRef = useRef<HTMLDivElement>(null);
  const [sandbox, setSandbox] = useState<SandboxState>(() => createSandbox());
  const [sandboxOrientation, setSandboxOrientation] = useState<'white' | 'black'>('white');
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [importOpen, setImportOpen] = useState(false);
  const importDialog = useDialogFocus(importOpen, () => setImportOpen(false));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const movePanelRef = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState<AnalysisPreferences>(readPreferences);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const depth = preferences.depth;
  const setDepth = (value: number) => setPreferences(prev => ({ ...prev, depth: value }));
  const setEngineEnabled = (enabled: boolean) => setPreferences(prev => ({ ...prev, enabled }));
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
  // One on-demand Worker: suspend it for full-game review and line previews.
  // The preference remains on, so it resumes automatically afterward.
  const engineOn = preferences.enabled && Boolean(game) && mode === 'review'
    && pageVisible && reviewStatus !== 'running' && hintPly === null && linePreview === null;

  const annotated = useMemo(
    () => new Map(reviewReport?.rows.map(row => [row.ply, row.quality]) ?? []),
    [reviewReport],
  );

  useEffect(() => () => reviewRef.current?.cancel(), []);
  useEffect(() => savePreferences(preferences), [preferences]);
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (tool === 'coach') toolScrollRef.current?.scrollTo({ top: 0 });
  }, [tool, ply, hintPly]);

  const totalMoves = game?.moves.length ?? 0;
  const currentMove = game && ply > 0 ? game.moves[ply - 1] : undefined;
  const currentFen = game?.positions[ply] ?? new Chess().fen();
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
      if (mode !== 'review' || event.altKey || event.ctrlKey || event.metaKey || importOpen || settingsOpen) return;
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
  }, [totalMoves, importOpen, settingsOpen, mode, linePreview, game, reviewReport]);

  useEffect(() => {
    const active = movePanelRef.current?.querySelector('.move-chip.active');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [ply, game, tool]);

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
    setHintPly(target);
    setPly(target - 1);
  }

  function replayLine(target: number, kind: LinePreview['kind']) {
    if (!game || !reviewReport) return;
    const lines = coachLines(game, reviewReport, target);
    if (!lines?.[kind].steps.length) return;
    setHintPly(null);
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
      // Switching modes suspends the Worker but preserves preferences and the imported PGN.
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
    engineRef.current?.dispose();
    engineRef.current = null;
    setReviewError('');
    setReviewReport(null);
    setReviewStatus('running');
    setTool('review');
    const session = new GameReviewSession(game, reviewDepth, {
      onProgress: setReviewReport,
      onComplete: report => {
        setReviewReport(report);
        setReviewStatus('complete');
        setTool('coach');
        reviewRef.current = null;
      },
      onError: message => {
        setReviewError(message);
        setReviewStatus('error');
        setTool('review');
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
      setAnalysis(null);
      setGame(next);
      setMode('review');
      setTool('moves');
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
  const savedPositionScore = reviewReport?.scores[ply] ?? null;
  const terminalPositionScore = game ? terminalScore(currentFen) : null;
  const boardScore = linePreview ? null :
    visibleAnalysis?.score ?? savedPositionScore ?? terminalPositionScore;
  const boardScoreSource = linePreview ? 'variation' : visibleAnalysis ? 'live'
    : savedPositionScore ? 'review' : terminalPositionScore ? 'terminal' : 'none';
  const barThinking = engineOn && !visibleAnalysis && !savedPositionScore
    && (engineStatus === 'loading' || engineStatus === 'analyzing' || engineStatus === 'ready');
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
    <div className={'app-shell' + ((Boolean(game) || mode === 'sandbox') ? ' is-studying' : '')}>
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
          <button className="icon-link settings-link" title="Analysis settings" aria-label="Open analysis settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button>
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
        <div className="workspace studio-workspace">
          <section className="board-card" aria-label="Game board" id="studio-board">
            <div className="game-header">
              <div className="player-stack">
                <div className="avatar avatar-black">♚</div>
                <div><div className="player-role">BLACK</div><div className="player-name">{name(game, 'Black')}</div></div>
                {game?.headers.BlackElo && <span className="elo">{game.headers.BlackElo}</span>}
              </div>
            </div>

            <div className="board-mat">
              <div className={'board-playfield' + (!game || !preferences.showBar ? ' no-eval-bar' : '')}>
                {game && preferences.showBar && <EvaluationBar score={boardScore} source={boardScoreSource} thinking={barThinking}/>}
                <Board fen={displayFen} orientation={orientation} lastMove={displayLastMove} inCheck={displayPosition.inCheck()} bestMove={displaySuggestedMove} />
              </div>
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
            <div className="board-hud">
              <div className="board-hud-current">
                <span className="board-hud-kicker">{linePreview ? 'ENGINE VARIATION' : 'CURRENT POSITION'}</span>
                <strong className="big-san">{linePreview
                  ? (replayStep?.san || 'Start of line')
                  : currentMove ? (currentMove.number + (currentMove.color === 'w' ? '. ' : '... ') + currentMove.san) : 'Starting position'}</strong>
                {!linePreview && boardScore && <span className="hud-evaluation">{formatScore(boardScore)}</span>}
              </div>
              <button className="board-hud-copy" title="Copy current board position" aria-label="Copy board FEN" onClick={copyFen}><Copy size={14} /> FEN</button>
              {notice && <span className="board-hud-notice" role="status">{notice}</span>}
            </div>
            <div className="game-footer">
              <div className="player-stack">
                <div className="avatar avatar-white">♔</div>
                <div><div className="player-role">WHITE</div><div className="player-name">{name(game, 'White')}</div></div>
                {game?.headers.WhiteElo && <span className="elo">{game.headers.WhiteElo}</span>}
              </div>
              <button className="plain-icon" onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')} title="Flip board" aria-label="Flip board"><FlipHorizontal size={19} /></button>
            </div>
          </section>

          <section className="review-card cockpit-panel" aria-label="Game navigation and moves">
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

            <div className="cockpit-tabs" role="group" aria-label="Analysis tools" data-review-status={reviewStatus} data-tool={tool}>
              <button className={'cockpit-tab' + (tool === 'moves' ? ' active' : '')} aria-label="Moves tab" aria-pressed={tool === 'moves'} onClick={() => setTool('moves')}><ListOrdered size={16}/><span>Moves</span></button>
              <button className={'cockpit-tab' + (tool === 'review' ? ' active' : '')} aria-label="Review tab" aria-pressed={tool === 'review'} onClick={() => setTool('review')}><BarChart3 size={16}/><span>Review</span>{reviewStatus === 'running' && <i className="tab-busy-dot" aria-label="Running"/>}</button>
              <button className={'cockpit-tab' + (tool === 'coach' ? ' active' : '')} aria-label="Coach tab" aria-pressed={tool === 'coach'} onClick={() => setTool('coach')}><BrainCircuit size={16}/><span>Coach</span>{reviewReport && <i className="tab-ready-dot" aria-label="Notes available"/>}</button>
              <button className={'cockpit-tab' + (tool === 'engine' ? ' active' : '')} aria-label="Engine tab" aria-pressed={tool === 'engine'} onClick={() => setTool('engine')}><Cpu size={16}/><span>Engine</span></button>
            </div>
            <div className="cockpit-toolbar">
              <div className="cockpit-review-state">
                <span className={'cockpit-state-dot' + (reviewStatus === 'complete' ? ' complete' : reviewStatus === 'running' ? ' thinking' : '')}/>
                <span>{!game ? 'AWAITING PGN' : reviewStatus === 'complete' ? 'GAME ANALYZED' : reviewStatus === 'running' ? 'STOCKFISH REVIEWING' : 'READY FOR ANALYSIS'}</span>
              </div>
              {reviewStatus === 'running'
                ? <button className="cockpit-action stop" aria-label="Stop review from toolbar" onClick={cancelFullReview}><CircleStop size={15}/> Stop</button>
                : <button className="cockpit-action" aria-label="Review full game from toolbar" onClick={startFullReview} disabled={!game}><PlayCircle size={15}/>{reviewReport ? 'Re-review' : 'Review game'}</button>}
            </div>
            <div className="cockpit-content" id="cockpit-content" ref={toolScrollRef} aria-label={tool === 'coach' ? 'Coach notes tool panel' : tool === 'review' ? 'Full game review tool panel' : tool === 'engine' ? 'Stockfish analysis tool panel' : 'Move history tool panel'}>
              {tool === 'moves' && (
                <div className="cockpit-tool-body cockpit-moves">
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

                </div>
              )}
              {tool === 'review' && (
                <div className="cockpit-tool-body cockpit-review">
            <GameReviewPanel available={Boolean(game)} status={reviewStatus} report={reviewReport}
              error={reviewError} depth={reviewDepth} setDepth={setReviewDepth}
              selectedPly={ply} onPly={(target) => { navigateTo(target); setTool('coach'); }} onRun={startFullReview} onCancel={cancelFullReview}/>

                </div>
              )}
              {tool === 'coach' && (
                <div className="cockpit-tool-body cockpit-coach">
                  {game && reviewReport
                    ? (
<CoachNotes game={game} report={reviewReport} selectedPly={ply}
                hintPly={hintPly} onNavigate={navigateTo} onHint={showAlternative}
                preview={linePreview} onPreview={replayLine} onStep={moveLinePreview}
                onClosePreview={() => setLinePreview(null)}/>
                    )
                    : (
                      <div className="cockpit-empty">
                        <div className="cockpit-empty-icon"><BrainCircuit size={27}/></div>
                        <div className="micro-heading">UNLOCK YOUR COACH</div>
                        <h3>{!game ? 'Bring in a game first.' : reviewStatus === 'running' ? 'Stockfish is studying your game.' : 'Give your game a closer look.'}</h3>
                        <p>{!game ? 'Import a completed game to explore every decision.' : reviewStatus === 'running' ? 'Your notes will appear here when the full review finishes.' : 'Run a full review to get grounded explanations, tactical observations and legal engine continuations.'}</p>
                        {!game
                          ? <button className="primary-button" onClick={() => { setError(''); setImportOpen(true); }}><Upload size={15}/> Import a game</button>
                          : reviewStatus !== 'running' && <button className="primary-button" onClick={startFullReview}><PlayCircle size={15}/> Review this game</button>}
                      </div>
                    )}
                </div>
              )}
              {tool === 'engine' && (
                <div className="cockpit-tool-body cockpit-engine">
            <EnginePanel available={Boolean(game) && reviewStatus !== 'running'} enabled={engineOn} onToggle={() => { setHintPly(null); setEngineEnabled(!preferences.enabled); }}
              depth={depth} onDepth={setDepth} status={engineStatus} message={engineError}
              analysis={visibleAnalysis} fen={currentFen}/>

                </div>
              )}
            </div>
            <div className="transport">
              <button className="transport-btn" aria-label="Go to beginning" title="Beginning (Home)" onClick={() => navigateTo(0)} disabled={!game || ply === 0}><ChevronsLeft size={20} /></button>
              <button className="transport-btn" aria-label="Previous move" title="Previous (←)" onClick={() => navigateTo(ply - 1)} disabled={!game || ply === 0}><ArrowLeft size={20} /></button>
              <div className="move-progress"><div className="progress-track"><div style={{ width: (totalMoves ? 100 * ply / totalMoves : 0) + '%' }} /></div><span>{!game ? 'NO GAME LOADED' : ply === 0 ? 'START POSITION' : currentMove?.number + (currentMove?.color === 'w' ? '. WHITE' : '... BLACK')}</span></div>
              <button className="transport-btn" aria-label="Next move" title="Next (→)" onClick={() => navigateTo(ply + 1)} disabled={!game || ply === totalMoves}><ArrowRight size={20} /></button>
              <button className="transport-btn" aria-label="Go to end" title="End (End)" onClick={() => navigateTo(totalMoves)} disabled={!game || ply === totalMoves}><ChevronsRight size={20} /></button>
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

      {settingsOpen && (
        <AnalysisSettings preferences={preferences} onChange={setPreferences}
          onClose={() => setSettingsOpen(false)}/>
      )}

      {importOpen && (
        <div className="modal-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) setImportOpen(false); }}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" ref={importDialog} tabIndex={-1}>
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
