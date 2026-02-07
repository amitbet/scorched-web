import type { GameSettings, PlayerConfig } from '../types/game';
import { DEFAULT_SETTINGS } from '../types/game';

interface ProfileSave {
  settings: GameSettings;
  players: PlayerConfig[];
}

const PROFILE_KEY = 'scorched.profile.v1';

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
