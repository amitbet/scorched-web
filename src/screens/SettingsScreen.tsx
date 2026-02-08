import type { GameSettings } from '../types/game';

interface SettingsScreenProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onBack: () => void;
}

export function SettingsScreen({ settings, onChange, onBack }: SettingsScreenProps): JSX.Element {
  return (
    <div className="screen panel settings-screen">
      <h2>Game Options</h2>
      <label>
        Number Of Rounds
        <input
          type="number"
          min={1}
          max={9}
          value={settings.roundsToWin}
          onChange={(e) => onChange({ ...settings, roundsToWin: Number(e.target.value) })}
        />
      </label>
      <label>
        Gravity
        <input
          type="range"
          min={160}
          max={420}
          value={settings.gravity}
          onChange={(e) => onChange({ ...settings, gravity: Number(e.target.value) })}
        />
        <span>{settings.gravity}</span>
      </label>
      <label>
        Wind
        <select value={settings.windMode} onChange={(e) => onChange({ ...settings, windMode: e.target.value as GameSettings['windMode'] })}>
          <option value="constant">Constant Wind</option>
          <option value="off">No Wind</option>
          <option value="changing">Changing Wind</option>
        </select>
      </label>
      <label>
        Terrain
        <select value={settings.terrainPreset} onChange={(e) => onChange({ ...settings, terrainPreset: e.target.value as GameSettings['terrainPreset'] })}>
          <option value="rolling">Rolling</option>
          <option value="canyon">Canyon</option>
          <option value="islands">Islands</option>
          <option value="random">Random</option>
          <option value="mtn">MTN</option>
        </select>
      </label>
      <label>
        Starting Cash
        <input
          type="number"
          min={0}
          max={500000}
          step={100}
          value={settings.cashStart}
          onChange={(e) => onChange({ ...settings, cashStart: Number(e.target.value) })}
        />
      </label>
      <label>
        Turn Timer (seconds, empty = off)
        <input
          type="number"
          min={5}
          max={60}
          value={settings.turnTimeLimitSec ?? ''}
          onChange={(e) => onChange({ ...settings, turnTimeLimitSec: e.target.value ? Number(e.target.value) : null })}
        />
      </label>
      <label>
        Power Tune Rate (steps/sec)
        <input
          type="range"
          min={2}
          max={40}
          value={settings.powerAdjustHz}
          onChange={(e) => onChange({ ...settings, powerAdjustHz: Number(e.target.value) })}
        />
        <span>{settings.powerAdjustHz}</span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.retroPalette}
          onChange={(e) => onChange({ ...settings, retroPalette: e.target.checked })}
        />
        Retro Palette
      </label>
      <div className="row">
        <button onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
