type IconVariant = 'shop' | 'hud';

interface IconOptions {
  variant?: IconVariant;
}

type IconKind =
  | 'missile'
  | 'baby-missile'
  | 'nuke'
  | 'baby-nuke'
  | 'mirv'
  | 'death-head'
  | 'riot-wave'
  | 'riot-rings'
  | 'digger'
  | 'sandhog'
  | 'dirt'
  | 'shield'
  | 'parachute'
  | 'battery'
  | 'tracer'
  | 'auto-defense'
  | 'fuel'
  | 'napalm'
  | 'roller'
  | 'funky'
  | 'leapfrog'
  | 'mag-deflector'
  | 'generic';

function inferIconKind(id: string): IconKind {
  if (id === 'baby-missile') return 'baby-missile';
  if (id === 'missile') return 'missile';
  if (id === 'baby-nuke') return 'baby-nuke';
  if (id === 'nuke') return 'nuke';
  if (id === 'leapfrog') return 'leapfrog';
  if (id === 'mirv') return 'mirv';
  if (id === 'death-head') return 'death-head';
  if (id === 'funky-bomb') return 'funky';
  if (id === 'riot-charge' || id === 'riot-blast') return 'riot-wave';
  if (id === 'riot-bomb' || id === 'heavy-riot-bomb') return 'riot-rings';
  if (id.includes('sandhog')) return 'sandhog';
  if (id.includes('digger') || id === 'sand-bomb') return 'digger';
  if (id.includes('dirt')) return 'dirt';
  if (id.includes('shield')) return 'shield';
  if (id === 'parachute') return 'parachute';
  if (id === 'battery') return 'battery';
  if (id === 'tracer' || id === 'smoke-tracer') return 'tracer';
  if (id === 'auto-defense') return 'auto-defense';
  if (id === 'fuel') return 'fuel';
  if (id.includes('napalm')) return 'napalm';
  if (id.includes('roller')) return 'roller';
  if (id === 'mag-deflector') return 'mag-deflector';
  return 'generic';
}

function frameSvg(variant: IconVariant): string {
  if (variant === 'hud') {
    return '';
  }
  return `<rect x="0.5" y="0.5" width="17" height="17" fill="#7885a6" stroke="#7885a6" stroke-width="1"/>`;
}

function color(variant: IconVariant, normal: string): string {
  return variant === 'hud' ? '#000000' : normal;
}

function strokeBase(variant: IconVariant): string {
  return variant === 'hud' ? '#000000' : '#111111';
}

