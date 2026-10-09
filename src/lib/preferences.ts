export type AnalysisPreferences = {
  enabled: boolean;
  depth: number;
  showBar: boolean;
};

export const PREFS_KEY = 'chessreview.analysis.v1';
export const DEFAULT_PREFERENCES: AnalysisPreferences = {
  enabled: true,
  depth: 10,
  showBar: true,
};

export function normalizePreferences(value: unknown): AnalysisPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFERENCES };
  const input = value as Record<string, unknown>;
  const d = Number(input.depth);
  const depth = Number.isFinite(d) ? Math.max(8, Math.min(16, Math.round(d / 2) * 2)) : DEFAULT_PREFERENCES.depth;
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_PREFERENCES.enabled,
    depth,
    showBar: typeof input.showBar === 'boolean' ? input.showBar : DEFAULT_PREFERENCES.showBar,
  };
}

export function readPreferences(): AnalysisPreferences {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCES };
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? normalizePreferences(JSON.parse(raw)) : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: AnalysisPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFS_KEY, JSON.stringify(normalizePreferences(prefs)));
    }
  } catch {
    // Storage can be denied in private / restricted browsing modes.
  }
}
