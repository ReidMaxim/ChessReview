import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpenCheck, Crosshair, Eye, Target, Play, X } from 'lucide-react';
import type { GameRecord } from '../lib/pgn';
import type { ReviewReport } from '../lib/game-review';
import { buildGameSummary, buildMoveInsight } from '../lib/insights';
import { coachLines, describeConsequence, type CoachLine } from '../lib/coach-intelligence';

export type LinePreview = { anchorPly: number; kind: 'alternative' | 'consequence'; step: number };

type Props = {
  game: GameRecord;
  report: ReviewReport;
  selectedPly: number;
  hintPly: number | null;
  onNavigate: (ply: number) => void;
  onHint: (ply: number) => void;
  preview: LinePreview | null;
  onPreview: (ply: number, kind: LinePreview['kind']) => void;
  onStep: (step: number) => void;
  onClosePreview: () => void;
};

function LineControl({
  title, line, selected, onClick,
}: {
  title: string; line: CoachLine; selected: boolean; onClick: () => void;
}) {
  return (
    <div className={'coach-line-option' + (selected ? ' selected' : '')}>
      <div className="coach-line-header"><span>{title}</span><span>{line.steps.length} moves shown</span></div>
      <div className="coach-line-moves">
        {line.steps.length
          ? line.steps.slice(0, 8).map((move,i) => <span key={i}>{move.san}</span>)
          : <span>No legal engine continuation saved at this depth.</span>}
      </div>
      <button disabled={!line.steps.length} onClick={onClick} aria-label={'Replay ' + title.toLowerCase() + ' on board'}>
        <Play size={15}/> Replay on the board
      </button>
    </div>
  );
}

