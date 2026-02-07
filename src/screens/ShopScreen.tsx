import { useMemo, useState } from 'react';
import type { PlayerState } from '../types/game';
import { WEAPONS } from '../game/WeaponCatalog';

interface ShopScreenProps {
  players: PlayerState[];
  currentIndex: number;
  onBuy: (playerId: string, weaponId: string) => void;
  onSell: (playerId: string, weaponId: string) => void;
  onNext: () => void;
  onDone: () => void;
}

export function ShopScreen({ players, currentIndex, onBuy, onSell, onNext, onDone }: ShopScreenProps): JSX.Element {
  const player = players[currentIndex];
  const isLast = currentIndex === players.length - 1;
  const [category, setCategory] = useState<'weapons' | 'earthworks' | 'misc'>('weapons');
  const filtered = useMemo(() => WEAPONS.filter((weapon) => weapon.category === category), [category]);

  return (
    <div className="screen panel shop-screen">
      <h2>Armory</h2>
      <p>Shopper: {player.config.name} | Cash: ${player.cash}</p>
      <div className="row">
        <button onClick={() => setCategory('weapons')} disabled={category === 'weapons'}>Weapons</button>
        <button onClick={() => setCategory('earthworks')} disabled={category === 'earthworks'}>Earthworks</button>
        <button onClick={() => setCategory('misc')} disabled={category === 'misc'}>Misc</button>
      </div>
      <div className="shop-grid">
        {filtered.map((weapon) => {
          const qty = player.inventory[weapon.id] ?? 0;
          return (
            <div className="weapon-row" key={weapon.id}>
              <div>
                <strong>{weapon.name}</strong>
                <div className="weapon-meta">
                  ${weapon.packPrice}/{weapon.packQty} | Dmg {weapon.damage} | R {weapon.blastRadius}
                </div>
              </div>
              <div className="weapon-controls">
                <span>Owned: {qty}</span>
                <button onClick={() => onBuy(player.config.id, weapon.id)}>Buy Pack</button>
                <button onClick={() => onSell(player.config.id, weapon.id)} disabled={qty < weapon.packQty}>Sell Pack</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row">
        {!isLast && <button onClick={onNext}>Next Player</button>}
        {isLast && <button onClick={onDone}>Start Battle</button>}
      </div>
    </div>
  );
}
