import type { PlayerState, TerrainState } from '../types/game';
import { TANK_COLORS } from '../types/game';

export function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#1f3d99');
  grad.addColorStop(0.65, '#5e7de0');
  grad.addColorStop(1, '#e06e93');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.08;
  for (let y = 0; y < height; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(0, y, width, 1);
  }
  ctx.globalAlpha = 1;
}

export function drawTerrain(ctx: CanvasRenderingContext2D, terrain: TerrainState): void {
  const { width, height, mask } = terrain;
  ctx.fillStyle = '#78b267';
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 1) {
        if (y < terrain.heights[x] + 4) {
          ctx.fillStyle = '#84c973';
        } else {
          ctx.fillStyle = '#4e803e';
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

export function drawTank(ctx: CanvasRenderingContext2D, player: PlayerState): void {
  const color = TANK_COLORS[player.config.colorIndex % TANK_COLORS.length];
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(player.x - 6), Math.floor(player.y - 4), 12, 5);

  ctx.fillStyle = '#333';
  ctx.fillRect(Math.floor(player.x - 5), Math.floor(player.y + 1), 4, 3);
  ctx.fillRect(Math.floor(player.x + 1), Math.floor(player.y + 1), 4, 3);

  const radians = (player.angle * Math.PI) / 180;
  const tx = player.x + Math.cos(radians) * 7;
  const ty = player.y - Math.sin(radians) * 7;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y - 2);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  if (player.shield > 0) {
    ctx.strokeStyle = '#62dbff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 1, 9, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawWind(ctx: CanvasRenderingContext2D, wind: number, x: number, y: number): void {
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(`Wind ${wind.toFixed(1)}`, x, y);

  const dir = Math.sign(wind);
  const mag = Math.min(60, Math.abs(wind));
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(x + 80, y - 6);
  ctx.lineTo(x + 80 + dir * mag, y - 6);
  ctx.stroke();
}