function glyphSvg(kind: IconKind, id: string, variant: IconVariant): string {
  const base = strokeBase(variant);

  if (kind === 'missile') {
    return [
      `<rect x="4" y="7.2" width="8.2" height="3.6" fill="${base}"/>`,
      `<polygon points="12.2,7.2 15.2,9 12.2,10.8" fill="${base}"/>`,
      `<polygon points="3.1,7.2 4,9 3.1,10.8" fill="${base}"/>`,
    ].join('');
  }

  if (kind === 'baby-missile') {
    return [
      `<path d="M4.5 9 L11.8 9" stroke="${base}" stroke-width="2"/>`,
      `<polygon points="11.8,7.8 14.8,9 11.8,10.2" fill="${base}"/>`,
      `<path d="M6 8 L4.5 9 L6 10" stroke="${base}" stroke-width="1" fill="none"/>`,
    ].join('');
  }

  if (kind === 'nuke') {
    if (variant === 'hud') {
      return [
        `<rect x="4.1" y="7" width="6.6" height="4" rx="1.1" ry="1.1" fill="#000000"/>`,
        `<path d="M10.7 7 C12.6 7 14.2 7.9 14.9 9 C14.2 10.1 12.6 11 10.7 11 Z" fill="#000000"/>`,
      ].join('');
    }
    return [
      `<rect x="4.1" y="7" width="6.6" height="4" rx="1.1" ry="1.1" fill="${base}"/>`,
      `<path d="M10.7 7 C12.6 7 14.2 7.9 14.9 9 C14.2 10.1 12.6 11 10.7 11 Z" fill="${color(variant, '#e51010')}"/>`,
      `<rect x="3" y="7" width="0.9" height="4" fill="${color(variant, '#ffffff')}"/>`,
    ].join('');
  }

  if (kind === 'baby-nuke') {
    if (variant === 'hud') {
      return [
        `<rect x="4.4" y="7.5" width="5.9" height="3" rx="1" ry="1" fill="#000000"/>`,
        `<path d="M10.2 7.5 C11.7 7.5 13 8.2 13.6 9 C13 9.8 11.7 10.5 10.2 10.5 Z" fill="#000000"/>`,
      ].join('');
    }
    return [
      `<rect x="4.4" y="7.5" width="5.9" height="3" rx="1" ry="1" fill="${base}"/>`,
      `<path d="M10.2 7.5 C11.7 7.5 13 8.2 13.6 9 C13 9.8 11.7 10.5 10.2 10.5 Z" fill="${color(variant, '#e53a3a')}"/>`,
      `<rect x="3.4" y="7.6" width="0.8" height="3.2" fill="${color(variant, '#ffffff')}"/>`,
    ].join('');
  }

  if (kind === 'mirv') {
    return [
      `<path d="M5 12.2 C6 9,7.4 7.3,9 6.2" stroke="${base}" stroke-width="1" fill="none"/>`,
      `<path d="M9 6.2 C10.6 7.3,12 9,13 12.2" stroke="${base}" stroke-width="1" fill="none"/>`,
      `<path d="M9 6.2 L9 12.2" stroke="${base}" stroke-width="1"/>`,
      `<circle cx="5" cy="12.4" r="1.2" fill="${color(variant, '#df2020')}"/>`,
      `<circle cx="9" cy="12.4" r="1.2" fill="${color(variant, '#df2020')}"/>`,
      `<circle cx="13" cy="12.4" r="1.2" fill="${color(variant, '#df2020')}"/>`,
    ].join('');
  }

  if (kind === 'death-head') {
    const skull = variant === 'hud' ? '#000000' : '#3a1111';
    const bone = variant === 'hud' ? '#000000' : '#f6f6f6';
    const eye = variant === 'hud' ? '#000000' : '#f6f6f6';
    return [
      `<path d="M9 4.2 C6.2 4.2 4.9 6.1 4.9 8.2 C4.9 9.8 5.5 11.1 6.6 11.8 V13.2 H11.4 V11.8 C12.5 11.1 13.1 9.8 13.1 8.2 C13.1 6.1 11.8 4.2 9 4.2 Z" fill="${skull}"/>`,
      `<rect x="7.1" y="6.8" width="1.3" height="1.2" fill="${eye}"/>`,
      `<rect x="9.6" y="6.8" width="1.3" height="1.2" fill="${eye}"/>`,
      `<polygon points="9,8.7 8.5,9.4 9.5,9.4" fill="${bone}"/>`,
      `<rect x="7.3" y="11.1" width="3.4" height="1.4" fill="${bone}"/>`,
      `<rect x="7.8" y="11.2" width="0.5" height="1.2" fill="${skull}"/>`,
      `<rect x="8.75" y="11.2" width="0.5" height="1.2" fill="${skull}"/>`,
      `<rect x="9.7" y="11.2" width="0.5" height="1.2" fill="${skull}"/>`,
      `<rect x="8.3" y="13.5" width="1.4" height="1.2" fill="${skull}"/>`,
      `<rect x="8.7" y="13.9" width="0.6" height="0.7" fill="${bone}"/>`,
    ].join('');
  }

  if (kind === 'riot-wave') {
    const c = color(variant, '#8128b3');
    return [
      `<path d="M6 6.5 C9 7.2,9 10.8,6 11.5" stroke="${c}" stroke-width="1.3" fill="none"/>`,
      `<path d="M8 5.2 C12.5 6.2,12.5 11.8,8 12.8" stroke="${c}" stroke-width="1.3" fill="none"/>`,
      `<path d="M10 4.2 C15 5.5,15 12.5,10 13.8" stroke="${c}" stroke-width="1.3" fill="none"/>`,
    ].join('');
  }

  if (kind === 'riot-rings') {
    const c = color(variant, '#8128b3');
    const width = id.includes('heavy') ? 1.5 : 1;
    return [
      `<circle cx="9" cy="9" r="1.6" stroke="${c}" stroke-width="${width}" fill="none"/>`,
      `<circle cx="9" cy="9" r="3.5" stroke="${c}" stroke-width="${width}" fill="none"/>`,
      `<circle cx="9" cy="9" r="5.3" stroke="${c}" stroke-width="${width}" fill="none"/>`,
    ].join('');
  }

  if (kind === 'digger') {
    const isHeavy = id.includes('heavy');
    const isBaby = id.includes('baby');
    const cracks = isHeavy ? 6 : isBaby ? 3 : 4;
    const brown = isHeavy ? '#9f5429' : isBaby ? '#c1733d' : '#b56431';
    if (isBaby) {
      const cornerDig = `<path d="M4.4 4.8 L6.7 6.8 L5.1 9.4 M6.1 4.4 L8.3 6.1" />`;
      if (variant === 'hud') {
        return [
          `<rect x="4" y="4" width="10" height="10" fill="none" stroke="#000000" stroke-width="1"/>`,
          `<g stroke="#000000" stroke-width="1.2" fill="none">${cornerDig}</g>`,
        ].join('');
      }
      return [
        `<defs>`,
        `<mask id="diggermask">`,
        `<rect x="0" y="0" width="18" height="18" fill="#ffffff"/>`,
        `<g stroke="#000000" stroke-width="1.4" fill="none">${cornerDig}</g>`,
        `</mask>`,
        `</defs>`,
        `<rect x="4" y="4" width="10" height="10" fill="${brown}" mask="url(#diggermask)"/>`,
        `<rect x="4" y="4" width="10" height="10" fill="none" stroke="#b16738" stroke-width="1"/>`,
      ].join('');
    }
    const crackPaths: string[] = [
      `<path d="M5.2 5.2 L8.1 8.1 L6.4 12.9"/>`,
      `<path d="M8.8 4.9 L11.3 7.6 L10.2 13.1"/>`,
      `<path d="M12.8 5.6 L10.7 9.2 L13.2 12.6"/>`,
      `<path d="M6.1 9.4 L9.2 10.3"/>`,
      `<path d="M9.6 8.7 L12.6 9.6"/>`,
      `<path d="M7.2 6.6 L10.5 6.6"/>`,
    ];
    const activeCracks = crackPaths.slice(0, cracks).join('');
    if (variant === 'hud') {
      return [
        `<rect x="4" y="4" width="10" height="10" fill="none" stroke="#000000" stroke-width="1"/>`,
        `<g stroke="#000000" stroke-width="1" fill="none">${activeCracks}</g>`,
      ].join('');
    }
    return [
      `<defs>`,
      `<mask id="diggermask">`,
      `<rect x="0" y="0" width="18" height="18" fill="#ffffff"/>`,
      `<g stroke="#000000" stroke-width="1.2" fill="none">${activeCracks}</g>`,
      `</mask>`,
      `</defs>`,
      `<rect x="4" y="4" width="10" height="10" fill="${brown}" mask="url(#diggermask)"/>`,
      `<rect x="4" y="4" width="10" height="10" fill="none" stroke="#b16738" stroke-width="1"/>`,
    ].join('');
  }

  if (kind === 'sandhog') {
    const isHeavy = id.includes('heavy');
    const isBaby = id.includes('baby');
    const brown = isHeavy ? '#9f5429' : isBaby ? '#c1733d' : '#b56431';
    const cutCount = isHeavy ? 4 : isBaby ? 2 : 3;
    const cuts = [
      `<path d="M4.6 12.9 L12.9 4.6"/>`,
      `<path d="M6.2 13.5 L13.5 6.2"/>`,
      `<path d="M4.4 10.8 L10.8 4.4"/>`,
      `<path d="M8.3 13.6 L13.6 8.3"/>`,
    ].slice(0, cutCount).join('');
    const holeCount = isHeavy ? 14 : isBaby ? 6 : 10;
    const holes = [
      `<circle cx="5.6" cy="12.0" r="0.68"/>`,
      `<circle cx="6.6" cy="11.1" r="0.56"/>`,
      `<circle cx="7.2" cy="10.3" r="0.62"/>`,
      `<circle cx="8.2" cy="9.5" r="0.54"/>`,
      `<circle cx="8.8" cy="8.7" r="0.68"/>`,
      `<circle cx="9.6" cy="8.1" r="0.56"/>`,
      `<circle cx="10.3" cy="7.4" r="0.62"/>`,
      `<circle cx="11.1" cy="6.8" r="0.58"/>`,
      `<circle cx="12.0" cy="6.2" r="0.6"/>`,
      `<circle cx="7.8" cy="12.3" r="0.56"/>`,
      `<circle cx="9.0" cy="11.3" r="0.52"/>`,
      `<circle cx="10.8" cy="9.6" r="0.55"/>`,
      `<circle cx="12.4" cy="8.7" r="0.52"/>`,
      `<circle cx="9.4" cy="6.9" r="0.5"/>`,
    ].slice(0, holeCount).join('');
    if (variant === 'hud') {
      return [
        `<rect x="4" y="4" width="10" height="10" fill="none" stroke="#000000" stroke-width="1"/>`,
        `<g stroke="#000000" stroke-width="0.8" fill="none">${cuts}</g>`,
        `<g fill="#000000">${holes}</g>`,
      ].join('');
    }
    return [
      `<defs>`,
      `<mask id="sandhogmask">`,
      `<rect x="0" y="0" width="18" height="18" fill="#ffffff"/>`,
      `<g stroke="#000000" stroke-width="0.9" fill="none">${cuts}</g>`,
      `<g fill="#000000">${holes}</g>`,
      `</mask>`,
      `</defs>`,
      `<rect x="4" y="4" width="10" height="10" fill="${brown}" mask="url(#sandhogmask)"/>`,
      `<rect x="4" y="4" width="10" height="10" fill="none" stroke="#b16738" stroke-width="1"/>`,
    ].join('');
  }

  if (kind === 'dirt') {
    if (id === 'liquid-dirt') {
      if (variant === 'hud') {
        return `<path d="M9 4.6 C7.2 7 6.8 8.7 6.8 10 C6.8 11.8 7.9 13 9 13 C10.1 13 11.2 11.8 11.2 10 C11.2 8.7 10.8 7 9 4.6 Z" fill="#000000"/>`;
      }
      return `<path d="M9 4.6 C7.2 7 6.8 8.7 6.8 10 C6.8 11.8 7.9 13 9 13 C10.1 13 11.2 11.8 11.2 10 C11.2 8.7 10.8 7 9 4.6 Z" fill="#b86434"/>`;
    }
    if (variant === 'hud') {
      return `<circle cx="9" cy="9" r="4" fill="#000000"/>`;
    }
    const brown =
      id === 'liquid-dirt' ? '#b86434' :
      id === 'ton-of-dirt' ? '#a85a2f' :
      '#9a512a';
    return `<circle cx="9" cy="9" r="4" fill="${brown}"/>`;
  }

  if (kind === 'shield') {
    const isHeavy = id.includes('heavy');
    const isMedium = id.includes('medium');
    if (variant === 'hud') {
      return `<circle cx="9" cy="9" r="5" stroke="#000000" stroke-width="${isHeavy ? 2.2 : isMedium ? 1.6 : 1.2}" fill="none"/>`;
    }
    if (isHeavy) {
      return `<circle cx="9" cy="9" r="5.2" stroke="#ffffff" stroke-width="2.2" fill="none"/>`;
    }
    if (isMedium) {
      return `<circle cx="9" cy="9" r="5" stroke="#c43bff" stroke-width="1.8" fill="none"/>`;
    }
    return `<circle cx="9" cy="9" r="4.8" stroke="#ffffff" stroke-width="1.2" fill="none"/>`;
  }

  if (kind === 'parachute') {
    return [
      `<path d="M4 8 C5.4 5 12.6 5 14 8" stroke="${base}" stroke-width="1" fill="none"/>`,
      `<path d="M6 8 L7.5 12 M9 8 L9 12 M12 8 L10.5 12" stroke="${base}" stroke-width="1"/>`,
      `<rect x="8" y="12" width="2" height="2" fill="${base}"/>`,
    ].join('');
  }

  if (kind === 'battery') {
    return [
      `<rect x="4" y="6" width="10" height="7" fill="none" stroke="${base}" stroke-width="1"/>`,
      `<rect x="8" y="5" width="2" height="1" fill="${base}"/>`,
      `<rect x="11.2" y="8" width="1.8" height="3" fill="${color(variant, '#d51c1c')}"/>`,
    ].join('');
  }

  if (kind === 'tracer') {
    if (id === 'smoke-tracer') {
      return [
        `<circle cx="9" cy="9" r="2.4" fill="none" stroke="${base}" stroke-width="1"/>`,
        `<path d="M9 4.5 V6.6 M9 11.4 V13.5 M4.5 9 H6.6 M11.4 9 H13.5 M6 6 L7.2 7.2 M10.8 10.8 L12 12 M12 6 L10.8 7.2 M7.2 10.8 L6 12" stroke="${base}" stroke-width="1"/>`,
      ].join('');
    }
    return [
      `<circle cx="9" cy="9" r="3.2" fill="none" stroke="${base}" stroke-width="1"/>`,
      `<path d="M9 4 V6 M9 12 V14 M4 9 H6 M12 9 H14" stroke="${base}" stroke-width="1"/>`,
    ].join('');
  }

  if (kind === 'auto-defense') {
    const frame = base;
    const screen = variant === 'hud' ? '#000000' : '#2e2ca9';
    const key = variant === 'hud' ? '#000000' : '#ffffff';
    return [
      `<rect x="5.2" y="3.4" width="7.6" height="4.6" fill="${screen}" stroke="${frame}" stroke-width="1"/>`,
      `<path d="M3.8 8.2 H14.2 L15 11.7 H3 Z" fill="${frame}"/>`,
      `<circle cx="6.2" cy="10.1" r="0.9" fill="${key}"/>`,
      `<circle cx="9" cy="10.1" r="0.9" fill="${key}"/>`,
      `<circle cx="11.8" cy="10.1" r="0.9" fill="${key}"/>`,
      `<rect x="7.6" y="12.1" width="2.8" height="0.8" fill="${frame}"/>`,
    ].join('');
  }

  if (kind === 'fuel') {
    const frame = base;
    const fill = variant === 'hud' ? '#000000' : '#3a3a3a';
    const label = variant === 'hud' ? '#000000' : '#d7e7ff';
    return [
      `<rect x="6.1" y="4.3" width="6.5" height="9.8" rx="0.8" ry="0.8" fill="${fill}" stroke="${frame}" stroke-width="1"/>`,
      `<rect x="7.2" y="3.2" width="2.7" height="1.4" fill="${fill}" stroke="${frame}" stroke-width="1"/>`,
      `<path d="M9.9 3.7 H11.9 V5 H10.8 L10.1 6.1 H9.2 V5.2 Z" fill="${fill}" stroke="${frame}" stroke-width="1"/>`,
      `<path d="M7.1 6.8 L11.6 11.9 M11.6 6.8 L7.1 11.9" stroke="${label}" stroke-width="0.9"/>`,
      `<rect x="7.7" y="12.5" width="3.3" height="1" fill="${label}"/>`,
    ].join('');
  }

  if (kind === 'napalm') {
    const hot = id.includes('hot');
    if (variant === 'hud') {
      return [
        `<path d="${hot ? 'M9 3.8 C5.2 6.5 5.3 9.2 9 14 C12.7 9.2 12.8 6.5 9 3.8 Z' : 'M9 4.8 C6.2 6.9 6.4 9.1 9 13 C11.6 9.1 11.8 6.9 9 4.8 Z'}" fill="#000000"/>`,
      ].join('');
    }

    if (hot) {
      return [
        `<path d="M9 3.7 C4.8 6.2 4.9 9.5 9 14.2 C13.1 9.5 13.2 6.2 9 3.7 Z" fill="#ff4a1a"/>`,
        `<path d="M9 4.8 C5.9 7 5.9 9.8 9 13.2 C12.1 9.8 12.1 7 9 4.8 Z" fill="#ff8f1a"/>`,
        `<path d="M9 6.2 C7.6 7.5 7.8 9 9 10.9 C10.2 9 10.4 7.5 9 6.2 Z" fill="#ffe44f"/>`,
        `<path d="M6.2 12.8 C6.9 11.8 7.8 11.4 9 11.4 C10.2 11.4 11.1 11.8 11.8 12.8 Z" fill="#d81f1f"/>`,
      ].join('');
    }

    return [
      `<path d="M9 4.8 C6.1 6.7 6.2 9 9 13 C11.8 9 11.9 6.7 9 4.8 Z" fill="#ff6a22"/>`,
      `<path d="M9 5.8 C7.1 7.4 7.3 9 9 11.6 C10.7 9 10.9 7.4 9 5.8 Z" fill="#ffb022"/>`,
      `<path d="M9 7 C8.1 8.1 8.2 9 9 10.2 C9.8 9 9.9 8.1 9 7 Z" fill="#ffe96a"/>`,
      `<path d="M7 12.2 C7.5 11.6 8.2 11.3 9 11.3 C9.8 11.3 10.5 11.6 11 12.2 Z" fill="#d93020"/>`,
    ].join('');
  }

  if (kind === 'roller') {
    const isHeavy = id.includes('heavy');
    const isBaby = id.includes('baby');
    const outer = isHeavy ? 4.6 : isBaby ? 2.5 : 3.6;
    const mid = isHeavy ? 3.3 : isBaby ? 1.9 : 2.6;
    const inner = isHeavy ? 2.0 : isBaby ? 1.3 : 1.7;
    const cx = 9;
    const cy = 9;
    const stroke = variant === 'hud' ? '#000000' : base;
    return [
      `<path d="M${cx + outer},${cy} A ${outer},${outer} 0 1 1 ${cx - outer + 0.2},${cy - 0.2}" stroke="${stroke}" stroke-width="1.2" fill="none"/>`,
      `<path d="M${cx + mid},${cy} A ${mid},${mid} 0 1 0 ${cx - mid + 0.15},${cy + 0.15}" stroke="${stroke}" stroke-width="1.2" fill="none"/>`,
      `<path d="M${cx + inner},${cy} A ${inner},${inner} 0 1 1 ${cx - inner + 0.1},${cy - 0.1}" stroke="${stroke}" stroke-width="1.2" fill="none"/>`,
    ].join('');
  }

  if (kind === 'funky') {
    const c1 = variant === 'hud' ? '#000000' : '#ff2f2f';
    const c2 = variant === 'hud' ? '#000000' : '#ff9c1a';
    const c3 = variant === 'hud' ? '#000000' : '#31c9ff';
    const c4 = variant === 'hud' ? '#000000' : '#b84dff';
    const c5 = variant === 'hud' ? '#000000' : '#ffd83d';
    return [
      `<circle cx="6.2" cy="6.2" r="1.3" fill="${c1}"/>`,
      `<circle cx="11.8" cy="6.2" r="1.3" fill="${c2}"/>`,
      `<circle cx="6.2" cy="11.8" r="1.3" fill="${c3}"/>`,
      `<circle cx="11.8" cy="11.8" r="1.3" fill="${c4}"/>`,
      `<circle cx="9" cy="9" r="2.1" fill="${c5}"/>`,
    ].join('');
  }

  if (kind === 'leapfrog') {
    return [
      `<path d="M9 12.8 L9 8.8" stroke="${base}" stroke-width="1.2"/>`,
      `<path d="M9 8.9 L5.8 5.8" stroke="${base}" stroke-width="1.2"/>`,
      `<path d="M9 8.9 L12.2 5.8" stroke="${base}" stroke-width="1.2"/>`,
      `<circle cx="9" cy="8.6" r="1.1" fill="${base}"/>`,
      `<circle cx="5.6" cy="5.6" r="1.1" fill="${base}"/>`,
      `<circle cx="12.4" cy="5.6" r="1.1" fill="${base}"/>`,
    ].join('');
  }

  if (kind === 'mag-deflector') {
    return [
      `<polygon points="5,11 7,8 9,11" fill="${base}"/>`,
      `<polygon points="9,8.2 11.5,4.5 14,8.2" fill="${base}"/>`,
      `<polygon points="9,11 11,8 13,11" fill="${base}"/>`,
    ].join('');
  }

  return `<circle cx="9" cy="9" r="2.6" fill="${base}"/>`;
}

function makeIconDataUri(id: string, variant: IconVariant): string {
  const kind = inferIconKind(id);
  const box = variant === 'hud' ? '0 0 16 16' : '0 0 18 18';
  const glyph = glyphSvg(kind, id, variant);
  const scaledGlyph = variant === 'shop'
    ? `<g transform="translate(9 9) scale(1.22) translate(-9 -9)">${glyph}</g>`
    : glyph;
  const body = variant === 'hud'
    ? scaledGlyph
    : `${frameSvg(variant)}${scaledGlyph}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="${box}">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const iconCache = new Map<string, string>();

export function getWeaponIcon(id: string, options?: IconOptions): string {
  const variant = options?.variant ?? 'shop';
  const key = `${variant}:${id}`;
  const cached = iconCache.get(key);
  if (cached) {
    return cached;
  }
  const icon = makeIconDataUri(id, variant);
  iconCache.set(key, icon);
  return icon;
}
