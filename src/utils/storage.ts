import type { GameSettings, PlayerConfig } from '../types/game';
import { DEFAULT_SETTINGS } from '../types/game';

interface ProfileSave {
  settings: GameSettings;
  players: PlayerConfig[];
}

export interface NetPrefs {
  lastEndpoint: string;
  lastPlayerName: string;
}

const PROFILE_KEY = 'scorched.profile.v1';
const NET_PREFS_KEY = 'scorched.netprefs.v1';

export function saveProfile(settings: GameSettings, players: PlayerConfig[]): void {
  const payload: ProfileSave = { settings, players };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
}

export function loadProfile(): ProfileSave | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProfileSave>;
    if (!parsed.settings || !parsed.players) {
      return null;
    }
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      players: parsed.players,
    };
  } catch {
    return null;
  }
}

export function saveNetPrefs(input: NetPrefs): void {
  localStorage.setItem(NET_PREFS_KEY, JSON.stringify(input));
}

export function loadNetPrefs(): NetPrefs | null {
  const raw = localStorage.getItem(NET_PREFS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<NetPrefs>;
    if (typeof parsed.lastEndpoint !== 'string' || typeof parsed.lastPlayerName !== 'string') {
      return null;
    }
    return {
      lastEndpoint: parsed.lastEndpoint,
      lastPlayerName: parsed.lastPlayerName,
    };
  } catch {
    return null;
  }
}
