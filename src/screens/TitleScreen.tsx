import { useEffect, useRef } from 'react';
import { generateTerrain } from '../engine/terrain/TerrainGenerator';
import { drawSky, drawTerrain } from '../utils/pixelArt';
import type { TerrainPreset } from '../types/game';

interface TitleScreenProps {
  onStart: () => void;
  onSettings: () => void;
  onLoad: () => void;
}

export function TitleScreen({ onStart, onSettings, onLoad }: TitleScreenProps): JSX.Element {
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

    let frame = 0;
    let terrain = generateTerrain(720, 420, 'random');

    let raf = 0;
    const loop = () => {
      frame += 1;
      if (frame % 160 === 0) {
        const presets: TerrainPreset[] = ['rolling', 'canyon', 'islands'];
        terrain = generateTerrain(720, 420, presets[Math.floor(Math.random() * presets.length)]);
      }
      drawSky(ctx, 720, 420);
      drawTerrain(ctx, terrain);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="screen title-screen">
      <canvas ref={canvasRef} className="title-canvas" />
      <div className="title-overlay panel">
        <h1>Scorched Earth 2000</h1>
        <p className="subtitle">The Mother Of All Games</p>
        <button onClick={onStart}>Create Game</button>
        <button onClick={onSettings}>Game Options</button>
        <button onClick={onLoad}>Load Profile</button>
        <button onClick={onStart}>Join Game</button>
      </div>
    </div>
  );
}
