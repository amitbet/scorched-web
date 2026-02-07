import { useCallback, useEffect, useRef, useState } from 'react';
import { TitleScreen } from './screens/TitleScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PlayersScreen } from './screens/PlayersScreen';
import { ShopScreen } from './screens/ShopScreen';
import { BattleScreen, type BattleInputState } from './screens/BattleScreen';
import { DEFAULT_SETTINGS, TANK_COLORS, type GameSettings, type MatchState, type PlayerConfig, type PlayerState, type ProjectileState, type TerrainState } from './types/game';
import { loadProfile, saveProfile } from './utils/storage';
import { buyWeapon, sellWeapon } from './game/Economy';
import { STARTER_WEAPON_ID, WEAPONS, getWeaponById } from './game/WeaponCatalog';
import { FIXED_DT, spreadAngles, stepProjectile, toVelocity } from './engine/physics/Ballistics';
import { applyRoundEnd, initMatch, nextActivePlayer, updatePlayer } from './game/MatchController';
import { carveCrater, carveTunnel } from './engine/terrain/TerrainDeform';
import { computeAIShot } from './engine/ai/AimAI';
import { generateTerrain } from './engine/terrain/TerrainGenerator';
import { computeExplosionDamage, spawnFunkeyBomblets } from './game/Combat';
import { SHIELD_ITEMS, activateShieldFromInventory, autoActivateShieldAtRoundStart } from './game/Shield';

type Screen = 'title' | 'settings' | 'players' | 'shop' | 'battle' | 'matchEnd';

interface RuntimeState {
  projectiles: ProjectileState[];
  explosions: { x: number; y: number; radius: number; life: number; color?: string }[];
  trails: { x1: number; y1: number; x2: number; y2: number; ownerId: string; life: number; color?: string }[];
}

function makeDefaultPlayers(): PlayerConfig[] {
  return Array.from({ length: 8 }).map((_, idx) => ({
    id: `p${idx + 1}`,
    name: `Player ${idx + 1}`,
    kind: idx < 2 ? 'human' : 'ai',
    aiLevel: 'normal',
    colorIndex: idx,
    enabled: idx < 2,
  }));
}

function pickNextWeapon(player: PlayerState, delta: number): string {
  const owned = WEAPONS.filter((w) => (player.inventory[w.id] ?? 0) > 0);
  if (owned.length === 0) {
    return player.selectedWeaponId;
  }
  const index = Math.max(0, owned.findIndex((w) => w.id === player.selectedWeaponId));
  const next = (index + delta + owned.length) % owned.length;
  return owned[next].id;
}

function isSolid(terrain: TerrainState, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= terrain.width || ty < 0 || ty >= terrain.height) {
    return false;
  }
  return terrain.mask[ty * terrain.width + tx] === 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeSettings(input: GameSettings): GameSettings {
  return {
    ...input,
    gravity: clamp(Number.isFinite(input.gravity) ? input.gravity : DEFAULT_SETTINGS.gravity, 180, 480),
    roundsToWin: clamp(Number.isFinite(input.roundsToWin) ? input.roundsToWin : DEFAULT_SETTINGS.roundsToWin, 1, 9),
    cashStart: clamp(Number.isFinite(input.cashStart) ? input.cashStart : DEFAULT_SETTINGS.cashStart, 1000, 100000),
    powerAdjustHz: clamp(Number.isFinite(input.powerAdjustHz) ? input.powerAdjustHz : DEFAULT_SETTINGS.powerAdjustHz, 2, 40),
  };
}

function maxPowerForHp(hp: number): number {
  return clamp(Math.round(260 + hp * 7.4), 260, 1000);
}

