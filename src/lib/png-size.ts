// Imported by src/check/check-site.ts, which runs under Node's native type
// stripping, so this module uses only erasable TypeScript syntax.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];

/**
 * Reads a PNG's dimensions from its IHDR chunk, which the format requires to
 * come first: the 8-byte signature, the chunk length and type, then width and
 * height as big-endian uint32 at byte offsets 16 and 20. Returns undefined for
 * anything that is not a PNG.
 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  if (SIGNATURE.some((b, i) => bytes[i] !== b)) return undefined;
  if (IHDR.some((b, i) => bytes[12 + i] !== b)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
