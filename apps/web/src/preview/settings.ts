// The settings a panel can be shown in and the light it can be shown under. Plain data, so the
// link state and the controls can use it without loading the renderer.

export type SettingId = 'studio' | 'wall' | 'floor';
export type LightId = 'day' | 'evening' | 'overcast';

/** Resting camera angle per setting, in degrees: height above the horizon, and turn from straight on. */
export const SETTINGS: Record<SettingId, { label: string; elevation: number; azimuth: number }> = {
  studio: { label: 'Studio', elevation: 52, azimuth: 22 },
  wall: { label: 'Wall', elevation: 6, azimuth: 16 },
  // Straight on: the back wall and the paving run level across the view. At an angle the
  // whole room looked tipped and the figure seemed to lean.
  floor: { label: 'Floor', elevation: 30, azimuth: 0 },
};

/**
 * The sun's place is two angles, in degrees. `azimuth` is how far round it stands from straight
 * in front of the panel: negative to the left, positive to the right. It stays inside ±SUN.max,
 * so a panel hung on the wall is always lit from the front. `elevation` is its height above
 * the horizon. The customer can move the azimuth (the Sun slider); the preset's value is
 * where it rests.
 *
 *   day       a high, slightly warm sun with a bright neutral sky: crisp shadows, true colours
 *   evening   a low amber sun against a dim blue sky. The warm light and the cool shade are
 *             what make it read as evening; warm on warm only looked like a brown filter
 *   overcast  hardly any sun, a bright cool sky all round: soft, nearly shadowless, the light
 *             for judging colours against each other
 *
 * `shadow` is how dark the sun's shadows are (1 = black where the sky does not reach);
 * `reflect` scales how strongly the glaze mirrors the room.
 */
export const LIGHTS: Record<LightId, {
  label: string; sun: number; sunIntensity: number; azimuth: number; elevation: number;
  sky: number; ground: number; skyIntensity: number; exposure: number; shadow: number; reflect: number;
}> = {
  day: { label: 'Day', sun: 0xfff1dc, sunIntensity: 3.0, azimuth: -35, elevation: 50, sky: 0xf4f7ff, ground: 0xa89c8a, skyIntensity: 0.95, exposure: 1.0, shadow: 0.85, reflect: 1.0 },
  evening: { label: 'Evening', sun: 0xff9d4d, sunIntensity: 4.2, azimuth: -60, elevation: 15, sky: 0x9fb4e0, ground: 0x5d4a3c, skyIntensity: 0.5, exposure: 1.0, shadow: 0.9, reflect: 0.6 },
  overcast: { label: 'Overcast', sun: 0xf2f5ff, sunIntensity: 0.45, azimuth: -20, elevation: 65, sky: 0xeef2ff, ground: 0xb3b0aa, skyIntensity: 2.2, exposure: 0.95, shadow: 0.3, reflect: 1.15 },
};

/** The Sun slider: degrees either side of straight on, and its step. */
export const SUN = { min: -80, max: 80, step: 5 };

/** A link's sun angle made valid: a whole step inside the slider's range, or null if it is not a number. */
export function cleanSun(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  // `|| 0`: rounding a small negative angle gives -0, which would print as "-0".
  return Math.min(SUN.max, Math.max(SUN.min, Math.round(value / SUN.step) * SUN.step)) || 0;
}

/**
 * The direction the sun shines from (x right, y up, z towards the viewer), as a unit vector.
 * `azimuth` null means the light's own resting place.
 */
export function sunDirection(light: LightId, azimuth: number | null): [number, number, number] {
  const l = LIGHTS[light];
  const az = ((azimuth ?? l.azimuth) * Math.PI) / 180, el = (l.elevation * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

export const SETTING_IDS = Object.keys(SETTINGS) as SettingId[];
export const LIGHT_IDS = Object.keys(LIGHTS) as LightId[];
export const DEFAULT_SETTING: SettingId = 'studio';
export const DEFAULT_LIGHT: LightId = 'day';
