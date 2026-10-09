import { useEffect } from 'react';
import { Cpu, Settings2, X } from 'lucide-react';
import type { AnalysisPreferences } from '../lib/preferences';

type Props = {
  preferences: AnalysisPreferences;
  onChange: (value: AnalysisPreferences) => void;
  onClose: () => void;
};

export default function AnalysisSettings({ preferences, onChange, onClose }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch: Partial<AnalysisPreferences>) => onChange({ ...preferences, ...patch });
  return (
    <div className="modal-backdrop settings-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="import-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-settings-title">
        <div className="modal-head">
          <div>
            <div className="micro-heading"><Settings2 size={13}/> LOCAL ANALYSIS</div>
            <h2 id="analysis-settings-title">Engine settings</h2>
          </div>
          <button className="plain-icon" onClick={onClose} aria-label="Close settings" autoFocus><X size={20}/></button>
        </div>
        <p>Make the chessboard feel alive without burning CPU when you aren't using it.</p>
        <div className="settings-field">
          <div className="settings-field-line">
            <div>
              <div className="settings-field-title"><Cpu size={17}/> Automatic Stockfish</div>
              <div className="settings-field-description">Start evaluating whenever you open an imported game or select another move.</div>
            </div>
            <label className="settings-switch" aria-label="Analyze imported games automatically">
              <input type="checkbox" role="switch" aria-label="Analyze imported games automatically"
                checked={preferences.enabled} onChange={event => set({ enabled: event.target.checked })}/>
              <span className="settings-switch-track" aria-hidden="true"/>
            </label>
          </div>
        </div>
        <div className="settings-field">
          <div className="settings-field-line">
            <label htmlFor="settings-engine-depth" className="settings-field-title">Position search depth</label>
            <strong className="settings-depth-value">{preferences.depth}</strong>
          </div>
          <input id="settings-engine-depth" type="range" min={8} max={16} step={2}
            value={preferences.depth} onChange={event => set({ depth: Number(event.target.value) })}/>
          <div className="settings-range-labels"><span>8 · Faster</span><span>16 · More thorough</span></div>
          <div className="settings-field-description">Higher depth can use more processing time. Full-game review has its own depth setting in the Review tab.</div>
        </div>
        <div className="settings-field">
          <div className="settings-field-line">
            <div>
              <div className="settings-field-title">Evaluation bar</div>
              <div className="settings-field-description">Show White's and Black's estimated balance alongside the game board.</div>
            </div>
            <label className="settings-switch" aria-label="Show evaluation bar">
              <input type="checkbox" role="switch" aria-label="Show evaluation bar"
                checked={preferences.showBar} onChange={event => set({ showBar: event.target.checked })}/>
              <span className="settings-switch-track" aria-hidden="true"/>
            </label>
          </div>
        </div>
        <div className="settings-explain">
          Stockfish pauses during full-game reviews, Free Board practice, and engine-line previews, then automatically resumes when you return. Turning it off stops new calculations; saved review evaluations remain visible.
        </div>
        <button className="primary-button settings-done" onClick={onClose}>Done</button>
        <div className="modal-footnote">Preferences are saved in this browser only. Nothing is uploaded.</div>
      </section>
    </div>
  );
}
