import { useCallback, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { MatchState, TerrainState } from '../types/game';
import { TANK_COLORS } from '../types/game';
import { drawNukeExplosion } from '../game/fx/nukeEffect';
import { getWeaponById, WEAPONS } from '../game/WeaponCatalog';
import { getWeaponIcon } from '../game/WeaponIcons';

export interface BattleRuntimeSnapshot {
  projectiles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ownerId: string;
    weaponId: string;
    color?: string;
    projectileType?: 'ballistic' | 'mirv-carrier' | 'mirv-child' | 'roller' | 'digger' | 'sandhog' | 'funky-child' | 'delayed-blast' | 'napalm-burn';
  }[];
  explosions: {
    id: number;
    x: number;
    y: number;
    radius: number;
    life: number;
    maxLife?: number;
    color?: string;
    kind?: 'burst' | 'simple' | 'fire' | 'laser' | 'sand' | 'funky' | 'nuke' | 'mirv' | 'funky-side' | 'fuel-pool' | 'riot-rings' | 'riot-blast';
    beamHeight?: number;
    seed?: number;
    direction?: number;
    paused?: boolean;
    tag?: string;
  }[];
  trails: { x1: number; y1: number; x2: number; y2: number; ownerId: string; life: number; color?: string }[];
}

export interface BattleInputState {
  moveLeft: boolean;
  moveRight: boolean;
  alt: boolean;
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
  shieldMenuItems: Array<{ id: 'shield' | 'medium-shield' | 'heavy-shield'; name: string; count: number; boost: number }>;
  onCloseShieldMenu: () => void;
  onActivateShield: (shieldId: 'shield' | 'medium-shield' | 'heavy-shield') => void;
  getSnapshot: () => {
    match: MatchState | null;
    terrain: TerrainState | null;
    runtime: BattleRuntimeSnapshot;
    message: string;
    localTurnNoticePlayerId: string | null;
  };
  onInputFrame: (input: BattleInputState, deltaMs: number) => void;
}

