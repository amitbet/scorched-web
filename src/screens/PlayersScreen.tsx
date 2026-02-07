import type { PlayerConfig } from '../types/game';

interface PlayersScreenProps {
  players: PlayerConfig[];
  onChange: (players: PlayerConfig[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function PlayersScreen({ players, onChange, onBack, onNext }: PlayersScreenProps): JSX.Element {
  const update = (idx: number, partial: Partial<PlayerConfig>) => {
    const next = players.map((p, i) => (i === idx ? { ...p, ...partial } : p));
    onChange(next);
  };

  const active = players.filter((p) => p.enabled);
  const names = new Set(active.map((p) => p.name.trim().toLowerCase()));
  const valid = active.length >= 2 && names.size === active.length && active.every((p) => p.name.trim().length > 0);

  return (
    <div className="screen panel players-screen">
      <h2>Players</h2>
      <div className="grid">
        {players.map((player, idx) => (
          <div className="player-card" key={player.id}>
            <label>
              <input type="checkbox" checked={player.enabled} onChange={(e) => update(idx, { enabled: e.target.checked })} />
              Enabled
            </label>
            <label>
              Name
              <input value={player.name} onChange={(e) => update(idx, { name: e.target.value })} maxLength={16} />
            </label>
            <label>
              Type
              <select value={player.kind} onChange={(e) => update(idx, { kind: e.target.value as PlayerConfig['kind'] })}>
                <option value="human">Human</option>
                <option value="ai">AI</option>
              </select>
            </label>
            <label>
              AI
              <select value={player.aiLevel} onChange={(e) => update(idx, { aiLevel: e.target.value as PlayerConfig['aiLevel'] })}>
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>
              Color Index
              <input type="number" min={0} max={7} value={player.colorIndex} onChange={(e) => update(idx, { colorIndex: Number(e.target.value) })} />
            </label>
          </div>
        ))}
      </div>
      <div className="row">
        <button onClick={onBack}>Back</button>
        <button disabled={!valid} onClick={onNext}>Proceed To Shop</button>
      </div>
      {!valid && <p className="error">Need at least 2 enabled players with unique names.</p>}
    </div>
  );
}
