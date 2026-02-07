import { useCallback, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { MatchState, TerrainState } from '../types/game';
import { TANK_COLORS } from '../types/game';

export interface BattleRuntimeSnapshot {
  projectiles: { x: number; y: number; ownerId: string; color?: string }[];
  explosions: { x: number; y: number; radius: number; life: number; color?: string }[];
  trails: { x1: number; y1: number; x2: number; y2: number; ownerId: string; life: number; color?: string }[];
}

export interface BattleInputState {
  moveLeft: boolean;
  moveRight: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fastUp: boolean;
  fastDown: boolean;
  firePressed: boolean;
  weaponCycle: number;
  toggleShieldMenu: boolean;
  powerSet: number | null;
}

interface BattleScreenProps {
  match: MatchState;
  terrain: TerrainState;
  message: string;
  shieldMenuOpen: boolean;
  shieldMenuPlayerName: string;
  shieldMenuItems: Array<{ id: 'shield' | 'force-shield' | 'heavy-shield'; name: string; count: number; boost: number }>;
  onCloseShieldMenu: () => void;
  onActivateShield: (shieldId: 'shield' | 'force-shield' | 'heavy-shield') => void;
  getSnapshot: () => { match: MatchState | null; terrain: TerrainState | null; runtime: BattleRuntimeSnapshot; message: string };
  onInputFrame: (input: BattleInputState, deltaMs: number) => void;
}

class BattleScene extends Phaser.Scene {
  private getSnapshot!: BattleScreenProps['getSnapshot'];
  private onInputFrame!: BattleScreenProps['onInputFrame'];
  private graphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private noteText!: Phaser.GameObjects.Text;
  private keys!: {
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    pageUp: Phaser.Input.Keyboard.Key;
    pageDown: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    tab: Phaser.Input.Keyboard.Key;
    i: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
  };
  private prevFire = false;
  private prevTab = false;
  private prevI = false;
  private pendingPowerSet: number | null = null;
  private stars: { x: number; y: number; alpha: number }[] = [];

  private getPowerBarRect(width: number): { x: number; y: number; w: number; h: number } {
    return { x: Math.max(300, width - 180), y: 4, w: 150, h: 10 };
  }

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: { getSnapshot: BattleScreenProps['getSnapshot']; onInputFrame: BattleScreenProps['onInputFrame'] }): void {
    this.getSnapshot = data.getSnapshot;
    this.onInputFrame = data.onInputFrame;
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.graphics.setDepth(2);
    this.hudText = this.add.text(8, 6, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#111111' });
    this.hudText.setDepth(3);
    this.noteText = this.add.text(8, 22, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#111111' });
    this.noteText.setDepth(3);

    const input = this.input.keyboard;
    if (!input) {
      throw new Error('Keyboard input unavailable');
    }

    this.keys = {
      a: input.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: input.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      left: input.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: input.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: input.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: input.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      pageUp: input.addKey(Phaser.Input.Keyboard.KeyCodes.PAGE_UP),
      pageDown: input.addKey(Phaser.Input.Keyboard.KeyCodes.PAGE_DOWN),
      space: input.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      tab: input.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
      i: input.addKey(Phaser.Input.Keyboard.KeyCodes.I),
      shift: input.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };

    input.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
    });
    input.on('keydown-PAGE_UP', (event: KeyboardEvent) => {
      event.preventDefault();
    });
    input.on('keydown-PAGE_DOWN', (event: KeyboardEvent) => {
      event.preventDefault();
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const snapshot = this.getSnapshot();
      if (!snapshot.match) {
        return;
      }
      if (pointer.y > 34) {
        return;
      }
      const active = snapshot.match.players.find((p) => p.config.id === snapshot.match!.activePlayerId);
      if (!active) {
        return;
      }
      const bar = this.getPowerBarRect(snapshot.match.width);
      if (pointer.x < bar.x || pointer.x > bar.x + bar.w || pointer.y < bar.y || pointer.y > bar.y + bar.h) {
        return;
      }
      const ratio = Phaser.Math.Clamp((pointer.x - bar.x) / bar.w, 0, 1);
      this.pendingPowerSet = Math.round(120 + ratio * (active.maxPower - 120));
    });

    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    this.stars = Array.from({ length: 460 }).map(() => ({ x: rand(), y: rand(), alpha: 0.45 + rand() * 0.55 }));
  }

  update(_time: number, deltaMs: number): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.match || !snapshot.terrain) {
      this.graphics.clear();
      this.graphics.fillStyle(0x090c2b, 1);
      this.graphics.fillRect(0, 0, this.scale.width, this.scale.height);
      return;
    }

    const fireNow = this.keys.space.isDown;
    const tabNow = this.keys.tab.isDown;
    const iNow = this.keys.i.isDown;
    const input: BattleInputState = {
      moveLeft: this.keys.a.isDown,
      moveRight: this.keys.d.isDown,
      left: this.keys.left.isDown,
      right: this.keys.right.isDown,
      up: this.keys.up.isDown,
      down: this.keys.down.isDown,
      fastUp: this.keys.pageUp.isDown,
      fastDown: this.keys.pageDown.isDown,
      firePressed: fireNow && !this.prevFire,
      weaponCycle: tabNow && !this.prevTab ? (this.keys.shift.isDown ? -1 : 1) : 0,
      toggleShieldMenu: iNow && !this.prevI,
      powerSet: this.pendingPowerSet,
    };
    this.pendingPowerSet = null;
    this.prevFire = fireNow;
    this.prevTab = tabNow;
    this.prevI = iNow;

    this.onInputFrame(input, deltaMs);

    this.renderFrame(snapshot.match, snapshot.terrain, snapshot.runtime, snapshot.message);
  }

  private renderFrame(match: MatchState, terrain: TerrainState, runtime: BattleRuntimeSnapshot, message: string): void {
    const hudH = 34;
    const innerX = 2;
    const innerY = hudH + 2;
    const innerW = match.width - 4;
    const innerH = match.height - hudH - 4;
    this.graphics.clear();
    this.graphics.fillStyle(0x090c2b, 1);
    this.graphics.fillRect(0, 0, match.width, match.height);
    this.graphics.fillStyle(0x0b1242, 1);
    this.graphics.fillRect(innerX, innerY, innerW, innerH);
    for (const star of this.stars) {
      const sx = Math.floor(innerX + star.x * innerW);
      const sy = Math.floor(innerY + star.y * innerH);
      this.graphics.fillStyle(0xd6d8ff, star.alpha);
      this.graphics.fillRect(sx, sy, 1, 1);
    }
    for (let y = innerY; y < innerY + innerH; y += 2) {
      this.graphics.fillStyle(y % 4 === 0 ? 0xffffff : 0x000000, 0.06);
      this.graphics.fillRect(innerX, y, innerW, 1);
    }
    for (let x = 0; x < terrain.width; x += 1) {
      const top = Math.max(innerY, terrain.heights[x]);
      if (top >= terrain.height) {
        continue;
      }
      this.graphics.fillStyle(0x45e35e, 1);
      this.graphics.fillRect(x, top, 1, terrain.height - top);
      this.graphics.fillStyle(0x7dff8d, 1);
      this.graphics.fillRect(x, top, 1, 1);
    }

    for (const player of match.players) {
      if (!player.alive) {
        continue;
      }
      const base = Phaser.Display.Color.HexStringToColor(TANK_COLORS[player.config.colorIndex % TANK_COLORS.length]);
      const damage = 1 - player.hp / 100;
      const mix = damage * 0.7;
      const rCol = Math.round(base.red * (1 - mix) + 56 * mix);
      const gCol = Math.round(base.green * (1 - mix) + 56 * mix);
      const bCol = Math.round(base.blue * (1 - mix) + 56 * mix);
      const color = Phaser.Display.Color.GetColor(rCol, gCol, bCol);
      const bodyW = 14;
      const bodyH = 6;
      const halfW = Math.floor(bodyW / 2);
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(Math.floor(player.x - halfW), Math.floor(player.y - 4), bodyW, bodyH);
      this.graphics.fillStyle(0x181818, 1);
      this.graphics.fillRect(Math.floor(player.x - 5), Math.floor(player.y + 2), 4, 3);
      this.graphics.fillRect(Math.floor(player.x + 1), Math.floor(player.y + 2), 4, 3);
      const r = (player.angle * Math.PI) / 180;
      this.graphics.lineStyle(2, color, 1);
      this.graphics.lineBetween(player.x, player.y - 1, player.x + Math.cos(r) * 9, player.y - Math.sin(r) * 9);
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(Math.floor(player.x - 1), Math.floor(player.y - 2), 2, 2);
      if (player.hp < 65) {
        this.graphics.fillStyle(0x1e1e1e, 0.7);
        this.graphics.fillCircle(player.x + 1, player.y - 5, 1.2);
      }
      if (player.hp < 35) {
        this.graphics.fillStyle(0x2b2b2b, 0.7);
        this.graphics.fillCircle(player.x - 2, player.y - 7, 1.5);
      }
      if (player.parachutes > 0 && player.fallDistance > 2) {
        this.graphics.lineStyle(1, 0xf1f1f1, 1);
        this.graphics.strokeEllipse(player.x, player.y - 12, 12, 6);
        this.graphics.lineBetween(player.x - 4, player.y - 9, player.x - 1, player.y - 4);
        this.graphics.lineBetween(player.x + 4, player.y - 9, player.x + 1, player.y - 4);
      }
    }

    for (const trail of runtime.trails) {
      const owner = match.players.find((p) => p.config.id === trail.ownerId);
      const color =
        trail.color
          ? Phaser.Display.Color.HexStringToColor(trail.color).color
          : owner
            ? Phaser.Display.Color.HexStringToColor(TANK_COLORS[owner.config.colorIndex % TANK_COLORS.length]).color
            : 0xffffff;
      this.graphics.lineStyle(1, color, Math.max(0.2, trail.life));
      this.graphics.lineBetween(trail.x1, trail.y1, trail.x2, trail.y2);
    }

    for (const projectile of runtime.projectiles) {
      const owner = match.players.find((p) => p.config.id === projectile.ownerId);
      const color =
        projectile.color
          ? Phaser.Display.Color.HexStringToColor(projectile.color).color
          : owner
            ? Phaser.Display.Color.HexStringToColor(TANK_COLORS[owner.config.colorIndex % TANK_COLORS.length]).color
            : 0xffffff;
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(Math.floor(projectile.x), Math.floor(projectile.y), 2, 2);
    }

    for (const exp of runtime.explosions) {
      const alpha = Math.max(0, exp.life / 0.3);
      const main = exp.color ? Phaser.Display.Color.HexStringToColor(exp.color).color : 0xffb31f;
      this.graphics.fillStyle(main, alpha);
      this.graphics.fillCircle(exp.x, exp.y, exp.radius);
      this.graphics.fillStyle(0xff5722, alpha);
      this.graphics.fillCircle(exp.x, exp.y, exp.radius * 0.55);
    }

    this.graphics.fillStyle(0xb9b9b9, 1);
    this.graphics.fillRect(0, 0, match.width, hudH);

    this.graphics.lineStyle(1, 0x2b2b2b, 1);
    this.graphics.strokeRect(0.5, 0.5, match.width - 1, hudH - 1);
    this.graphics.lineStyle(1, 0xdadada, 1);
    this.graphics.strokeRect(1.5, 1.5, match.width - 3, match.height - 3);
    this.graphics.strokeRect(innerX - 0.5, innerY - 0.5, innerW + 1, innerH + 1);

    const active = match.players.find((p) => p.config.id === match.activePlayerId);
    if (active) {
      const bar = this.getPowerBarRect(match.width);
      this.graphics.fillStyle(0x2c2c2c, 1);
      this.graphics.fillRect(bar.x, bar.y, bar.w, bar.h);
      const fillW = Math.round(((active.power - 120) / Math.max(1, active.maxPower - 120)) * bar.w);
      this.graphics.fillStyle(0x7b1010, 1);
      this.graphics.fillRect(bar.x, bar.y, Phaser.Math.Clamp(fillW, 0, bar.w), bar.h);
      this.graphics.lineStyle(1, 0x111111, 1);
      this.graphics.strokeRect(bar.x, bar.y, bar.w, bar.h);
      this.hudText.setText(`Power: ${Math.round(active.power)}  Max:${Math.round(active.maxPower)}  Angle: ${Math.round(active.angle)}   ${active.config.name}   -> ${active.selectedWeaponId}   Wind: ${Math.round(Math.abs(match.wind))}${match.wind >= 0 ? '>' : '<'}`);
      this.noteText.setText(`${message || `Round ${match.roundIndex}`}   HP:${Math.round(active.hp)}   Fuel:${Math.round(active.fuel)}   Chutes:${active.parachutes}`);
    }
  }
}