class BattleScene extends Phaser.Scene {
  private readonly terrainTextureKey = 'battle-terrain-layer';
  private terrainTextureMeta: { revision: number; width: number; height: number; colored: boolean } | null = null;
  private getSnapshot!: BattleScreenProps['getSnapshot'];
  private onInputFrame!: BattleScreenProps['onInputFrame'];
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private graphics!: Phaser.GameObjects.Graphics;
  private terrainImage: Phaser.GameObjects.Image | null = null;
  private weaponIcon!: Phaser.GameObjects.Image;
  private hudText!: Phaser.GameObjects.Text;
  private hudWeaponLabelText!: Phaser.GameObjects.Text;
  private hudWeaponValueText!: Phaser.GameObjects.Text;
  private noteText!: Phaser.GameObjects.Text;
  private turnNoticeText!: Phaser.GameObjects.Text;
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
    alt: Phaser.Input.Keyboard.Key;
  };
  private prevFire = false;
  private prevTab = false;
  private prevI = false;
  private pendingPowerSet: number | null = null;
  private stars: { x: number; y: number; alpha: number }[] = [];
  private seenExplosionIds = new Set<number>();
  private audioCtx: AudioContext | null = null;
  private projectileToneOsc: OscillatorNode | null = null;
  private projectileToneGain: GainNode | null = null;
  private trackedWhistlePos: { x: number; y: number } | null = null;
  private readonly weaponIconTexturePrefix = 'weapon-icon-hud-';
  private prevPhase: MatchState['phase'] | null = null;
  private prevActivePlayerId: string | null = null;
  private turnIndicatorStartMs = 0;
  private turnIndicatorEndMs = 0;
  private turnNoticeStartMs = 0;
  private turnNoticeEndMs = 0;

  private getPowerBarRect(width: number): { x: number; y: number; w: number; h: number } {
    return { x: Math.max(300, width - 180), y: 4, w: 150, h: 10 };
  }

  private weaponIconTextureKey(weaponId: string): string {
    return `${this.weaponIconTexturePrefix}${weaponId}`;
  }

  private queueWeaponIconTextures(): void {
    for (const weapon of WEAPONS) {
      const key = this.weaponIconTextureKey(weapon.id);
      if (!this.textures.exists(key)) {
        this.load.image(key, getWeaponIcon(weapon.id, { variant: 'hud' }));
      }
    }
  }

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: { getSnapshot: BattleScreenProps['getSnapshot']; onInputFrame: BattleScreenProps['onInputFrame'] }): void {
    this.getSnapshot = data.getSnapshot;
    this.onInputFrame = data.onInputFrame;
  }

  preload(): void {
    this.queueWeaponIconTextures();
  }

  create(): void {
    this.backgroundGraphics = this.add.graphics();
    this.backgroundGraphics.setDepth(1);
    this.graphics = this.add.graphics();
    this.graphics.setDepth(3);
    const placeholderKey = 'weapon-icon-placeholder';
    if (!this.textures.exists(placeholderKey)) {
      this.textures.generate(placeholderKey, { data: ['1'], pixelWidth: 1 });
    }
    this.weaponIcon = this.add.image(8, 12, placeholderKey);
    this.weaponIcon.setDisplaySize(8, 8);
    this.weaponIcon.setOrigin(0, 0.5);
    this.weaponIcon.setDepth(4);
    this.weaponIcon.setAlpha(0);
    this.hudText = this.add.text(8, 6, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#111111' });
    this.hudText.setDepth(4);
    this.hudWeaponLabelText = this.add.text(0, 6, 'Weapon:', { fontFamily: 'Courier New', fontSize: '12px', color: '#111111' });
    this.hudWeaponLabelText.setDepth(4);
    this.hudWeaponValueText = this.add.text(0, 6, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#111111' });
    this.hudWeaponValueText.setDepth(4);
    this.noteText = this.add.text(8, 22, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#111111' });
    this.noteText.setDepth(4);
    this.turnNoticeText = this.add.text(0, 0, 'YOUR TURN', {
      fontFamily: 'Courier New',
      fontSize: '34px',
      color: '#ff2a2a',
      fontStyle: 'bold',
      stroke: '#2b0000',
      strokeThickness: 4,
    });
    this.turnNoticeText.setOrigin(0.5, 0.5);
    this.turnNoticeText.setDepth(5);
    this.turnNoticeText.setVisible(false);

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
      alt: input.addKey(Phaser.Input.Keyboard.KeyCodes.ALT),
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
      this.pendingPowerSet = Math.round(ratio * active.maxPower);
    });

    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    this.stars = Array.from({ length: 460 }).map(() => ({ x: rand(), y: rand(), alpha: 0.45 + rand() * 0.55 }));
    this.events.once('shutdown', () => this.disposeProjectileTone());
    this.events.once('destroy', () => this.disposeProjectileTone());
  }

  update(_time: number, deltaMs: number): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.match || !snapshot.terrain) {
      this.prevPhase = null;
      this.prevActivePlayerId = null;
      this.turnIndicatorStartMs = 0;
      this.turnIndicatorEndMs = 0;
      this.turnNoticeStartMs = 0;
      this.turnNoticeEndMs = 0;
      this.backgroundGraphics.clear();
      this.graphics.clear();
      this.turnNoticeText.setVisible(false);
      this.backgroundGraphics.fillStyle(0x090c2b, 1);
      this.backgroundGraphics.fillRect(0, 0, this.scale.width, this.scale.height);
      if (this.terrainImage) {
        this.terrainImage.setVisible(false);
      }
      return;
    }

    const fireNow = this.keys.space.isDown;
    const tabNow = this.keys.tab.isDown;
    const iNow = this.keys.i.isDown;
    const input: BattleInputState = {
      moveLeft: this.keys.a.isDown,
      moveRight: this.keys.d.isDown,
      alt: this.keys.alt.isDown,
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

    this.updateProjectileWhistle(snapshot.runtime.projectiles, snapshot.match.height);

    const newExplosions: BattleRuntimeSnapshot['explosions'] = [];
    for (const exp of snapshot.runtime.explosions) {
      if (this.seenExplosionIds.has(exp.id)) {
        continue;
      }
      this.seenExplosionIds.add(exp.id);
      newExplosions.push(exp);
    }
    if (newExplosions.length > 0) {
      this.disposeProjectileTone();
      for (const exp of newExplosions) {
        this.playExplosionSfx(exp.kind, exp.radius);
      }
    }

    this.updateTurnIndicator(snapshot.match, snapshot.localTurnNoticePlayerId);
    this.renderFrame(snapshot.match, snapshot.terrain, snapshot.runtime, snapshot.message);
  }

  private updateTurnIndicator(match: MatchState, localTurnNoticePlayerId: string | null): void {
    const now = this.time.now;
    const enteredAimPhase = match.phase === 'aim' && this.prevPhase !== 'aim';
    const changedActivePlayer = match.phase === 'aim' && this.prevActivePlayerId !== null && match.activePlayerId !== this.prevActivePlayerId;
    const firstAimFrame = match.phase === 'aim' && this.prevActivePlayerId === null;
    if (enteredAimPhase || changedActivePlayer || firstAimFrame) {
      this.turnIndicatorStartMs = now;
      this.turnIndicatorEndMs = now + 1600;
      const localTurnOnly = localTurnNoticePlayerId !== null;
      const shouldShowTurnNotice = localTurnOnly && match.activePlayerId === localTurnNoticePlayerId;
      if (shouldShowTurnNotice) {
        this.turnNoticeStartMs = now;
        this.turnNoticeEndMs = now + 1300;
      }
    }
    this.prevPhase = match.phase;
    this.prevActivePlayerId = match.activePlayerId;
  }

  private disposeProjectileTone(): void {
    this.trackedWhistlePos = null;
    if (this.projectileToneOsc) {
      try {
        this.projectileToneOsc.stop();
      } catch {
        // ignore
      }
      this.projectileToneOsc.disconnect();
      this.projectileToneOsc = null;
    }
    if (this.projectileToneGain) {
      this.projectileToneGain.disconnect();
      this.projectileToneGain = null;
    }
  }

  private ensureProjectileWhistle(): { ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return null;
    }
    if (!this.audioCtx) {
      this.audioCtx = new Ctx();
    }
    const ctx = this.audioCtx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    if (!this.projectileToneGain || !this.projectileToneOsc) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 260;
      osc.connect(gain);
      osc.start();
      this.projectileToneGain = gain;
      this.projectileToneOsc = osc;
    }
    return { ctx, gain: this.projectileToneGain, osc: this.projectileToneOsc };
  }

  private updateProjectileWhistle(projectiles: BattleRuntimeSnapshot['projectiles'], worldHeight: number): void {
    const candidates = projectiles.filter(
      (p) => p.projectileType !== 'digger'
        && p.projectileType !== 'sandhog'
        && p.projectileType !== 'roller'
        && p.projectileType !== 'napalm-burn'
        && p.projectileType !== 'delayed-blast',
    );
    const tracked = candidates.reduce<BattleRuntimeSnapshot['projectiles'][number] | null>((best, p) => {
      if (!best) {
        return p;
      }
      const pVx = Number.isFinite((p as { vx?: number }).vx) ? Math.abs((p as { vx: number }).vx) : 0;
      const pVy = Number.isFinite(p.vy) ? Math.abs(p.vy) : 0;
      const bVx = Number.isFinite((best as { vx?: number }).vx) ? Math.abs((best as { vx: number }).vx) : 0;
      const bVy = Number.isFinite(best.vy) ? Math.abs(best.vy) : 0;
      return pVx + pVy > bVx + bVy ? p : best;
    }, null);

    if (!tracked) {
      this.disposeProjectileTone();
      return;
    }

    const audio = this.ensureProjectileWhistle();
    if (!audio) {
      return;
    }
    const { ctx, gain, osc } = audio;
    const now = ctx.currentTime;

    const y = Number.isFinite(tracked.y) ? tracked.y : worldHeight * 0.5;
    const vy = Number.isFinite(tracked.vy) ? tracked.vy : 0;
    const prev = this.trackedWhistlePos;
    const dy = prev ? tracked.y - prev.y : 0;
    this.trackedWhistlePos = { x: tracked.x, y: tracked.y };

    // Higher altitude and upward movement raise pitch; descending lowers it.
    const altitudeNorm = Phaser.Math.Clamp(1 - y / Math.max(1, worldHeight), 0, 1);
    const climbFromDelta = Phaser.Math.Clamp(-dy / 4.5, -1, 1);
    const climbFromVelocity = Phaser.Math.Clamp(-vy / 320, -1, 1);
    const movementNorm = climbFromDelta * 0.7 + climbFromVelocity * 0.3;

    const freqRaw = 220 + altitudeNorm * 340 + movementNorm * 190;
    const freq = Phaser.Math.Clamp(Number.isFinite(freqRaw) ? freqRaw : 260, 170, 980);
    const detune = Phaser.Math.Clamp(movementNorm * 120, -160, 160);
    const targetGain = 0.016 + altitudeNorm * 0.017;

    osc.frequency.setTargetAtTime(freq, now, 0.02);
    osc.detune.setTargetAtTime(detune, now, 0.02);
    gain.gain.setTargetAtTime(targetGain, now, 0.02);
  }

  private playExplosionSfx(kind: BattleRuntimeSnapshot['explosions'][number]['kind'], radius: number): void {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return;
    }
    if (!this.audioCtx) {
      this.audioCtx = new Ctx();
    }
    const ctx = this.audioCtx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (kind === 'fire') {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      noise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      noise.start(now);
      noise.stop(now + 0.14);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = kind === 'laser' ? 'square' : 'triangle';
    const startFreq = kind === 'simple' ? 220 + radius * 3.8 : 150 + radius * 1.8;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(50, startFreq * 0.22), now + 0.2);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  private updateTerrainTexture(terrain: TerrainState, innerY: number): void {
    const colorIndices = terrain.colorIndices;
    const palette = terrain.colorPalette;
    const colored = Boolean(colorIndices && palette && palette.length > 0);
    const cacheValid = this.terrainTextureMeta
      && this.terrainTextureMeta.revision === terrain.revision
      && this.terrainTextureMeta.width === terrain.width
      && this.terrainTextureMeta.height === terrain.height
      && this.terrainTextureMeta.colored === colored;
    if (cacheValid) {
      if (this.terrainImage) {
        this.terrainImage.setVisible(true);
      }
      return;
    }

    if (this.textures.exists(this.terrainTextureKey)) {
      const existing = this.textures.get(this.terrainTextureKey) as Phaser.Textures.CanvasTexture;
      if (existing.getSourceImage().width !== terrain.width || existing.getSourceImage().height !== terrain.height) {
        this.textures.remove(this.terrainTextureKey);
      }
    }

    const texture = this.textures.exists(this.terrainTextureKey)
      ? this.textures.get(this.terrainTextureKey) as Phaser.Textures.CanvasTexture
      : this.textures.createCanvas(this.terrainTextureKey, terrain.width, terrain.height);
    if (!texture) {
      throw new Error('Failed to create terrain canvas texture');
    }
    const ctx = texture.getContext();
    const image = ctx.createImageData(terrain.width, terrain.height);
    const data = image.data;

    for (let x = 0; x < terrain.width; x += 1) {
      const top = Math.max(innerY, terrain.heights[x]);
      if (top >= terrain.height) {
        continue;
      }
      for (let y = top; y < terrain.height; y += 1) {
        const cell = y * terrain.width + x;
        if (terrain.mask[cell] !== 1) {
          continue;
        }
        let r = y === top ? 0x7d : 0x45;
        let g = y === top ? 0xff : 0xe3;
        let b = y === top ? 0x8d : 0x5e;
        if (colored && colorIndices && palette) {
          const idx = colorIndices[cell] & 0x0f;
          const swatch = idx > 0 ? palette[idx] : null;
          if (swatch) {
            r = swatch[0];
            g = swatch[1];
            b = swatch[2];
          }
        }
        const out = cell * 4;
        data[out] = r;
        data[out + 1] = g;
        data[out + 2] = b;
        data[out + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    texture.refresh();

    if (!this.terrainImage) {
      this.terrainImage = this.add.image(0, 0, this.terrainTextureKey).setOrigin(0, 0).setDepth(2);
    } else {
      this.terrainImage.setTexture(this.terrainTextureKey);
    }
    this.terrainImage.setVisible(true);
    this.terrainTextureMeta = {
      revision: terrain.revision,
      width: terrain.width,
      height: terrain.height,
      colored,
    };
  }

  private renderFrame(match: MatchState, terrain: TerrainState, runtime: BattleRuntimeSnapshot, message: string): void {
    const hudH = 34;
    const innerX = 2;
    const innerY = hudH + 2;
    const innerW = match.width - 4;
    const innerH = match.height - hudH - 4;
    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillStyle(0x090c2b, 1);
    this.backgroundGraphics.fillRect(0, 0, match.width, match.height);
    this.backgroundGraphics.fillStyle(0x0b1242, 1);
    this.backgroundGraphics.fillRect(innerX, innerY, innerW, innerH);
    for (const star of this.stars) {
      const sx = Math.floor(innerX + star.x * innerW);
      const sy = Math.floor(innerY + star.y * innerH);
      this.backgroundGraphics.fillStyle(0xd6d8ff, star.alpha);
      this.backgroundGraphics.fillRect(sx, sy, 1, 1);
    }
    for (let y = innerY; y < innerY + innerH; y += 2) {
      this.backgroundGraphics.fillStyle(y % 4 === 0 ? 0xffffff : 0x000000, 0.06);
      this.backgroundGraphics.fillRect(innerX, y, innerW, 1);
    }
    this.updateTerrainTexture(terrain, innerY);

    this.graphics.clear();

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
      // Keep wheel detail inside the tank body so the silhouette stays compact.
      this.graphics.fillStyle(0x181818, 1);
      this.graphics.fillRect(Math.floor(player.x - 5), Math.floor(player.y - 1), 4, 2);
      this.graphics.fillRect(Math.floor(player.x + 1), Math.floor(player.y - 1), 4, 2);
      this.graphics.fillStyle(0xdcdcdc, 1);
      this.graphics.fillRect(Math.floor(player.x - 4), Math.floor(player.y), 2, 1);
      this.graphics.fillRect(Math.floor(player.x + 2), Math.floor(player.y), 2, 1);
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
      const ownerColor = owner
        ? Phaser.Display.Color.HexStringToColor(TANK_COLORS[owner.config.colorIndex % TANK_COLORS.length]).color
        : null;
      const color = match.settings.tankColorTrails
        ? (ownerColor ?? (trail.color ? Phaser.Display.Color.HexStringToColor(trail.color).color : 0xffffff))
        : (
          trail.color
            ? Phaser.Display.Color.HexStringToColor(trail.color).color
            : ownerColor ?? 0xffffff
        );
      const isMirvTrail = trail.color === '#ffe95a'
        || trail.color === '#d9ff5a'
        || trail.color === '#9eff4b'
        || trail.color === '#74ff61'
        || trail.color === '#89ffbe'
        || trail.color === '#83ffd8'
        || trail.color === '#b2ff6f';
      this.graphics.lineStyle(isMirvTrail ? 2 : 1, color, Math.max(0.2, trail.life));
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
      if (projectile.y < innerY) {
        const markerX = Phaser.Math.Clamp(Math.floor(projectile.x), innerX, innerX + innerW - 1);
        this.graphics.fillStyle(color, 1);
        this.graphics.fillRect(markerX, innerY, 1, 1);
        continue;
      }
      if (projectile.projectileType === 'roller') {
        this.graphics.fillStyle(0xececec, 1);
        this.graphics.fillCircle(projectile.x, projectile.y, 2.1);
        this.graphics.fillStyle(0x1a1a1a, 1);
        this.graphics.fillRect(projectile.x - 1, projectile.y - 1, 1, 1);
        this.graphics.fillRect(projectile.x, projectile.y, 1, 1);
        continue;
      }
      if (projectile.projectileType === 'digger') {
        this.graphics.fillStyle(0xd2b377, 1);
        this.graphics.fillRect(Math.floor(projectile.x), Math.floor(projectile.y), 1, 1);
        continue;
      }
      if (projectile.projectileType === 'sandhog') {
        this.graphics.fillStyle(0xffdc8a, 1);
        this.graphics.fillRect(Math.floor(projectile.x), Math.floor(projectile.y), 1, 1);
        continue;
      }
      if (projectile.projectileType === 'napalm-burn') {
        this.graphics.fillStyle(0xffd14a, 0.85);
        this.graphics.fillRect(Math.floor(projectile.x), Math.floor(projectile.y), 2, 2);
        continue;
      }
      if (projectile.projectileType === 'mirv-carrier' || projectile.projectileType === 'mirv-child') {
        this.graphics.fillStyle(0x0e0e0e, 1);
        this.graphics.fillRect(Math.floor(projectile.x) - 1, Math.floor(projectile.y), 4, 2);
        this.graphics.fillStyle(0xd42323, 1);
        this.graphics.fillRect(Math.floor(projectile.x) + 1, Math.floor(projectile.y), 1, 1);
        continue;
      }
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(Math.floor(projectile.x), Math.floor(projectile.y), 2, 2);
    }

    for (const exp of runtime.explosions) {
      const maxLife = Math.max(0.001, exp.maxLife ?? exp.life);
      const progress = Phaser.Math.Clamp(1 - exp.life / maxLife, 0, 1);
      const alpha = Phaser.Math.Clamp(exp.life / maxLife, 0, 1);
      const main = exp.color ? Phaser.Display.Color.HexStringToColor(exp.color).color : 0xffb31f;

      if (exp.kind === 'laser') {
        const beamHeight = exp.beamHeight ?? 160;
        const top = Math.max(2, exp.y - beamHeight * (0.25 + progress * 0.75));
        this.graphics.lineStyle(Math.max(1, exp.radius * 0.35), 0x6ce2ff, alpha * 0.9);
        this.graphics.lineBetween(exp.x, exp.y, exp.x, top);
        this.graphics.lineStyle(Math.max(1, exp.radius * 0.14), 0xffffff, alpha);
        this.graphics.lineBetween(exp.x, exp.y, exp.x, top);
        continue;
      }

      if (exp.kind === 'sand') {
        const puffs = 28;
        for (let i = 0; i < puffs; i += 1) {
          const a = (Math.PI * 2 * i) / puffs;
          const dist = exp.radius * (0.2 + progress * 0.8) * (0.6 + (i % 5) * 0.1);
          const px = exp.x + Math.cos(a) * dist;
          const py = exp.y - progress * exp.radius * 0.5 + Math.sin(a) * dist * 0.35;
          this.graphics.fillStyle(i % 2 === 0 ? 0xe8d79a : 0xc7b27a, alpha * 0.6);
          this.graphics.fillRect(px, py, 2, 2);
        }
        continue;
      }

      if (exp.kind === 'fire') {
        const flameH = exp.radius * (1.2 + progress * 0.9);
        this.graphics.fillStyle(0xff9b2b, alpha * 0.45);
        this.graphics.fillEllipse(exp.x, exp.y - flameH * 0.38, exp.radius * 1.3, flameH);
        this.graphics.fillStyle(0xff4f1f, alpha * 0.7);
        this.graphics.fillEllipse(exp.x, exp.y - flameH * 0.3, exp.radius * 0.9, flameH * 0.68);
        this.graphics.fillStyle(0xffef96, alpha * 0.9);
        this.graphics.fillEllipse(exp.x, exp.y - flameH * 0.18, exp.radius * 0.45, flameH * 0.4);
        continue;
      }

      if (exp.kind === 'fuel-pool') {
        const spread = exp.radius * (1 + progress * 0.35);
        const c = exp.color ? Phaser.Display.Color.HexStringToColor(exp.color).color : 0xffa448;
        this.graphics.fillStyle(c, alpha * 0.35);
        this.graphics.fillEllipse(exp.x, exp.y, spread * 2.2, spread * 0.65);
        this.graphics.fillStyle(0xffd07a, alpha * 0.22);
        this.graphics.fillEllipse(exp.x - spread * 0.15, exp.y - 0.5, spread * 1.3, spread * 0.34);
        continue;
      }

      if (exp.kind === 'funky') {
        const funkyColors = [0xff2e2e, 0xffb11f, 0xf8ff3c, 0x4cff63, 0x3ec8ff, 0x6c54ff];
        for (let i = 0; i < funkyColors.length; i += 1) {
          const r = exp.radius * (0.22 + i * 0.13 + progress * 0.35);
          this.graphics.lineStyle(2, funkyColors[i], alpha * (0.95 - i * 0.12));
          this.graphics.strokeCircle(exp.x, exp.y, r);
        }
        continue;
      }

      if (exp.kind === 'funky-side') {
        const rNow = Math.max(6, exp.radius * (0.82 + progress * 0.18));
        this.graphics.fillStyle(0x0a0000, alpha * 0.92);
        this.graphics.fillCircle(exp.x, exp.y, rNow);
        this.graphics.fillStyle(0x4a0000, alpha * 0.95);
        this.graphics.fillCircle(exp.x, exp.y, rNow * 0.82);
        this.graphics.fillStyle(0x9f0000, alpha * 0.95);
        this.graphics.fillCircle(exp.x, exp.y, rNow * 0.62);
        this.graphics.fillStyle(0xff1b1b, alpha * 0.92);
        this.graphics.fillCircle(exp.x, exp.y, rNow * 0.42);
        this.graphics.fillStyle(0x2a0000, alpha * 0.95);
        this.graphics.strokeCircle(exp.x, exp.y, rNow);
        continue;
      }

      if (exp.kind === 'riot-rings') {
        const ringColors = [0x8f36dd, 0xaa4df0, 0xc36bff, 0xdd9bff];
        for (let i = 0; i < ringColors.length; i += 1) {
          const rr = exp.radius * (0.25 + i * 0.22 + progress * 0.75);
          this.graphics.lineStyle(2, ringColors[i], alpha * (0.95 - i * 0.12));
          this.graphics.strokeCircle(exp.x, exp.y, rr);
        }
        this.graphics.fillStyle(0x6f22b7, alpha * 0.2);
        this.graphics.fillCircle(exp.x, exp.y, Math.max(2, exp.radius * 0.24));
        continue;
      }

      if (exp.kind === 'riot-blast') {
        const dir = exp.direction ?? 1;
        const center = dir < 0 ? Math.PI : 0;
        const start = center - Math.PI / 4;
        const end = center + Math.PI / 4;
        const arcBands = [0.35, 0.58, 0.82];
        for (let b = 0; b < arcBands.length; b += 1) {
          const rr = exp.radius * (arcBands[b] + progress * 0.55);
          this.graphics.lineStyle(Math.max(1, 2 - b * 0.3), 0xc06aff, alpha * (0.95 - b * 0.18));
          let prevX = exp.x + Math.cos(start) * rr;
          let prevY = exp.y + Math.sin(start) * rr;
          const steps = 9;
          for (let i = 1; i <= steps; i += 1) {
            const t = i / steps;
            const a = start + (end - start) * t;
            const x = exp.x + Math.cos(a) * rr;
            const y = exp.y + Math.sin(a) * rr;
            this.graphics.lineBetween(prevX, prevY, x, y);
            prevX = x;
            prevY = y;
          }
        }
        continue;
      }

      if (exp.kind === 'simple') {
        const rNow = Math.max(2, exp.radius * (0.1 + progress * 0.9));
        const seed = exp.seed ?? 1337;
        this.graphics.fillStyle(0xff9b00, alpha * 0.18);
        this.graphics.fillCircle(exp.x, exp.y, rNow);
        this.graphics.lineStyle(2, 0xffea5b, alpha * 0.95);
        this.graphics.strokeCircle(exp.x, exp.y, rNow * 0.8);
        this.graphics.lineStyle(1.5, 0x3d3d3d, alpha * 0.6);
        this.graphics.strokeCircle(exp.x, exp.y, rNow * 0.48);
        this.graphics.lineStyle(1, 0xffffff, alpha * 0.9);
        this.graphics.strokeCircle(exp.x, exp.y, rNow * 0.3);

        // Java's SimpleExplosion has noisy/random rings; emulate with deterministic speckles.
        for (let i = 0; i < 34; i += 1) {
          const t = ((seed % 97) + i * 31 + Math.floor(progress * 200)) * 0.17;
          const a = t % (Math.PI * 2);
          const rr = rNow * (0.22 + ((seed + i * 19) % 100) / 100 * 0.72);
          const px = exp.x + Math.cos(a) * rr;
          const py = exp.y + Math.sin(a) * rr;
          this.graphics.fillStyle(i % 2 === 0 ? 0xffe54b : 0xff5a24, alpha * 0.7);
          this.graphics.fillRect(px, py, 1, 1);
        }
        continue;
      }

      if (exp.kind === 'nuke') {
        drawNukeExplosion(this.graphics, exp);
        continue;
      }

      if (exp.kind === 'mirv') {
        const rNow = Math.max(6, exp.radius * (0.82 + progress * 0.18));
        const phase = Math.floor(progress * 8 + ((exp.seed ?? 0) % 5)) % 4;
        const ramp = [0x5a0000, 0x7a0000, 0x9f0000, 0xc80000];
        const c0 = ramp[phase];
        const c1 = ramp[(phase + 1) % ramp.length];
        const c2 = ramp[(phase + 2) % ramp.length];
        this.graphics.fillStyle(0x0a0000, alpha * 0.92);
        this.graphics.fillCircle(exp.x, exp.y, rNow);
        this.graphics.fillStyle(c0, alpha * 0.95);
        this.graphics.fillCircle(exp.x, exp.y, rNow * 0.82);
        this.graphics.fillStyle(c1, alpha * 0.95);
        this.graphics.fillCircle(exp.x, exp.y, rNow * 0.62);
        this.graphics.fillStyle(c2, alpha * 0.92);
        this.graphics.fillCircle(exp.x, exp.y, rNow * 0.42);
        this.graphics.fillStyle(0x2a0000, alpha * 0.95);
        this.graphics.strokeCircle(exp.x, exp.y, rNow);
        continue;
      }

      this.graphics.fillStyle(main, alpha);
      this.graphics.fillCircle(exp.x, exp.y, exp.radius);
      this.graphics.fillStyle(0xff5722, alpha * 0.95);
      this.graphics.fillCircle(exp.x, exp.y, exp.radius * 0.55);
    }

    this.graphics.fillStyle(0xb9b9b9, 1);
    this.graphics.fillRect(0, 0, match.width, hudH);

    this.graphics.lineStyle(1, 0x2b2b2b, 1);
    this.graphics.strokeRect(0.5, 0.5, match.width - 1, hudH - 1);
    this.graphics.lineStyle(1, 0xdadada, 1);
    this.graphics.strokeRect(1.5, 1.5, match.width - 3, match.height - 3);
    this.graphics.strokeRect(innerX - 0.5, innerY - 0.5, innerW + 1, innerH + 1);

    const now = this.time.now;
    if (now < this.turnNoticeEndMs) {
      const durationMs = Math.max(1, this.turnNoticeEndMs - this.turnNoticeStartMs);
      const elapsed = Phaser.Math.Clamp((now - this.turnNoticeStartMs) / durationMs, 0, 1);
      const pulse = 0.75 + Math.abs(Math.sin(elapsed * Math.PI * 5)) * 0.25;
      const fade = 1 - elapsed * 0.8;
      this.turnNoticeText.setPosition(match.width * 0.5, innerY + innerH * 0.26);
      this.turnNoticeText.setScale(1 + (1 - elapsed) * 0.22);
      this.turnNoticeText.setAlpha(Phaser.Math.Clamp(pulse * fade, 0.08, 1));
      this.turnNoticeText.setVisible(true);
    } else {
      this.turnNoticeText.setVisible(false);
    }

    const active = match.players.find((p) => p.config.id === match.activePlayerId);
    if (active && this.time.now < this.turnIndicatorEndMs) {
      const durationMs = Math.max(1, this.turnIndicatorEndMs - this.turnIndicatorStartMs);
      const elapsed = Phaser.Math.Clamp((this.time.now - this.turnIndicatorStartMs) / durationMs, 0, 1);
      const pulse = 0.55 + Math.abs(Math.sin(elapsed * Math.PI * 4.5)) * 0.45;
      const fade = 1 - elapsed * 0.55;
      const alpha = Phaser.Math.Clamp(pulse * fade, 0.2, 1);
      const bob = Math.sin(elapsed * Math.PI * 5) * 2.5 * (1 - elapsed * 0.4);
      const tipY = Math.max(innerY + 5, Math.floor(active.y - 8 + bob));
      const topY = tipY - 8;
      this.graphics.fillStyle(0xff1f1f, alpha);
      this.graphics.fillTriangle(active.x - 5, topY, active.x + 5, topY, active.x, tipY);
      this.graphics.lineStyle(1, 0x4a0000, Math.min(1, alpha + 0.1));
      this.graphics.strokeTriangle(active.x - 5, topY, active.x + 5, topY, active.x, tipY);
    }
    if (active) {
      const weapon = getWeaponById(active.selectedWeaponId);
      const iconKey = this.weaponIconTextureKey(weapon.id);
      if (this.textures.exists(iconKey)) {
        this.weaponIcon.setTexture(iconKey);
        this.weaponIcon.setDisplaySize(8, 8);
        this.weaponIcon.setAlpha(1);
      } else {
        this.weaponIcon.setAlpha(0);
      }
      const bar = this.getPowerBarRect(match.width);
      this.graphics.fillStyle(0x2c2c2c, 1);
      this.graphics.fillRect(bar.x, bar.y, bar.w, bar.h);
      const fillW = Math.round((active.power / Math.max(1, active.maxPower)) * bar.w);
      this.graphics.fillStyle(0x7b1010, 1);
      this.graphics.fillRect(bar.x, bar.y, Phaser.Math.Clamp(fillW, 0, bar.w), bar.h);
      this.graphics.lineStyle(1, 0x111111, 1);
      this.graphics.strokeRect(bar.x, bar.y, bar.w, bar.h);
      const ammoText = match.settings.freeFireMode ? 'INF' : String(active.inventory[active.selectedWeaponId] ?? 0);
      this.hudText.setText(`Ammo:${ammoText}  Power:${Math.round(active.power)}  Limit:${Math.round(active.maxPower)}  Angle:${Math.round(active.angle)}`);
      const weaponLabelX = 8 + this.hudText.width + 14;
      this.hudWeaponLabelText.setPosition(weaponLabelX, 6);
      this.hudWeaponValueText.setText(`${weapon.name}  Wind:${Math.round(Math.abs(match.wind * 8))}${match.wind >= 0 ? '->' : '<-'}`);
      this.weaponIcon.setPosition(weaponLabelX + this.hudWeaponLabelText.width + 3, 11.5);
      this.hudWeaponValueText.setPosition(this.weaponIcon.x + 10, 6);
      this.noteText.setText(`${message || `Round ${match.roundIndex}/${match.settings.roundsToWin}`}  Health:${Math.round(active.hp)}%  Fuel:${Math.round(active.fuel)}  Chutes:${active.parachutes}`);
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
        mode: Phaser.Scale.NONE,
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
      <div className="battle-footer">{`${message || `Round ${match.roundIndex}`} | Controls: A/D fuel move, Arrows angle/power, Alt+Up/Down fast power, Alt+Left/Right quick angle, Tab weapon, I inventory shields`}</div>
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
