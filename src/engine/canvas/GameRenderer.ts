import type { MatchState, ProjectileState, TerrainState } from '../../types/game';
import { drawTank } from '../../utils/pixelArt';
import { TANK_COLORS } from '../../types/game';

interface RenderState {
  projectiles: ProjectileState[];
  explosions: { x: number; y: number; radius: number; life: number }[];
  trails: { x1: number; y1: number; x2: number; y2: number; ownerId: string; life: number }[];
}

export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: { x: number; y: number; alpha: number }[];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas rendering context unavailable');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.stars = this.makeStars(460);
  }

  private makeStars(count: number): { x: number; y: number; alpha: number }[] {
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    return Array.from({ length: count }).map(() => ({
      x: rand(),
      y: rand(),
      alpha: 0.45 + rand() * 0.55,
    }));
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(match: MatchState, terrain: TerrainState, state: RenderState): void {
    const { ctx } = this;
    const hudH = 34;
    const innerX = 2;
    const innerY = hudH + 2;
    const innerW = match.width - 4;
    const innerH = match.height - hudH - 4;

    ctx.fillStyle = '#090c2b';
    ctx.fillRect(0, 0, match.width, match.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();

    ctx.fillStyle = '#0b1242';
    ctx.fillRect(innerX, innerY, innerW, innerH);
    for (const star of this.stars) {
      const sx = Math.floor(innerX + star.x * innerW);
      const sy = Math.floor(innerY + star.y * innerH);
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = '#d6d8ff';
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;
    for (let y = innerY; y < innerY + innerH; y += 2) {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = y % 4 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(innerX, y, innerW, 1);
    }
    ctx.globalAlpha = 1;

    const { width, height, mask } = terrain;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (mask[y * width + x] !== 1 || y < innerY) {
          continue;
        }
        ctx.fillStyle = y <= terrain.heights[x] + 1 ? '#7dff8d' : '#45e35e';
        ctx.fillRect(x, y, 1, 1);
      }
    }

    for (const p of match.players) {
      if (p.alive) {
        drawTank(ctx, p);
      }
    }

    for (const trail of state.trails) {
      const owner = match.players.find((p) => p.config.id === trail.ownerId);
      const color = owner ? TANK_COLORS[owner.config.colorIndex % TANK_COLORS.length] : '#fff';
      ctx.globalAlpha = Math.max(0.15, trail.life);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(trail.x1, trail.y1);
      ctx.lineTo(trail.x2, trail.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#fff';
    for (const projectile of state.projectiles) {
      const owner = match.players.find((p) => p.config.id === projectile.ownerId);
      ctx.fillStyle = owner ? TANK_COLORS[owner.config.colorIndex % TANK_COLORS.length] : '#fff';
      ctx.fillRect(Math.floor(projectile.x), Math.floor(projectile.y), 2, 2);
    }

    for (const exp of state.explosions) {
      const alpha = Math.max(0, exp.life / 0.3);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffb31f';
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5722';
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    ctx.fillStyle = '#b9b9b9';
    ctx.fillRect(0, 0, match.width, hudH);
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, match.width - 1, hudH - 1);
    ctx.strokeStyle = '#dadada';
    ctx.strokeRect(1.5, 1.5, match.width - 3, match.height - 3);
    ctx.strokeRect(innerX - 0.5, innerY - 0.5, innerW + 1, innerH + 1);

    const active = match.players.find((p) => p.config.id === match.activePlayerId);
    if (active) {
      ctx.fillStyle = '#151515';
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillText(`Power: ${Math.round(active.power)}  Angle: ${Math.round(active.angle)}`, 10, 13);
      ctx.fillStyle = '#d84747';
      ctx.fillText(active.config.name, Math.floor(match.width * 0.42), 13);
      ctx.fillStyle = '#111';
      ctx.fillText(`-> ${active.selectedWeaponId}`, Math.floor(match.width * 0.78), 13);
      ctx.fillStyle = '#111';
      ctx.fillText(`Wind: ${Math.round(Math.abs(match.wind))}${match.wind >= 0 ? '>' : '<'}`, match.width - 118, 28);
      if (match.phase === 'projectile') {
        ctx.fillStyle = '#2f2f2f';
        ctx.fillText('Firing...', 10, 28);
      }
    }
  }
}
