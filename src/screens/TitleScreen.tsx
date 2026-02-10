import { useEffect, useRef } from 'react';
import { generateTerrain } from '../engine/terrain/TerrainGenerator';
import { drawSky, drawTerrain } from '../utils/pixelArt';

interface TitleScreenProps {
  onStartLocal: () => void;
  onHostLan: () => void;
  onJoinLan: () => void;
  onSettings: () => void;
}

export function TitleScreen({ onStartLocal, onHostLan, onJoinLan, onSettings }: TitleScreenProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    canvas.width = 720;
    canvas.height = 420;
    ctx.imageSmoothingEnabled = false;

    const terrain = generateTerrain(720, 420, 'random');
    drawSky(ctx, 720, 420);
    drawTerrain(ctx, terrain);
    return () => {};
  }, []);

  return (
    <div className="screen title-screen">
      <canvas ref={canvasRef} className="title-canvas" />
      <div className="title-overlay panel">
        <h1>Scorched Web</h1>
        <p className="subtitle">The Mother Of All Games</p>
        <button onClick={onStartLocal}>Create Local Game</button>
        <button onClick={onHostLan}>Host LAN Game</button>
        <button onClick={onJoinLan}>Join LAN Game</button>
        <button onClick={onSettings}>Game Options</button>
      </div>
    </div>
  );
}
