import { describe, it, expect } from 'vitest';
import { normalizePreferences, DEFAULT_PREFERENCES } from '../src/lib/preferences';
import { whiteBarShare, barAdvantageText } from '../src/lib/evaluation';

describe('evaluation bar has stable score semantics', () => {
  it('shows a balanced half-white/half-black bar at zero or while waiting', () => {
    expect(whiteBarShare(null)).toBe(50);
    expect(whiteBarShare({kind:'cp', value:0})).toBe(50);
  });
  it('expands White at positive scores and Black at negative scores', () => {
    expect(whiteBarShare({kind:'cp', value:200})).toBeGreaterThan(50);
    expect(whiteBarShare({kind:'cp', value:-200})).toBeLessThan(50);
    expect(whiteBarShare({kind:'cp', value:200}) + whiteBarShare({kind:'cp', value:-200})).toBeCloseTo(100);
    expect(barAdvantageText({kind:'cp',value:-180})).toBe('Black advantage');
  });
  it('fills either side for forced mating scores', () => {
    expect(whiteBarShare({kind:'mate',value:3})).toBe(100);
    expect(whiteBarShare({kind:'mate',value:-1})).toBe(0);
    expect(barAdvantageText({kind:'mate',value:-1})).toContain('Black');
  });
});

describe('persisted engine controls', () => {
  it('enables analysis and evaluation bar by default at a modest depth', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.enabled).toBe(true);
  });
  it('validates corrupt values and preserves explicit off switches', () => {
    expect(normalizePreferences({enabled:false,depth:99,showBar:false})).toEqual({enabled:false,depth:16,showBar:false});
    expect(normalizePreferences({enabled:true,depth:'oops',showBar:true}).depth).toBe(10);
  });
});
