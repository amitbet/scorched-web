export interface ParsedMtnFile {
  magic: 'MT';
  marker: number;
  version: number;
  width: number;
  height: number;
  heightMinusOne: number;
  headerWords: number[];
  palette: Array<[number, number, number]>;
  columns: number[][];
  pixels: number[][];
  bytesRead: number;
  trailingBytes: number;
}

export function parseMtn(
  input: Uint8Array | ArrayBuffer | ArrayBufferView,
  options?: { skyIndex?: number },
): ParsedMtnFile;