export default function CoachNotes({
  game, report, selectedPly, hintPly, onNavigate, onHint,
  preview, onPreview, onStep, onClosePreview,
}: Props) {
  const [technical, setTechnical] = useState(false);
  const summary = buildGameSummary(game, report);
  const focus = hintPly !== null && selectedPly === hintPly - 1 ? hintPly : selectedPly;
  const insight = buildMoveInsight(game, report, focus);
  const beforeView = hintPly === focus && selectedPly === focus - 1;
  const canShow = Boolean(insight?.bestUci && !insight.sameAsBest);
  const lines = coachLines(game, report, focus);
  const consequence = insight && lines ? describeConsequence(game, focus, lines.consequence.steps) : null;
  const currentPreview = preview && preview.anchorPly === focus ? preview : null;
  const activeLine = currentPreview && lines ? lines[currentPreview.kind] : null;

  return (
    <section className="coach-panel" aria-label="Coach Notes">
      <div className="coach-panel-head">
        <div className="coach-icon"><BookOpenCheck size={20}/></div>
        <div><div className="micro-heading">PHASE 06.5 · CHESS INTELLIGENCE</div><h3>Coach Notes</h3></div>
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
        <div className="coach-subheading"><Crosshair size={16}/> Let's look at that move
          <div className="coach-voice-options">
            <button aria-pressed={!technical} className={!technical ? 'chosen' : ''} onClick={() => setTechnical(false)}>Coach</button>
            <button aria-pressed={technical} className={technical ? 'chosen' : ''} onClick={() => setTechnical(true)}>Technical</button>
          </div>
        </div>
        {insight ? (
          <>
            <div className="coach-move-heading"><strong>{insight.heading}</strong><span className={'coach-quality coach-' + insight.quality.toLowerCase()}>{insight.quality}</span></div>
            {beforeView && (
              <div className="coach-before-banner" role="status">
                <Eye size={17}/>
                <div>Showing the board <b>before</b> {insight.heading}, with Stockfish's suggested move arrow.</div>
                <button onClick={() => onNavigate(insight.ply)}>Return</button>
              </div>
            )}
            <p className="coach-assessment">{technical
              ? 'At depth ' + report.depth + ', this was classified ' + insight.quality.toLowerCase() + '. The evaluation changed from ' + insight.scoreBefore + ' to ' + insight.scoreAfter + ' from White’s perspective.'
              : insight.assessment}</p>

            {consequence && consequence.kind !== 'insufficient' && (
              <div className="coach-key-point" data-testid="coach-consequence">
                <strong>{consequence.headline}</strong>
                <p>{consequence.description}</p>
              </div>
            )}

            <div className="coach-scores">
              <div><span>BEFORE</span><strong>{insight.scoreBefore}</strong></div>
              <ArrowRight size={17}/>
              <div><span>AFTER</span><strong>{insight.scoreAfter}</strong></div>
              <small>White's perspective</small>
            </div>
            <div className="coach-subheading small">What the board confirms</div>
            <ul className="coach-observations">{insight.observations.map((fact,i) => <li key={i}>{fact}</li>)}</ul>
            <div className="coach-alternative">
              <div className="coach-alternative-title"><Eye size={16}/> What could I have played instead?</div>
              <p>{insight.comparison}</p>
              {canShow && !beforeView && <button onClick={() => onHint(insight.ply)} aria-label="Show best alternative on board"><Eye size={16}/> Show the alternative on the board</button>}
              {beforeView && <span className="coach-alt-caption">Green arrow starts from the position before the move.</span>}
            </div>
            {lines && (
              <div className="coach-evidence-lines">
                <div className="coach-subheading small">See it for yourself</div>
                <p className="coach-evidence-intro">These are real Stockfish continuations, replayed as legal chess moves. They illustrate possibilities, not guaranteed outcomes.</p>
                <LineControl title="What Stockfish expects next" line={lines.consequence}
                  selected={currentPreview?.kind === 'consequence'} onClick={() => onPreview(focus, 'consequence')}/>
                <LineControl title="A stronger alternative" line={lines.alternative}
                  selected={currentPreview?.kind === 'alternative'} onClick={() => onPreview(focus, 'alternative')}/>
                {currentPreview && activeLine && (
                  <div className="coach-replay-controls" role="group" aria-label="Engine line replay controls">
                    <div className="coach-replay-caption">
                      <b>Exploring {currentPreview.kind === 'consequence' ? 'Stockfish’s reply' : 'the better line'}</b>
                      <span>Board step {currentPreview.step} / {activeLine.steps.length}</span>
                    </div>
                    <div className="coach-replay-actions">
                      <button aria-label="Previous engine line move" disabled={currentPreview.step === 0} onClick={() => onStep(currentPreview.step - 1)}><ArrowLeft size={16}/> Previous</button>
                      <button aria-label="Next engine line move" disabled={currentPreview.step >= activeLine.steps.length} onClick={() => onStep(currentPreview.step + 1)}>Next <ArrowRight size={16}/></button>
                      <button aria-label="Close engine line replay" onClick={onClosePreview}><X size={16}/> Back to game</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="coach-unavailable">{selectedPly === 0
            ? 'Select any analyzed move in the move history to read its notes.'
            : 'This position has not been fully reviewed yet. Finish the game review to unlock its explanation.'}</div>
        )}
      </div>
      {summary.turningPoints.length > 0 && (
        <div className="coach-turns">
          <div className="coach-subheading"><Target size={15}/> Biggest evaluation swings</div>
          {summary.turningPoints.map(row => (
            <button key={row.ply} onClick={() => onNavigate(row.ply)}>
              <span>{Math.ceil(row.ply / 2)}{row.color === 'w' ? '.' : '...'} {row.san}</span>
              <span>{row.quality} · {(row.loss / 100).toFixed(2)} pawns</span><ArrowRight size={15}/>
            </button>
          ))}
        </div>
      )}
      <div className="coach-caveat">
        Built from legal moves and local Stockfish searches at depth {report.depth}. Motifs are identified from shown variations and may not prove the overall reason for an evaluation swing. No generated chess claims, user data uploads or paid service.
      </div>
    </section>
  );
}
