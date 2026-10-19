// Pure engine, no React. Grid -> nets (union-find) -> tick simulation.
// Rules: wires/crossings are zero-delay (merged into nets); every gate and flip-flop has a 1-tick delay.
// Directions: 0=N 1=E 2=S 3=W. A logic block outputs on side r (default E) and reads its other sides.
// A wire has a side mask m (bit per side, default 15 = all). Two wires connect only if both facing sides are open.
export type Kind = 'WIRE' | 'CROSS' | 'LEVER' | 'BUTTON' | 'CLOCK' | 'LAMP' | 'BUF' | 'NOT' | 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR' | 'DFF'
export interface Cell { t: Kind; r?: number; m?: number; p?: number; on?: boolean; fixed?: boolean }
export type Cells = Record<string, Cell>
export const GATES: Kind[] = ['BUF', 'NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR']
export const LOGIC: Kind[] = [...GATES, 'DFF']
export const SRC: Kind[] = ['LEVER', 'BUTTON', 'CLOCK']
export const KINDS: Kind[] = ['WIRE', 'CROSS', ...SRC, 'LAMP', ...LOGIC]
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]
export const key = (x: number, y: number) => `${x},${y}`
export const xy = (k: string) => k.split(',').map(Number) as [number, number]
export const nbKey = (k: string, s: number) => { const [x, y] = xy(k); return key(x + DIRS[s][0], y + DIRS[s][1]) }
const isNet = (t: Kind) => t === 'WIRE' || t === 'CROSS'

export class Sim {
  cells: Cells
  id = new Map<string, number>()
  val: number[] = []
  out = new Map<string, number>()
  prev = new Map<string, number>()
  pressed = new Set<string>()
  logic: string[] = []
  srcs: string[] = []
  tick = 0

  constructor(cells: Cells) {
    this.cells = cells
    let n = 0
    for (const k in cells) {
      const t = cells[k].t
      if (t === 'WIRE') this.id.set(k, n++)
      else if (t === 'CROSS') { this.id.set(k + ':h', n++); this.id.set(k + ':v', n++) }
      else if (LOGIC.includes(t)) this.logic.push(k)
      else if (SRC.includes(t)) this.srcs.push(k)
    }
    const p = Array.from({ length: n }, (_, i) => i)
    const find = (a: number): number => (p[a] === a ? a : (p[a] = find(p[a])))
    for (const k in cells) {
      if (!isNet(cells[k].t)) continue
      for (let s = 0; s < 4; s++) {
        const a = this.side(k, s), nk = nbKey(k, s), c2 = cells[nk]
        if (a === undefined || !c2 || !isNet(c2.t)) continue
        const b = this.side(nk, (s + 2) % 4)
        if (b !== undefined) p[find(a)] = find(b)
      }
    }
    for (const [name, i] of this.id) this.id.set(name, find(i))
    this.val = new Array(n).fill(0)
  }

  // Net node touching side s of net-cell k (undefined if that side is closed).
  private side(k: string, s: number): number | undefined {
    const c = this.cells[k]
    if (c.t === 'WIRE') return ((c.m ?? 15) >> s) & 1 ? this.id.get(k) : undefined
    return this.id.get(k + (s % 2 ? ':h' : ':v'))
  }

  // Value seen by block k from its side s (null = nothing connected).
  private read(k: string, s: number): number | null {
    const nk = nbKey(k, s), c = this.cells[nk], b = (s + 2) % 4
    if (!c) return null
    if (isNet(c.t)) { const n = this.side(nk, b); return n === undefined ? null : this.val[n] }
    if (SRC.includes(c.t)) return this.srcOn(nk) ? 1 : 0
    if (LOGIC.includes(c.t)) return (c.r ?? 1) === b ? (this.out.get(nk) ?? 0) : null
    return null
  }

  private drive(k: string, s: number) {
    const nk = nbKey(k, s), c = this.cells[nk]
    if (!c || !isNet(c.t)) return
    const n = this.side(nk, (s + 2) % 4)
    if (n !== undefined) this.val[n] = 1
  }

  srcOn(k: string) {
    const c = this.cells[k]
    if (!c) return false
    if (c.t === 'LEVER') return !!c.on
    if (c.t === 'BUTTON') return this.pressed.has(k)
    return Math.floor(this.tick / (c.p ?? 4)) % 2 === 1
  }

  step() {
    const nx = new Map<string, number>()
    for (const k of this.logic) {
      const c = this.cells[k], r = c.r ?? 1, ins: number[] = []
      for (let s = 0; s < 4; s++) if (s !== r) { const v = this.read(k, s); if (v !== null) ins.push(v) }
      if (c.t === 'DFF') {
        const clk = this.read(k, (r + 1) % 4) === 1 ? 1 : 0
        let q = this.out.get(k) ?? 0
        if (clk && !(this.prev.get(k) ?? 0)) q = this.read(k, (r + 2) % 4) ?? 0
        this.prev.set(k, clk); nx.set(k, q); continue
      }
      const any = ins.some(Boolean), all = ins.length > 0 && ins.every(Boolean), par = ins.reduce((a, b) => a ^ b, 0) === 1
      const base = c.t === 'AND' || c.t === 'NAND' ? all : c.t === 'XOR' || c.t === 'XNOR' ? par : any
      const inv = c.t === 'NOT' || c.t === 'NAND' || c.t === 'NOR' || c.t === 'XNOR'
      nx.set(k, ins.length ? +(inv ? !base : base) : 0)
    }
    this.out = nx
    this.val.fill(0)
    for (const k of this.srcs) if (this.srcOn(k)) for (let s = 0; s < 4; s++) this.drive(k, s)
    for (const k of this.logic) if (this.out.get(k)) this.drive(k, this.cells[k].r ?? 1)
    this.tick++
  }

  settle(n = 40) { for (let i = 0; i < n; i++) this.step() }
  on(name: string) { const i = this.id.get(name); return i !== undefined && this.val[i] === 1 }
  lit(k: string) { return [0, 1, 2, 3].some((s) => this.read(k, s) === 1) }
}
