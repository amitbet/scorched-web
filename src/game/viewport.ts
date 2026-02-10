export const BATTLEFIELD_ASPECT_WIDTH = 16;
export const BATTLEFIELD_ASPECT_HEIGHT = 9;
export const MIN_BATTLEFIELD_WIDTH = 1280;
export const MIN_BATTLEFIELD_HEIGHT = 720;

export function deriveBattlefieldSize(baseWidth: number, baseHeight: number): { width: number; height: number } {
  const aspect = BATTLEFIELD_ASPECT_WIDTH / BATTLEFIELD_ASPECT_HEIGHT;
  const safeWidth = Math.max(1, Math.floor(baseWidth));
  const safeHeight = Math.max(1, Math.floor(baseHeight));
  const widthFromHeight = Math.floor(safeHeight * aspect);
  const width = Math.max(MIN_BATTLEFIELD_WIDTH, safeWidth, widthFromHeight);
  const height = Math.max(MIN_BATTLEFIELD_HEIGHT, Math.round(width / aspect));
  return { width, height };
}
