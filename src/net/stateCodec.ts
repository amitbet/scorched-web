import type { TerrainState } from '../types/game';
import type { TerrainPayload } from './protocol';

function bytesToBase64(input: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < input.length; i += chunkSize) {
    const chunk = input.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(input: string): Uint8Array {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function encodeTerrain(terrain: TerrainState): TerrainPayload {
  return {
    width: terrain.width,
    height: terrain.height,
    revision: terrain.revision,
    heights: terrain.heights,
    maskB64: bytesToBase64(terrain.mask),
    colorIndicesB64: terrain.colorIndices ? bytesToBase64(terrain.colorIndices) : undefined,
    colorPalette: terrain.colorPalette,
  };
}

export function decodeTerrain(payload: TerrainPayload): TerrainState {
  return {
    width: payload.width,
    height: payload.height,
    revision: payload.revision,
    heights: payload.heights,
    mask: base64ToBytes(payload.maskB64),
    colorIndices: payload.colorIndicesB64 ? base64ToBytes(payload.colorIndicesB64) : undefined,
    colorPalette: payload.colorPalette,
  };
}
