
import { Cpu, Play, Pause, ArrowUpRight } from 'lucide-react';
import type { Analysis } from '../lib/engine-utils';
import { formatScore, variationSan, scoreDescription } from '../lib/engine-utils';
import type { EngineState } from '../lib/engine';

type Props = {
  available: boolean; enabled: boolean; onToggle: () => void;
  depth: number; onDepth: (depth: number) => void;
  status: EngineState | 'off'; message: string;
  analysis: Analysis | null; fen: string;
};

export default function EnginePanel({ available, enabled, onToggle, depth, onDepth, status, message, analysis, fen }: Props) {
  const data = enabled && analysis?.fen === fen ? analysis : null;
  const firstMove = data?.pv[0];
  return (
    <div className="engine-panel" aria-label="Stockfish position analysis">
      <div className="engine-panel-header">
        <div className="engine-title">
          <div className="engine-icon"><Cpu size={19}/></div>
          <div><div className="micro-heading">STOCKFISH 19 LITE</div><strong>Position analysis</strong></div>
        </div>
        <button className={'engine-switch' + (enabled ? ' on' : '')} disabled={!available} aria-pressed={enabled} aria-label={enabled ? 'Pause Stockfish analysis' : 'Start Stockfish analysis'} onClick={onToggle}>
          {enabled ? <Pause size={15}/> : <Play size={15}/>} {enabled ? 'Pause' : 'Analyze'}
        </button>
      </div>
      <p className="engine-caption">Privately analyze a completed game, one position at a time. No account or server required.</p>
      <div className="engine-depth-setting">
        <label htmlFor="engine-depth">Search depth <b>{depth}</b></label>
        <input id="engine-depth" aria-label="Search depth" type="range" min={8} max={16} step={2} value={depth} onChange={event => onDepth(Number(event.target.value))} disabled={!available}/>
      </div>
      {!enabled ? <div className="engine-off">{available ? 'Analysis is paused. Press Analyze to begin.' : 'Import a completed PGN to enable engine analysis.'}</div> :
        status === 'error' ? <div className="engine-error" role="alert">{message || 'Engine unavailable.'}</div> :
        <div className="engine-output" aria-live="polite">
          <div className="engine-output-head">
            <div><div className="small-muted">EVALUATION · WHITE PERSPECTIVE</div><div className="engine-score" data-testid="engine-score">{data ? formatScore(data.score) : '—'}</div></div>
            <div className="engine-status">{status === 'loading' ? 'LOADING' : status === 'analyzing' ? 'THINKING' : data?.complete ? 'COMPLETE' : status.toUpperCase()}<span>Depth {data?.depth ?? '—'}</span></div>
          </div>
          <div className="engine-eval-track"><div style={{width: data ? (data.score.kind === 'mate' ? data.score.value > 0 ? '100%' : '0%' : Math.max(3,Math.min(97,50+data.score.value/14))+'%') : '50%'}}/></div>
          <div className="engine-assessment">{data ? scoreDescription(data.score) : 'Calculating a best continuation…'}</div>
          {data && firstMove && <div className="engine-best">
            <div className="engine-best-heading"><span><ArrowUpRight size={15}/> SUGGESTED MOVE</span><b>{variationSan(fen,[firstMove]) || firstMove}</b></div>
            <div className="engine-variation">{variationSan(fen,data.pv) || firstMove}</div>
            <small>Green arrow on the board marks Stockfish's suggested next move.</small>
          </div>}
        </div>}
      <p className="engine-license-note">Single-thread Stockfish · Local WASM · For postgame study only</p>
    </div>
  );
}
