import { describe, expect, it } from 'vitest';
import { PAL, SIZES } from '@zellige/engine';
import { billOfMaterials, buildPanel, tallyPieces, PAL as GLAZES } from '@zellige/engine';
import { QUOTE_ADDRESS, quoteMailto } from './quote';
import { DEFAULT_CONFIG, fullPalette, normaliseHex, parseConfig, serialiseConfig, withGlaze } from './config';

describe('link state', () => {
  it('the plain address is the default panel', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
    expect(serialiseConfig(DEFAULT_CONFIG)).toBe('');
  });

  it('round-trips every choice', () => {
    const c = { size: 13, medallion: 'lee' as const, unitCm: 2.5, view: 'wall' as const, light: 'evening' as const, sun: 40, palette: { B: '#7a1f2b', A: '#c0c0c0' } };
    const q = serialiseConfig(c);
    expect(q).toBe('size=13&medallion=lee&scale=2.5&view=wall&light=evening&sun=40&B=7a1f2b&A=c0c0c0');
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

  it('the sun angle is kept to the slider, and its resting place is not written', () => {
    expect(parseConfig('?sun=40').sun).toBe(40);
    expect(parseConfig('?sun=-200').sun).toBe(-80);
    expect(parseConfig('?sun=43').sun).toBe(45);
    expect(parseConfig('?sun=-2').sun).toBe(0);
    for (const bad of ['east', '1.5', '', '4e1']) expect(parseConfig(`?sun=${bad}`).sun).toBeNull();
    // Day rests at -35 and evening at -60: the same angle is a choice under one and not the other.
    expect(parseConfig('?sun=-35').sun).toBeNull();
    expect(parseConfig('?light=evening&sun=-35').sun).toBe(-35);
    expect(serialiseConfig({ ...DEFAULT_CONFIG, sun: -35 })).toBe('');
    expect(serialiseConfig({ ...DEFAULT_CONFIG, sun: 0 })).toBe('sun=0');
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

describe('quote request', () => {
  it('writes the design into an email for the customer to send', () => {
    const panel = buildPanel();
    const bill = billOfMaterials(tallyPieces(panel.pieces), { side: panel.panel.side });
    const link = 'https://example.com/?size=10&B=7a1f2b';
    const href = quoteMailto(DEFAULT_CONFIG, bill, { ...GLAZES, B: '#7a1f2b' }, link, { name: ' Amina ', notes: 'For a courtyard wall.\nBy March & no later.' });
    expect(href.startsWith(`mailto:${QUOTE_ADDRESS}?subject=`)).toBe(true);
    // Everything after the address is encoded: no raw spaces, line breaks or ampersands in the text.
    const query = href.slice(href.indexOf('?') + 1);
    expect(query).not.toMatch(/[ \r\n#]/);
    expect(query.split('&')).toHaveLength(2);
    const q = new URLSearchParams(query.replace(/\+/g, '%2B'));
    expect(q.get('subject')).toBe('Quote request: zellige panel, 2.08 m square');
    const body = q.get('body')!;
    expect(body).toContain('Pieces to cut: 10,209');
    expect(body).toContain('Lapis blue #7a1f2b: 392 pieces');
    expect(body).toContain('(sample prices)');
    expect(body).toContain(`Design: ${link}`);
    expect(body).toContain('Notes:\r\nFor a courtyard wall.\nBy March & no later.');
    expect(body.endsWith('Thank you,\r\nAmina')).toBe(true);
  });

  it('leaves the notes out when there are none', () => {
    const panel = buildPanel({ size: 7 });
    const bill = billOfMaterials(tallyPieces(panel.pieces), { side: panel.panel.side });
    const body = new URLSearchParams(quoteMailto({ ...DEFAULT_CONFIG, size: 7 }, bill, GLAZES, 'https://example.com/', { name: 'A', notes: '  ' }).split('?')[1]).get('body')!;
    expect(body).not.toContain('Notes:');
  });
});
