import { BarChart3, CircleStop, ListChecks, PlayCircle, RotateCcw } from 'lucide-react';
import { formatScore } from '../lib/engine-utils';
import { scoreToGraph, type Quality, type ReviewReport } from '../lib/game-review';

export type ReviewStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'error';
type Props = {
  available: boolean;
  status: ReviewStatus;
  report: ReviewReport | null;
  error: string;
  depth: number;
  setDepth: (value: number) => void;
  selectedPly: number;
  onPly: (ply: number) => void;
  onRun: () => void;
  onCancel: () => void;
};

const qualities: Quality[] = ['Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];

export default function GameReviewPanel({
  available, status, report, error, depth, setDepth, selectedPly, onPly, onRun, onCancel,
}: Props) {
  const total = report?.total ?? 0;
  const completed = report?.completed ?? 0;
  const positions = report?.scores
    .map((score, ply) => score === null ? null : ({ ply, value: scoreToGraph(score) }))
    .filter((x): x is { ply: number; value: number } => x !== null) ?? [];
  const xScale = (ply: number) => 28 + (ply / Math.max(1, total - 1)) * 550;
  const yScale = (value: number) => 110 - value * 17;
  const line = positions.map(x => xScale(x.ply) + ',' + yScale(x.value)).join(' ');
  const current = report?.scores[selectedPly] ?? null;
  const counts = Object.fromEntries(qualities.map(q => [q, report?.rows.filter(row => row.quality === q).length ?? 0])) as Record<Quality, number>;
  const critical = report?.rows.filter(row => row.quality === 'Mistake' || row.quality === 'Blunder') ?? [];

  return (
    <section className="full-review" aria-label="Full game review">
      <div className="full-review-top">
        <div className="review-feature-title">
          <div className="review-feature-icon"><BarChart3 size={19}/></div>
          <div><div className="micro-heading">PHASE 03 / GAME REVIEW</div><strong>Review the entire game</strong></div>
        </div>
        {status === 'running' ?
          <button className="full-review-btn stop" onClick={onCancel} aria-label="Cancel full game review"><CircleStop size={16}/> Stop</button> :
          <button className="full-review-btn" onClick={onRun} disabled={!available} aria-label="Run full game review">
            {report ? <RotateCcw size={16}/> : <PlayCircle size={16}/>}
            {report ? 'Run again' : 'Review game'}
          </button>}
      </div>
      <p className="full-review-intro">Let Stockfish evaluate every position, then explore the game's turning points. Runs on your device.</p>
      <div className="full-review-controls">
        <label htmlFor="review-depth">Review depth <strong>{depth}</strong></label>
        <input id="review-depth" aria-label="Full review depth" type="range" min={6} max={12} step={2} value={depth} disabled={status === 'running' || !available} onChange={event => setDepth(Number(event.target.value))}/>
      </div>
      {status === 'running' && (
        <div className="review-progress" role="status">
          <div className="review-progress-track"><div style={{width: total ? (completed / total * 100) + '%' : '0%'}}/></div>
          <span>Analyzing {completed} of {total} positions · Keep this page open</span>
        </div>
      )}
      {status === 'error' && <div className="review-error" role="alert">{error}</div>}
      {!report && status !== 'error' && status !== 'running' && (
        <div className="review-empty"><ListChecks size={17}/> {available ? 'Select Review game to analyze the moves.' : 'Import a finished game to unlock full review.'}</div>
      )}
      {report && (
        <>
          <div className="review-chart-heading">
            <b>Evaluation timeline</b>
            <span>{current ? formatScore(current) : '—'} · White perspective</span>
          </div>
          <div className="review-chart" aria-label="Game evaluation line graph, White positive and Black negative">
            <svg viewBox="0 0 600 220" role="img" aria-label={'White-positive position scores for ' + completed + ' positions'}>
              <line x1="28" x2="578" y1="25" y2="25" className="review-grid-line"/>
              <line x1="28" x2="578" y1="110" y2="110" className="review-grid-zero"/>
              <line x1="28" x2="578" y1="195" y2="195" className="review-grid-line"/>
              <text x="5" y="29" className="review-axis-label">+5</text>
              <text x="15" y="114" className="review-axis-label">0</text>
              <text x="5" y="199" className="review-axis-label">−5</text>
              {line && <polyline points={line} className="review-eval-line"/>}
              {positions.map(({ply, value}) => <circle key={ply} cx={xScale(ply)} cy={yScale(value)} r={ply === selectedPly ? 5.5 : 2} className={ply === selectedPly ? 'review-point-selected' : 'review-point'}/>)}
              {report.rows.filter(row => row.quality === 'Blunder').map(row =>
                <circle key={'bad-' + row.ply} cx={xScale(row.ply)} cy={yScale(scoreToGraph(row.score))} r="5" className="review-point-blunder"/>)}
            </svg>
          </div>
          <div className="review-chart-foot"><span>Move 1</span><span>Engine estimate · clipped at ±5 pawns</span><span>Last move</span></div>
          <div className="review-quality">
            {qualities.map(quality => (
              <div key={quality} className={'quality-stat quality-' + quality.toLowerCase()}>
                <span>{quality}</span><strong>{counts[quality]}</strong>
              </div>
            ))}
          </div>
          <div className="review-critical-heading">Moves worth revisiting</div>
          {critical.length ? (
            <div className="review-critical-list">
              {critical.map(row =>
                <button key={row.ply} onClick={() => onPly(row.ply)} className={'review-critical-item' + (selectedPly === row.ply ? ' selected' : '')}>
                  <span className={'quality-dot quality-' + row.quality.toLowerCase()}/>
                  <span className="critical-move">{Math.ceil(row.ply / 2)}{row.color === 'w' ? '.' : '...'} {row.san}</span>
                  <span className="critical-label">{row.quality} · {row.loss} cp lost</span>
                </button>
              )}
            </div>
          ) : <p className="review-no-critical">{status === 'complete' ? 'No major mistakes found at this depth.' : 'No major mistakes detected in the analyzed portion yet.'}</p>}
          <div className="review-estimate-note">
            {status === 'complete' ? 'Review complete. ' : status === 'cancelled' ? 'Partial review. ' : status === 'error' ? 'Incomplete review. ' : ''}
            Labels are rough centipawn-loss estimates at depth {report.depth}, not Chess.com accuracy or verified coaching judgments.
          </div>
        </>
      )}
    </section>
  );
}
