const ICON_OVERRIDES: Record<string, { fg: string; bg: string; label: string }> = {
  missile: { fg: '#101010', bg: '#ececec', label: 'M' },
  'baby-nuke': { fg: '#190000', bg: '#ff6a6a', label: 'BN' },
  nuke: { fg: '#190000', bg: '#ff2f2f', label: 'N' },
  mirv: { fg: '#1a0e00', bg: '#ffd76b', label: 'MV' },
  'death-head': { fg: '#1a0000', bg: '#ff8a8a', label: 'DH' },
  napalm: { fg: '#2b1300', bg: '#ffb347', label: 'NP' },
  'hot-napalm': { fg: '#2b1300', bg: '#ff892a', label: 'HN' },
  'sand-bomb': { fg: '#3b2a0a', bg: '#d9bf83', label: 'SB' },
  'ton-of-dirt': { fg: '#2e2008', bg: '#c9a56b', label: 'TD' },
  'liquid-dirt': { fg: '#1f190c', bg: '#d7ba82', label: 'LD' },
  'baby-digger': { fg: '#2f260e', bg: '#d5ba8a', label: 'BD' },
  digger: { fg: '#2f260e', bg: '#cfae79', label: 'DG' },
  'heavy-digger': { fg: '#2f260e', bg: '#b99864', label: 'HD' },
  'baby-sandhog': { fg: '#3a2d0d', bg: '#dfbf8a', label: 'BS' },
  sandhog: { fg: '#3a2d0d', bg: '#d0aa6f', label: 'SH' },
  'heavy-sandhog': { fg: '#3a2d0d', bg: '#bd9158', label: 'HS' },
  'baby-roller': { fg: '#1f1f1f', bg: '#d8d8d8', label: 'BR' },
  roller: { fg: '#1f1f1f', bg: '#bdbdbd', label: 'RL' },
  'heavy-roller': { fg: '#1f1f1f', bg: '#9f9f9f', label: 'HR' },
  'funky-bomb': { fg: '#1f0033', bg: '#f69cff', label: 'FB' },
  'funky-nuke': { fg: '#1f0033', bg: '#cf6fff', label: 'FN' },
  shield: { fg: '#021f28', bg: '#8ce8ff', label: 'S' },
  'medium-shield': { fg: '#021f28', bg: '#66d4ff', label: 'MS' },
  'heavy-shield': { fg: '#021f28', bg: '#46bcff', label: 'HS' },
  parachute: { fg: '#222222', bg: '#f0f0f0', label: 'P' },
  battery: { fg: '#10220f', bg: '#b7ff8e', label: 'B' },
  tracer: { fg: '#303030', bg: '#f1f1f1', label: 'T' },
  'auto-defense': { fg: '#161616', bg: '#efefef', label: 'AD' },
  fuel: { fg: '#001c24', bg: '#7fe6ff', label: 'F' },
};

function initialsFromId(id: string): string {
  return id
    .split('-')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || '?';
}

function makeIconDataUri(fg: string, bg: string, label: string): string {
  const safeLabel = label.replace(/[^A-Z0-9?]/gi, '').slice(0, 2) || '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">` +
    `<rect x="1" y="1" width="16" height="16" fill="${bg}" stroke="#dcdcdc" stroke-width="1"/>` +
    `<text x="9" y="12" fill="${fg}" font-family="Courier New, monospace" font-size="7" text-anchor="middle">${safeLabel}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const iconCache = new Map<string, string>();

export function getWeaponIcon(id: string): string {
  const cached = iconCache.get(id);
  if (cached) {
    return cached;
  }
  const override = ICON_OVERRIDES[id];
  const icon = makeIconDataUri(
    override?.fg ?? '#1a1a1a',
    override?.bg ?? '#d4d4d4',
    override?.label ?? initialsFromId(id),
  );
  iconCache.set(id, icon);
  return icon;
}
