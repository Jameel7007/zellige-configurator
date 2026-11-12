import { describe, expect, it } from 'vitest';
import { PAL, SIZES } from '@zellige/engine';
import { DEFAULT_CONFIG, fullPalette, normaliseHex, parseConfig, serialiseConfig, withGlaze } from './config';

describe('link state', () => {
  it('the plain address is the default panel', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
    expect(serialiseConfig(DEFAULT_CONFIG)).toBe('');
  });

  it('round-trips every choice', () => {
    const c = { size: 13, medallion: 'lee' as const, unitCm: 2.5, view: 'wall' as const, light: 'evening' as const, palette: { B: '#7a1f2b', A: '#c0c0c0' } };
    const q = serialiseConfig(c);
    expect(q).toBe('size=13&medallion=lee&scale=2.5&view=wall&light=evening&B=7a1f2b&A=c0c0c0');
    expect(parseConfig('?' + q)).toEqual(c);
  });

  it('a bad link opens the nearest valid panel', () => {
    expect(parseConfig('?size=99').size).toBe(SIZES.max);
    expect(parseConfig('?size=1').size).toBe(SIZES.min);
    for (const bad of ['ten', '10.5', '-3', '', '1e1']) expect(parseConfig(`?size=${bad}`).size).toBe(SIZES.default);
    expect(parseConfig('?medallion=nope').medallion).toBe('moorish');
    for (const bad of ['2.50', '4', '0', 'big', '-2', '2e0']) expect(parseConfig(`?scale=${bad}`).unitCm).toBe(2);
    expect(parseConfig('?scale=1.5').unitCm).toBe(1.5);
    expect(parseConfig('?scale=3').unitCm).toBe(3);
    expect(parseConfig('?view=ceiling&light=disco')).toMatchObject({ view: 'studio', light: 'day' });
    expect(parseConfig('?view=floor&light=overcast')).toMatchObject({ view: 'floor', light: 'overcast' });
    expect(parseConfig('?B=red&T=%23fff&Z=000000').palette).toEqual({});
  });

  it('the held-back medallion cannot be reached by a link', () => {
    expect(parseConfig('?medallion=polar').medallion).toBe('moorish');
  });

  it('colours are normalised, and a default colour is not an override', () => {
    expect(normaliseHex('#7A1F2B')).toBe('#7a1f2b');
    expect(normaliseHex('7a1f2b')).toBe('#7a1f2b');
    expect(normaliseHex('#abc')).toBeNull();
    expect(parseConfig(`?B=${PAL.B.slice(1)}`).palette).toEqual({});
    expect(parseConfig('?B=%237A1F2B').palette).toEqual({ B: '#7a1f2b' });
  });

  it('withGlaze adds an override and removes it when set back', () => {
    const a = withGlaze(DEFAULT_CONFIG, 'B', '#7A1F2B');
    expect(a.palette).toEqual({ B: '#7a1f2b' });
    expect(DEFAULT_CONFIG.palette).toEqual({});
    expect(fullPalette(a).B).toBe('#7a1f2b');
    expect(fullPalette(a).T).toBe(PAL.T);
    expect(withGlaze(a, 'B', PAL.B).palette).toEqual({});
    expect(withGlaze(a, 'B', 'nonsense').palette).toEqual({});
  });
});
