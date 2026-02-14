export const BATTLEFIELD_ASPECT_WIDTH = 16;
export const BATTLEFIELD_ASPECT_HEIGHT = 9;
export const MIN_BATTLEFIELD_WIDTH = 1920;
export const MIN_BATTLEFIELD_HEIGHT = 1080;
const UI_VERTICAL_RESERVE = 40;

export function deriveBattlefieldSize(baseWidth: number, _baseHeight: number): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.floor(baseWidth));
  const safeHeight = Math.max(1, Math.floor(_baseHeight - UI_VERTICAL_RESERVE));
  const dynamicAspect = safeWidth / safeHeight;
  const width = Math.max(MIN_BATTLEFIELD_WIDTH, safeWidth);
  const height = Math.max(MIN_BATTLEFIELD_HEIGHT, Math.round(width / dynamicAspect));
  return { width, height };
}
