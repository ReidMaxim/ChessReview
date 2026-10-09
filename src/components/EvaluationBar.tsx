import type { Score } from '../lib/engine-utils';
import { formatScore } from '../lib/engine-utils';
import { barAdvantageText, whiteBarShare } from '../lib/evaluation';

type Props = {
  score: Score | null;
  source: 'live' | 'review' | 'terminal' | 'none' | 'variation';
  thinking: boolean;
};

export default function EvaluationBar({ score, source, thinking }: Props) {
  const whiteShare = whiteBarShare(score);
  const note = source === 'variation'
    ? 'Engine variation · no stored evaluation'
    : score
      ? barAdvantageText(score) + ' · ' + (source === 'review' ? 'saved game review' : source === 'terminal' ? 'final position' : 'live Stockfish')
      : thinking ? 'Stockfish analyzing this position' : 'No position evaluation yet';
  const label = score ? formatScore(score) : '—';
  return (
    <div className="evaluation-bar" role="meter" aria-label="Position evaluation"
      aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(whiteShare)}
      aria-valuetext={note + (score ? ' · ' + label : '')}
      data-testid="evaluation-bar"
      data-score-source={source}
      data-white-share={whiteShare.toFixed(1)}
      title={note + (score ? ' · ' + label : '')}>
      <div className="evaluation-track" aria-hidden="true">
        <div className="evaluation-white" style={{ height: whiteShare + '%' }}/>
        <div className="evaluation-half-line"/>
        <div className="evaluation-score">{label}</div>
      </div>
      <span className="evaluation-bar-footer" aria-hidden="true">{thinking && !score ? '···' : source === 'variation' ? 'PV' : 'SF'}</span>
    </div>
  );
}
