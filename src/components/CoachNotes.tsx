import { ArrowRight, BookOpenCheck, Crosshair, Eye, Target } from 'lucide-react';
import type { GameRecord } from '../lib/pgn';
import type { ReviewReport } from '../lib/game-review';
import { buildGameSummary, buildMoveInsight } from '../lib/insights';

type Props = {
  game: GameRecord;
  report: ReviewReport;
  selectedPly: number;
  hintPly: number | null;
  onNavigate: (ply: number) => void;
  onHint: (ply: number) => void;
};

export default function CoachNotes({ game, report, selectedPly, hintPly, onNavigate, onHint }: Props) {
  const summary = buildGameSummary(game, report);
  const focus = hintPly !== null && selectedPly === hintPly - 1 ? hintPly : selectedPly;
  const insight = buildMoveInsight(game, report, focus);
  const beforeView = hintPly === focus && selectedPly === focus - 1;
  const canShow = Boolean(insight?.bestUci && !insight.sameAsBest);

  return (
    <section className="coach-panel" aria-label="Coach Notes">
      <div className="coach-panel-head">
        <div className="coach-icon"><BookOpenCheck size={20}/></div>
        <div><div className="micro-heading">PHASE 06 · EXPLAIN THE GAME</div><h3>Coach Notes</h3></div>
        <span className="coach-proof-label">ENGINE + BOARD FACTS</span>
      </div>
      <div className="coach-summary">
        <div className="coach-subheading"><Target size={15}/> Game at a glance</div>
        <p>{summary.description}</p>
        <div className="coach-stats">
          <div><strong>{summary.reviewedMoves}<span>/{summary.totalMoves}</span></strong><small>Moves reviewed</small></div>
          <div><strong>{summary.best}</strong><small>Engine picks</small></div>
          <div><strong>{summary.whiteCritical} / {summary.blackCritical}</strong><small>W / B mistakes</small></div>
        </div>
        <div className="coach-factline">{summary.captures} captures · {summary.checks} checks in analyzed moves{!summary.complete ? ' · Partial review' : ''}</div>
      </div>

      <div className="coach-move-card">
        <div className="coach-subheading"><Crosshair size={16}/> Move-by-move insight</div>
        {insight ? (
          <>
            <div className="coach-move-heading">
              <strong>{insight.heading}</strong>
              <span className={'coach-quality coach-' + insight.quality.toLowerCase()}>{insight.quality}</span>
            </div>
            {beforeView && (
              <div className="coach-before-banner" role="status">
                <Eye size={17}/>
                <div>Showing the board <b>before</b> {insight.heading}, with Stockfish's suggested move arrow.</div>
                <button onClick={() => onNavigate(insight.ply)}>Return</button>
              </div>
            )}
            <p className="coach-assessment">{insight.assessment}</p>
            <div className="coach-scores">
              <div><span>BEFORE</span><strong>{insight.scoreBefore}</strong></div>
              <ArrowRight size={17}/>
              <div><span>AFTER</span><strong>{insight.scoreAfter}</strong></div>
              <small>White's perspective</small>
            </div>
            <div className="coach-subheading small">What the board confirms</div>
            <ul className="coach-observations">
              {insight.observations.map((fact,i) => <li key={i}>{fact}</li>)}
            </ul>
            <div className="coach-alternative">
              <div className="coach-alternative-title"><Eye size={16}/> Compare with Stockfish</div>
              <p>{insight.comparison}</p>
              {canShow && !beforeView && (
                <button onClick={() => onHint(insight.ply)} aria-label="Show best alternative on board">
                  <Eye size={16}/> Show the alternative on the board
                </button>
              )}
              {beforeView && <span className="coach-alt-caption">Green arrow starts from the position before the move.</span>}
            </div>
          </>
        ) : (
          <div className="coach-unavailable">
            {selectedPly === 0
              ? 'Select any analyzed move in the move history to read its notes.'
              : 'This position has not been fully reviewed yet. Finish the game review to unlock its explanation.'}
          </div>
        )}
      </div>

      {summary.turningPoints.length > 0 && (
        <div className="coach-turns">
          <div className="coach-subheading"><Target size={15}/> Biggest evaluation swings</div>
          {summary.turningPoints.map(row => (
            <button key={row.ply} onClick={() => onNavigate(row.ply)}>
              <span>{Math.ceil(row.ply / 2)}{row.color === 'w' ? '.' : '...'} {row.san}</span>
              <span>{row.quality} · {(row.loss / 100).toFixed(2)} pawns</span>
              <ArrowRight size={15}/>
            </button>
          ))}
        </div>
      )}
      <div className="coach-caveat">
        These are transparent, rule-based notes—not generated chess commentary. Board events are verified with chess.js; move assessments come from Stockfish at depth {report.depth}. The app cannot yet prove a tactical cause for an evaluation drop, and shallow analysis may change.
      </div>
    </section>
  );
}
