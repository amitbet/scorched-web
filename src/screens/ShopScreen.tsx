import { useMemo, useState } from 'react';
import type { PlayerState } from '../types/game';
import { WEAPONS } from '../game/WeaponCatalog';
import { canBuy } from '../game/Economy';
import { getWeaponIcon } from '../game/WeaponIcons';

interface ShopScreenProps {
  players: PlayerState[];
  currentIndex: number;
  onBuy: (playerId: string, weaponId: string) => void;
  onSell: (playerId: string, weaponId: string) => void;
  onNext: () => void;
  onDone: () => void;
}

export function ShopScreen({ players, currentIndex, onBuy, onSell, onNext, onDone }: ShopScreenProps): JSX.Element {
  const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(0, players.length - 1)));
  const player = players[safeIndex];
  const isLast = safeIndex === players.length - 1;
  if (!player) {
    return (
      <div className="screen panel shop-screen">
        <h2>Scorched Earth Shop</h2>
        <p>No players available for shopping.</p>
      </div>
    );
  }
  const [category, setCategory] = useState<'all' | 'weapons' | 'earthworks' | 'misc'>('all');
  const filtered = useMemo(
    () =>
      WEAPONS.filter((weapon) => weapon.id !== 'missile' && (category === 'all' || weapon.category === category)),
    [category],
  );

  return (
    <div className="screen panel shop-screen">
      <div className="shop-head">
        <h2>Scorched Earth Shop</h2>
        <p className="shop-cash">{`Shopper: ${player.config.name} | Cash: $${player.cash}`}</p>
      </div>
      <div className="shop-filters">
        <button type="button" onClick={() => setCategory('all')} disabled={category === 'all'}>All</button>
        <button type="button" onClick={() => setCategory('weapons')} disabled={category === 'weapons'}>Weapons</button>
        <button type="button" onClick={() => setCategory('earthworks')} disabled={category === 'earthworks'}>Earthworks</button>
        <button type="button" onClick={() => setCategory('misc')} disabled={category === 'misc'}>Items</button>
      </div>
      <div className="shop-grid">
        {filtered.map((weapon) => {
          const qty = player.inventory[weapon.id] ?? 0;
          const buyAllowed = canBuy(player, weapon.id);
          const sellAllowed = qty >= weapon.packQty;
          return (
            <div className="weapon-row" key={weapon.id}>
              <img className="weapon-icon" src={getWeaponIcon(weapon.id)} alt={`${weapon.name} icon`} />
              <div className="weapon-info">
                <strong>{weapon.name}</strong>
                <div className="weapon-meta">
                  ${weapon.packPrice}/{weapon.packQty} | Dmg {weapon.damage} | Radius {weapon.blastRadius}
                </div>
              </div>
              <div className="weapon-controls">
                <span>Owned: {qty}</span>
                <button
                  type="button"
                  onClick={() => onBuy(player.config.id, weapon.id)}
                  disabled={!buyAllowed}
                  title={buyAllowed ? '' : 'Not enough cash'}
                >
                  Buy
                </button>
                <button type="button" onClick={() => onSell(player.config.id, weapon.id)} disabled={!sellAllowed}>Sell Pack</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row shop-actions">
        {!isLast && <button onClick={onNext}>Next Player</button>}
        {isLast && <button onClick={onDone}>Confirm Order</button>}
      </div>
    </div>
  );
}
