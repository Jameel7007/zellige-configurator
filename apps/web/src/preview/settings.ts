// The settings a panel can be shown in and the light it can be shown under. Plain data, so the
// link state and the controls can use it without loading the renderer.

export type SettingId = 'studio' | 'wall' | 'floor';
export type LightId = 'day' | 'evening' | 'overcast';

/** Resting camera angle per setting, in degrees: height above the horizon, and turn from straight on. */
export const SETTINGS: Record<SettingId, { label: string; elevation: number; azimuth: number }> = {
  studio: { label: 'Studio', elevation: 52, azimuth: 22 },
  wall: { label: 'Wall', elevation: 6, azimuth: 16 },
  floor: { label: 'Floor', elevation: 34, azimuth: 24 },
};

/**
 * `from` is the direction the sun shines from (x right, y up, z towards the viewer). Every
 * preset keeps z positive, so a panel hung on the wall is always lit from the front.
 */
export const LIGHTS: Record<LightId, {
  label: string; sun: number; sunIntensity: number; from: [number, number, number];
  sky: number; ground: number; skyIntensity: number; exposure: number;
}> = {
  day: { label: 'Day', sun: 0xfff0d8, sunIntensity: 2.6, from: [-0.9, 2.2, 1.3], sky: 0xfff6ea, ground: 0x9c907e, skyIntensity: 1.1, exposure: 1.0 },
  evening: { label: 'Evening', sun: 0xffb46b, sunIntensity: 3.2, from: [-2.2, 0.8, 1.4], sky: 0xffd9b0, ground: 0x6f5a4a, skyIntensity: 0.5, exposure: 0.95 },
  overcast: { label: 'Overcast', sun: 0xf2f5ff, sunIntensity: 0.5, from: [-0.4, 2.4, 1.0], sky: 0xf3f6ff, ground: 0xa7a59f, skyIntensity: 2.3, exposure: 0.95 },
};

export const SETTING_IDS = Object.keys(SETTINGS) as SettingId[];
export const LIGHT_IDS = Object.keys(LIGHTS) as LightId[];
export const DEFAULT_SETTING: SettingId = 'studio';
export const DEFAULT_LIGHT: LightId = 'day';