function enqueueTankDeathFx(runtime: RuntimeState, player: PlayerState): void {
  const color = TANK_COLORS[player.config.colorIndex % TANK_COLORS.length];
  for (let i = 0; i < 4; i += 1) {
    runtime.explosions.push({
      x: player.x + (i - 1.5) * 4,
      y: player.y - 2 - i * 1.8,
      radius: 16 + i * 4,
      life: 0.45 + i * 0.08,
      color,
    });
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (Math.PI * 2 * i) / 12;
    runtime.explosions.push({
      x: player.x + Math.cos(a) * 10,
      y: player.y - 2 + Math.sin(a) * 5,
      radius: 4 + (i % 3),
      life: 0.28 + (i % 4) * 0.06,
      color: i % 2 === 0 ? '#ffb547' : '#ff3e2a',
    });
  }
}

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('title');
  const [settings, setSettings] = useState(normalizeSettings(DEFAULT_SETTINGS));
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>(makeDefaultPlayers);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [terrain, setTerrain] = useState<TerrainState | null>(null);
  const [shopIndex, setShopIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [shieldMenuOpen, setShieldMenuOpen] = useState(false);

  const runtimeRef = useRef<RuntimeState>({ projectiles: [], explosions: [], trails: [] });
  const aiFireTimeout = useRef<number | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const terrainRef = useRef<TerrainState | null>(null);
  const simulationAccumulatorRef = useRef(0);
  const uiSyncAccumulatorRef = useRef(0);
  const powerTickAccumulatorRef = useRef(0);
  const angleTickAccumulatorRef = useRef(0);
  const movementTickAccumulatorRef = useRef(0);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    terrainRef.current = terrain;
  }, [terrain]);

  useEffect(() => {
    if (screen !== 'battle' || !match || match.phase !== 'aim') {
      setShieldMenuOpen(false);
      return;
    }
    const active = match.players.find((p) => p.config.id === match.activePlayerId);
    if (!active || active.config.kind !== 'human') {
      setShieldMenuOpen(false);
    }
  }, [match, screen]);

  const fireWeapon = useCallback((sourceMatch: MatchState, shooter: PlayerState) => {
    const weapon = getWeaponById(shooter.selectedWeaponId);
    const ammo = shooter.inventory[weapon.id] ?? 0;
    if (ammo <= 0) {
      const fallbackToBaby = (shooter.inventory[STARTER_WEAPON_ID] ?? 0) > 0 ? STARTER_WEAPON_ID : pickNextWeapon(shooter, 1);
      if (fallbackToBaby !== shooter.selectedWeaponId) {
        const updatedShooter = { ...shooter, selectedWeaponId: fallbackToBaby };
        const updatedMatch = updatePlayer(sourceMatch, updatedShooter);
        matchRef.current = updatedMatch;
        setMatch(updatedMatch);
      }
      setMessage(`${shooter.config.name} is out of ${weapon.name}`);
      return;
    }
    const consumedInventory = { ...shooter.inventory, [weapon.id]: Math.max(0, ammo - 1) };
    const weaponDepleted = consumedInventory[weapon.id] <= 0;
    const nextSelectedWeaponId =
      weaponDepleted && (consumedInventory[STARTER_WEAPON_ID] ?? 0) > 0 ? STARTER_WEAPON_ID : shooter.selectedWeaponId;
    const armedShooter = { ...shooter, inventory: consumedInventory, selectedWeaponId: nextSelectedWeaponId };

    if (weapon.projectileCount <= 0) {
      const batteryHeal = weapon.id === 'battery' ? 32 : 0;
      const shieldBoost =
        weapon.id === 'shield' ? 35 :
        weapon.id === 'force-shield' ? 55 :
        weapon.id === 'heavy-shield' ? 85 : 0;
      const fuelBoost = weapon.id === 'fuel-tank' ? 80 : 0;
      const parachuteBoost = weapon.id === 'parachute' ? 1 : 0;
      const updated = {
        ...armedShooter,
        hp: clamp(armedShooter.hp + batteryHeal, 0, 100),
        shield: clamp(armedShooter.shield + shieldBoost, 0, 160),
        fuel: clamp(armedShooter.fuel + fuelBoost, 0, 999),
        parachutes: clamp(armedShooter.parachutes + parachuteBoost, 0, 9),
      };
      const nextMatch = nextActivePlayer(updatePlayer(sourceMatch, updated));
      matchRef.current = nextMatch;
      setMatch(nextMatch);
      setMessage(`${armedShooter.config.name} used ${weapon.name}`);
      return;
    }

    const angles = spreadAngles(armedShooter.angle, weapon.projectileCount, weapon.spreadDeg);
    for (const angle of angles) {
      const { vx, vy } = toVelocity(angle, armedShooter.power);
      runtimeRef.current.projectiles.push({
        x: armedShooter.x,
        y: armedShooter.y - 4,
        vx,
        vy,
        ownerId: armedShooter.config.id,
        weaponId: weapon.id,
        ttl: 9,
        splitDepth: 0,
      });
    }

    const armedMatch = { ...updatePlayer(sourceMatch, armedShooter), phase: 'projectile' as const };
    matchRef.current = armedMatch;
    setMatch(armedMatch);
    setMessage(`${armedShooter.config.name} fired ${weapon.name}`);
  }, []);

  const applyHeldAimInput = useCallback((
    currentMatch: MatchState,
    currentTerrain: TerrainState,
    input: Pick<BattleInputState, 'moveLeft' | 'moveRight' | 'left' | 'right' | 'up' | 'down' | 'fastUp' | 'fastDown' | 'powerSet'>,
    deltaSeconds: number,
  ): MatchState => {
    if (currentMatch.phase !== 'aim') {
      powerTickAccumulatorRef.current = 0;
      angleTickAccumulatorRef.current = 0;
      movementTickAccumulatorRef.current = 0;
      return currentMatch;
    }
    const active = currentMatch.players.find((p) => p.config.id === currentMatch.activePlayerId);
    if (!active || active.config.kind !== 'human') {
      powerTickAccumulatorRef.current = 0;
      angleTickAccumulatorRef.current = 0;
      movementTickAccumulatorRef.current = 0;
      return currentMatch;
    }

    const moveDirection = (input.moveRight ? 1 : 0) - (input.moveLeft ? 1 : 0);
    let updatedX = active.x;
    let updatedY = active.y;
    let updatedFuel = active.fuel;
    if (moveDirection !== 0 && updatedFuel > 0) {
      movementTickAccumulatorRef.current += deltaSeconds * Math.max(6, currentMatch.settings.powerAdjustHz * 0.85);
      while (movementTickAccumulatorRef.current >= 1 && updatedFuel > 0) {
        const nextX = clamp(Math.round(updatedX + moveDirection), 4, currentTerrain.width - 5);
        if (nextX === updatedX) {
          break;
        }
        updatedX = nextX;
        updatedY = currentTerrain.heights[nextX] - 4;
        updatedFuel = Math.max(0, updatedFuel - 1);
        movementTickAccumulatorRef.current -= 1;
      }
    } else {
      movementTickAccumulatorRef.current = 0;
    }

    const angleDirection = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    let updatedAngle = active.angle;
    if (angleDirection !== 0) {
      angleTickAccumulatorRef.current += deltaSeconds * currentMatch.settings.powerAdjustHz;
      while (angleTickAccumulatorRef.current >= 1) {
        updatedAngle = clamp(updatedAngle + angleDirection, 2, 178);
        angleTickAccumulatorRef.current -= 1;
      }
    } else {
      angleTickAccumulatorRef.current = 0;
    }
    if (typeof input.powerSet === 'number') {
      const setPower = clamp(input.powerSet, 120, active.maxPower);
      if (
        setPower === active.power &&
        updatedAngle === active.angle &&
        updatedX === active.x &&
        updatedY === active.y &&
        updatedFuel === active.fuel
      ) {
        return currentMatch;
      }
      return updatePlayer(currentMatch, {
        ...active,
        x: updatedX,
        y: updatedY,
        fuel: updatedFuel,
        fallDistance: 0,
        angle: updatedAngle,
        power: setPower,
      });
    }

    const fastDirection = (input.fastUp ? 1 : 0) - (input.fastDown ? 1 : 0);
    const powerDirection = fastDirection !== 0 ? fastDirection : (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const powerStep = fastDirection !== 0 ? 15 : 1;
    let updatedPower = active.power;
    if (powerDirection !== 0) {
      powerTickAccumulatorRef.current += deltaSeconds * currentMatch.settings.powerAdjustHz;
      while (powerTickAccumulatorRef.current >= 1) {
        updatedPower = clamp(updatedPower + powerDirection * powerStep, 120, active.maxPower);
        powerTickAccumulatorRef.current -= 1;
      }
    } else {
      powerTickAccumulatorRef.current = 0;
    }

    if (
      updatedAngle === active.angle &&
      updatedPower === active.power &&
      updatedX === active.x &&
      updatedY === active.y &&
      updatedFuel === active.fuel
    ) {
      return currentMatch;
    }

    const updated: PlayerState = {
      ...active,
      x: updatedX,
      y: updatedY,
      fuel: updatedFuel,
      fallDistance: 0,
      angle: updatedAngle,
      power: updatedPower,
    };
    return updatePlayer(currentMatch, updated);
  }, []);

  const stepSimulation = useCallback((currentMatch: MatchState, currentTerrain: TerrainState) => {
    const runtime = runtimeRef.current;
    let nextTerrain = currentTerrain;
    let nextMatch = currentMatch;

    const survivors: ProjectileState[] = [];
    const spawnedProjectiles: ProjectileState[] = [];
    for (const projectile of runtime.projectiles) {
      let p = projectile;
      let collided = false;
      const subStepCount = 4;
      const projectileTimeScale = 2.2;
      const subDt = FIXED_DT / subStepCount;

      for (let s = 0; s < subStepCount; s += 1) {
        const before = p;
        p = stepProjectile(p, subDt * projectileTimeScale, currentMatch.settings.gravity, currentMatch.wind);
        runtime.trails.push({
          x1: before.x,
          y1: before.y,
          x2: p.x,
          y2: p.y,
          ownerId: p.ownerId,
          life: 0.85,
          color: p.color,
        });

        if (p.x < 0 || p.x >= currentTerrain.width || p.y < 0 || p.y >= currentTerrain.height) {
          collided = true;
          break;
        }

        const hitTerrain = isSolid(nextTerrain, p.x, p.y);
        const hitPlayer = nextMatch.players.find(
          (player) =>
            player.alive &&
            player.config.id !== p.ownerId &&
            Math.abs(player.x - p.x) < 6 &&
            Math.abs(player.y - p.y) < 5,
        );
        if (!hitTerrain && !hitPlayer) {
          continue;
        }

        const weapon = getWeaponById(p.weaponId);
        const impactX = clamp(p.x, 0, currentTerrain.width - 1);
        const impactY = clamp(p.y, 0, currentTerrain.height - 1);

        if (weapon.id === 'funkey-bomb' && (p.splitDepth ?? 0) === 0) {
          runtime.explosions.push({ x: impactX, y: impactY, radius: 9, life: 0.25, color: '#ff8d3f' });
          nextTerrain = carveCrater(nextTerrain, impactX, impactY, 10);
          spawnedProjectiles.push(...spawnFunkeyBomblets(impactX, impactY, p.ownerId, p.vx, p.vy));
          collided = true;
          break;
        }

        if (weapon.terrainEffect === 'tunnel') {
          nextTerrain = carveTunnel(nextTerrain, impactX, impactY, 9, Math.max(3, weapon.blastRadius * 0.2));
        } else if (weapon.terrainEffect === 'crater') {
          nextTerrain = carveCrater(nextTerrain, impactX, impactY, weapon.blastRadius);
        }

        runtime.explosions.push({ x: impactX, y: impactY, radius: weapon.blastRadius, life: 0.3, color: p.color });

        if ((weapon.special === 'cluster' || weapon.special === 'napalm') && !(weapon.id === 'funkey-bomb' && (p.splitDepth ?? 0) > 0)) {
          const extra = weapon.special === 'cluster' ? 5 : 7;
          for (let i = 0; i < extra; i += 1) {
            const a = (Math.PI * 2 * i) / extra;
            const sx = impactX + Math.cos(a) * (8 + i * 2);
            const sy = impactY + Math.sin(a) * (6 + i * 1.5);
            runtime.explosions.push({ x: sx, y: sy, radius: Math.max(8, weapon.blastRadius * 0.42), life: 0.26 });
            nextTerrain = carveCrater(nextTerrain, sx, sy, Math.max(8, weapon.blastRadius * 0.42));
          }
        }

        nextMatch = {
          ...nextMatch,
          players: nextMatch.players.map((player) => {
            if (!player.alive) {
              return player;
            }
            const dist = Math.hypot(player.x - impactX, player.y - impactY);
            const secondary = runtime.explosions.slice(-8).reduce((acc, e) => {
              const d = Math.hypot(player.x - e.x, player.y - e.y);
              if (d > e.radius) {
                return acc;
              }
              return acc + ((e.radius - d) / e.radius) * 10;
            }, 0);
            const damage = computeExplosionDamage({
              dist,
              blastRadius: weapon.blastRadius,
              weaponDamage: (p.splitDepth ?? 0) > 0 ? weapon.damage * 0.8 : weapon.damage,
              secondaryDamage: secondary,
              shield: player.shield,
              armor: player.armor,
            });
            if (damage.hpLoss <= 0) {
              return player;
            }

            const nextHp = clamp(player.hp - damage.hpLoss, 0, 100);
            if (player.alive && nextHp <= 0) {
              enqueueTankDeathFx(runtime, player);
            }
            return {
              ...player,
              shield: damage.nextShield,
              armor: damage.nextArmor,
              hp: nextHp,
              maxPower: maxPowerForHp(nextHp),
              power: clamp(player.power, 120, maxPowerForHp(nextHp)),
              alive: nextHp > 0,
            };
          }),
        };
        collided = true;
        break;
      }

      if (!collided && p.ttl > 0) {
        survivors.push(p);
      }
    }

    runtime.projectiles = [...survivors, ...spawnedProjectiles];
    runtime.explosions = runtime.explosions
      .map((e) => ({ ...e, life: e.life - FIXED_DT }))
      .filter((e) => e.life > 0);
    runtime.trails = runtime.trails
      .map((t) => ({ ...t, life: t.life - FIXED_DT * 1.6 }))
      .filter((t) => t.life > 0)
      .slice(-2400);

    nextMatch = {
      ...nextMatch,
      players: nextMatch.players.map((player) => {
        if (!player.alive) {
          return player;
        }
        const x = clamp(Math.floor(player.x), 0, nextTerrain.width - 1);
        const groundY = nextTerrain.heights[x] - 4;
        const fallDist = groundY - player.y;
        if (fallDist <= 0) {
          if (player.fallDistance === 0) {
            return player;
          }
          const hadChute = player.parachutes > 0;
          const shouldConsumeChute = hadChute && player.fallDistance > 16;
          const effectiveFall = hadChute ? player.fallDistance * 0.25 : player.fallDistance;
          const landingDamage = Math.max(0, effectiveFall - 10) * 0.5;
          const hpAfterLanding = clamp(player.hp - landingDamage, 0, 100);
          if (player.alive && hpAfterLanding <= 0) {
            enqueueTankDeathFx(runtime, player);
          }
          return {
            ...player,
            y: groundY,
            hp: hpAfterLanding,
            maxPower: maxPowerForHp(hpAfterLanding),
            power: clamp(player.power, 120, maxPowerForHp(hpAfterLanding)),
            alive: hpAfterLanding > 0,
            parachutes: shouldConsumeChute ? Math.max(0, player.parachutes - 1) : player.parachutes,
            fallDistance: 0,
          };
        }

        const usingParachute = player.parachutes > 0 && player.fallDistance + fallDist > 18;
        const verticalSpeed = usingParachute ? 62 : 260;
        const step = Math.min(fallDist, verticalSpeed * FIXED_DT);
        const nextY = player.y + step;
        const nextFallDistance = player.fallDistance + step;
        if (nextY >= groundY) {
          const shouldConsumeChute = usingParachute;
          const effectiveFall = usingParachute ? nextFallDistance * 0.25 : nextFallDistance;
          const landingDamage = Math.max(0, effectiveFall - 10) * 0.5;
          const hpAfterLanding = clamp(player.hp - landingDamage, 0, 100);
          if (player.alive && hpAfterLanding <= 0) {
            enqueueTankDeathFx(runtime, player);
          }
          return {
            ...player,
            y: groundY,
            hp: hpAfterLanding,
            maxPower: maxPowerForHp(hpAfterLanding),
            power: clamp(player.power, 120, maxPowerForHp(hpAfterLanding)),
            alive: hpAfterLanding > 0,
            parachutes: shouldConsumeChute ? Math.max(0, player.parachutes - 1) : player.parachutes,
            fallDistance: 0,
          };
        }
        return {
          ...player,
          y: nextY,
          fallDistance: nextFallDistance,
        };
      }),
    };

    const alive = nextMatch.players.filter((p) => p.alive);
    if (alive.length <= 1) {
      if (alive.length === 1) {
        setMessage(`${alive[0].config.name} wins round ${nextMatch.roundIndex}`);
      } else {
        setMessage('Round draw');
      }
      const postRound = applyRoundEnd({ ...nextMatch, phase: 'roundEnd' });
      if (postRound.phase === 'matchEnd') {
        const winner = postRound.players.reduce((best, p) => (p.score > best.score ? p : best), postRound.players[0]);
        setWinnerName(winner.config.name);
        matchRef.current = postRound;
        terrainRef.current = nextTerrain;
        setMatch(postRound);
        setTerrain(nextTerrain);
        setScreen('matchEnd');
      } else {
        const regenerated = generateTerrain(postRound.width, postRound.height, postRound.settings.terrainPreset);
        const spacing = regenerated.width / (postRound.players.length + 1);
        const reseated = {
          ...postRound,
          players: postRound.players.map((p, i) => {
            const nx = Math.floor(spacing * (i + 1));
            return {
              ...p,
              x: nx,
              y: regenerated.heights[nx] - 8,
              fallDistance: 0,
              selectedWeaponId: p.selectedWeaponId,
            };
          }),
        };
        runtimeRef.current = { projectiles: [], explosions: [], trails: [] };
        matchRef.current = reseated;
        terrainRef.current = regenerated;
        setMatch(reseated);
        setTerrain(regenerated);
        setShopIndex(0);
        setScreen('shop');
      }
      return;
    }

    const hasAirbornePlayers = nextMatch.players.some((player) => {
      if (!player.alive) {
        return false;
      }
      const x = clamp(Math.floor(player.x), 0, nextTerrain.width - 1);
      const groundY = nextTerrain.heights[x] - 4;
      return groundY - player.y > 0.75;
    });

    if (runtime.projectiles.length === 0 && currentMatch.phase === 'projectile' && !hasAirbornePlayers) {
      nextMatch = nextActivePlayer({ ...nextMatch, phase: 'resolve' });
    }

    matchRef.current = nextMatch;
    terrainRef.current = nextTerrain;
  }, []);

  useEffect(() => {
    if (!match || !terrain || screen !== 'battle') {
      return;
    }
    const active = match.players.find((p) => p.config.id === match.activePlayerId);
    if (!active || active.config.kind !== 'ai' || match.phase !== 'aim') {
      return;
    }

    if (aiFireTimeout.current) {
      window.clearTimeout(aiFireTimeout.current);
    }

    aiFireTimeout.current = window.setTimeout(() => {
      const latestActive = match.players.find((p) => p.config.id === match.activePlayerId);
      if (!latestActive || latestActive.config.kind !== 'ai') {
        return;
      }
      const shot = computeAIShot(match, latestActive, terrain, latestActive.config.aiLevel);
      const weaponId = (latestActive.inventory[shot.weaponId] ?? 0) > 0 ? shot.weaponId : pickNextWeapon(latestActive, 1);
      const tuned = {
        ...latestActive,
        angle: shot.angle,
        power: clamp(shot.power, 120, latestActive.maxPower),
        selectedWeaponId: weaponId,
      };
      const withTune = updatePlayer(match, tuned);
      setMatch(withTune);
      fireWeapon(withTune, tuned);
    }, 650);

    return () => {
      if (aiFireTimeout.current) {
        window.clearTimeout(aiFireTimeout.current);
      }
    };
  }, [fireWeapon, match, terrain, screen]);

  const onBattleInputFrame = useCallback((input: BattleInputState, deltaMs: number) => {
    if (screen !== 'battle') {
      return;
    }
    const currentTerrain = terrainRef.current;
    let currentMatch = matchRef.current;
    if (!currentMatch || !currentTerrain) {
      return;
    }
    let liveMatch: MatchState = currentMatch;

    if (liveMatch.phase === 'aim') {
      const active = liveMatch.players.find((p) => p.config.id === liveMatch.activePlayerId);
      if (active?.config.kind === 'human') {
        if (input.toggleShieldMenu) {
          setShieldMenuOpen((open) => !open);
        }

        if (shieldMenuOpen) {
          matchRef.current = liveMatch;
          return;
        }

        if (input.weaponCycle !== 0) {
          const updated = { ...active, selectedWeaponId: pickNextWeapon(active, input.weaponCycle) };
          liveMatch = updatePlayer(liveMatch, updated);
          matchRef.current = liveMatch;
        }

        if (input.firePressed) {
          fireWeapon(liveMatch, active);
          liveMatch = matchRef.current ?? liveMatch;
        } else {
          const aimed = applyHeldAimInput(liveMatch, currentTerrain, input, Math.min(250, deltaMs) / 1000);
          if (aimed !== liveMatch) {
            liveMatch = aimed;
            matchRef.current = aimed;
          }
        }
      }
    }

    const frameSeconds = Math.min(250, deltaMs) / 1000;
    simulationAccumulatorRef.current += frameSeconds;
    while (simulationAccumulatorRef.current >= FIXED_DT) {
      const loopMatch = matchRef.current;
      const loopTerrain = terrainRef.current;
      if (loopMatch && loopTerrain) {
        stepSimulation(loopMatch, loopTerrain);
      }
      simulationAccumulatorRef.current -= FIXED_DT;
    }

    uiSyncAccumulatorRef.current += deltaMs;
    if (uiSyncAccumulatorRef.current >= 80) {
      if (matchRef.current) {
        setMatch(matchRef.current);
      }
      if (terrainRef.current) {
        setTerrain(terrainRef.current);
      }
      uiSyncAccumulatorRef.current = 0;
    }
  }, [applyHeldAimInput, fireWeapon, screen, shieldMenuOpen, stepSimulation]);

  const startShopToBattle = useCallback((existingMatch: MatchState) => {
    const regenerated = generateTerrain(existingMatch.width, existingMatch.height, existingMatch.settings.terrainPreset);
    const spacing = regenerated.width / (existingMatch.players.length + 1);
    const players = existingMatch.players.map((p, i) => {
      const x = Math.floor(spacing * (i + 1));
      const roundReady = { ...p, x, y: regenerated.heights[x] - 8, fallDistance: 0, alive: true, hp: 100, maxPower: 1000, power: clamp(p.power, 120, 1000) };
      return autoActivateShieldAtRoundStart(roundReady);
    });
    const next = { ...existingMatch, players, phase: 'aim' as const, activePlayerId: players[0].config.id };
    terrainRef.current = regenerated;
    matchRef.current = next;
    setTerrain(regenerated);
    setMatch(next);
    runtimeRef.current = { projectiles: [], explosions: [], trails: [] };
    simulationAccumulatorRef.current = 0;
    uiSyncAccumulatorRef.current = 0;
    powerTickAccumulatorRef.current = 0;
    angleTickAccumulatorRef.current = 0;
    movementTickAccumulatorRef.current = 0;
    setScreen('battle');
  }, []);

  const useShieldFromPopup = useCallback((shieldId: 'shield' | 'force-shield' | 'heavy-shield') => {
    const liveMatch = matchRef.current;
    if (!liveMatch || liveMatch.phase !== 'aim') {
      return;
    }
    const active = liveMatch.players.find((p) => p.config.id === liveMatch.activePlayerId);
    if (!active || active.config.kind !== 'human') {
      return;
    }
    const updated = activateShieldFromInventory(active, shieldId);
    if (updated === active) {
      return;
    }
    const next = updatePlayer(liveMatch, updated);
    matchRef.current = next;
    setMatch(next);
    setMessage(`${active.config.name} activated ${shieldId}`);
  }, []);

  const activeShopPlayer = match?.players[shopIndex] ?? null;
  const activeBattlePlayer = match?.players.find((p) => p.config.id === match.activePlayerId);
  const shieldMenuItems = activeBattlePlayer
    ? SHIELD_ITEMS.map((item) => ({
      ...item,
      count: activeBattlePlayer.inventory[item.id] ?? 0,
    }))
    : [];

  return (
    <div className={`app ${screen === 'battle' ? 'battle-mode' : ''}`}>
      {screen === 'title' && (
        <TitleScreen
          onStart={() => setScreen('players')}
          onSettings={() => setScreen('settings')}
          onLoad={() => {
            const profile = loadProfile();
            if (profile) {
              setSettings(normalizeSettings(profile.settings));
              setPlayerConfigs(profile.players);
              setMessage('Loaded profile');
            } else {
              setMessage('No saved profile found');
            }
          }}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={(next) => {
            const normalized = normalizeSettings(next);
            setSettings(normalized);
            saveProfile(normalized, playerConfigs);
          }}
          onBack={() => setScreen('title')}
        />
      )}

      {screen === 'players' && (
        <PlayersScreen
          players={playerConfigs}
          onChange={(players) => {
            setPlayerConfigs(players);
            saveProfile(settings, players);
          }}
          onBack={() => setScreen('title')}
          onNext={() => {
            const enabled = playerConfigs.filter((p) => p.enabled);
            const { match: newMatch, terrain: newTerrain } = initMatch(settings, enabled, window.innerWidth, window.innerHeight);
            setMatch(newMatch);
            setTerrain(newTerrain);
            setShopIndex(0);
            setScreen('shop');
          }}
        />
      )}

      {screen === 'shop' && match && activeShopPlayer && (
        <ShopScreen
          players={match.players}
          currentIndex={shopIndex}
          onBuy={(playerId, weaponId) => {
            setMatch((current) => {
              if (!current) {
                return null;
              }
              return {
                ...current,
                players: current.players.map((p) => (p.config.id === playerId ? buyWeapon(p, weaponId) : p)),
              };
            });
          }}
          onSell={(playerId, weaponId) => {
            setMatch((current) => {
              if (!current) {
                return null;
              }
              return {
                ...current,
                players: current.players.map((p) => (p.config.id === playerId ? sellWeapon(p, weaponId) : p)),
              };
            });
          }}
          onNext={() => setShopIndex((idx) => clamp(idx + 1, 0, (match?.players.length ?? 1) - 1))}
          onDone={() => {
            if (match) {
              startShopToBattle(match);
            }
          }}
        />
      )}

      {screen === 'battle' && match && terrain && (
        <BattleScreen
          match={match}
          terrain={terrain}
          message={message}
          shieldMenuOpen={shieldMenuOpen}
          shieldMenuPlayerName={activeBattlePlayer?.config.name ?? ''}
          shieldMenuItems={shieldMenuItems}
          onCloseShieldMenu={() => setShieldMenuOpen(false)}
          onActivateShield={useShieldFromPopup}
          getSnapshot={() => ({
            match: matchRef.current,
            terrain: terrainRef.current,
            runtime: runtimeRef.current,
            message,
          })}
          onInputFrame={onBattleInputFrame}
        />
      )}

      {screen === 'matchEnd' && match && (
        <div className="screen panel end-screen">
          <h2>Match Winner: {winnerName}</h2>
          <ul>
            {match.players
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <li key={p.config.id}>
                  {p.config.name}: {p.score} round wins
                </li>
              ))}
          </ul>
          <div className="row">
            <button onClick={() => setScreen('players')}>New Match</button>
            <button onClick={() => setScreen('title')}>Title</button>
          </div>
        </div>
      )}

      {message && screen !== 'battle' && <div className="toast">{message}</div>}
    </div>
  );
}
