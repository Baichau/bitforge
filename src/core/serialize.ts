// Share codes: BF1-W.<base64url(deflate-raw(json))>. Pure data, strictly validated on import.
// Uses the browser's CompressionStream (no dependencies). Next: CRC, blueprints + dependencies.
import { KINDS } from './sim'
import type { Cell, Cells } from './sim'

const toB64 = (b: Uint8Array) => { let s = ''; b.forEach((c) => (s += String.fromCharCode(c))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream) {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(t)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function exportWorld(cells: Cells) {
  const clean: Cells = {}
  for (const k in cells) { const { fixed, ...c } = cells[k]; void fixed; clean[k] = c }
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, cells: clean }))
  return 'BF1-W.' + toB64(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function importWorld(code: string): Promise<Cells> {
  const [prefix, body] = code.trim().split('.')
  if (prefix !== 'BF1-W' || !body) throw new Error('This is not a BitForge world code.')
  const raw = await pipe(fromB64(body), new DecompressionStream('deflate-raw'))
  if (raw.length > 8_000_000) throw new Error('Code is too large.')
  const d = JSON.parse(new TextDecoder().decode(raw))
  if (d.v !== 1 || !d.cells || typeof d.cells !== 'object') throw new Error('Unsupported code version.')
  if (Object.keys(d.cells).length > 200_000) throw new Error('Too many blocks.')
  const out: Cells = {}
  for (const [k, c] of Object.entries<any>(d.cells)) {
    if (!/^-?\d{1,6},-?\d{1,6}$/.test(k) || !KINDS.includes(c?.t)) throw new Error('Code contains invalid data.')
    const o: Cell = { t: c.t }
    if (c.on === true) o.on = true
    if (Number.isInteger(c.r) && c.r >= 0 && c.r < 4) o.r = c.r
    if (Number.isInteger(c.m) && c.m >= 0 && c.m < 16) o.m = c.m
    if (Number.isInteger(c.p) && c.p >= 1 && c.p <= 64) o.p = c.p
    out[k] = o
  }
  return out
}