export function BattleScreen({
  match,
  terrain,
  message,
  shieldMenuOpen,
  shieldMenuPlayerName,
  shieldMenuItems,
  onCloseShieldMenu,
  onActivateShield,
  getSnapshot,
  onInputFrame,
}: BattleScreenProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const snapshotRef = useRef(getSnapshot);
  const inputFrameRef = useRef(onInputFrame);

  useEffect(() => {
    snapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  useEffect(() => {
    inputFrameRef.current = onInputFrame;
  }, [onInputFrame]);

  const getSnapshotStable = useCallback(() => snapshotRef.current(), []);
  const onInputFrameStable = useCallback((input: BattleInputState, deltaMs: number) => inputFrameRef.current(input, deltaMs), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current) {
      return;
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: terrain.width,
      height: terrain.height,
      parent: host,
      transparent: false,
      backgroundColor: '#000000',
      pixelArt: true,
      antialias: false,
      scene: [BattleScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: { noAudio: true },
    });

    game.scene.start('BattleScene', { getSnapshot: getSnapshotStable, onInputFrame: onInputFrameStable });

    game.canvas.classList.add('battle-canvas');
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [getSnapshotStable, onInputFrameStable, terrain.height, terrain.width]);

  return (
    <div className="screen battle-screen">
      <div ref={hostRef} className="battle-host" />
      <div className="battle-note-overlay">{`${message || `Round ${match.roundIndex}`} | Controls: A/D move, Arrows aim/power, PgUp/PgDn +/-15, Tab weapon, I shields, Click power bar`}</div>
      {shieldMenuOpen && (
        <div className="shield-popup">
          <div className="shield-popup-title">{`Shield Settings - ${shieldMenuPlayerName}`}</div>
          <div className="shield-popup-items">
            {shieldMenuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onActivateShield(item.id)}
                disabled={item.count <= 0}
              >
                {`${item.name} (+${item.boost}) x${item.count}`}
              </button>
            ))}
          </div>
          <button type="button" onClick={onCloseShieldMenu}>Close</button>
        </div>
      )}
    </div>
  );
}
