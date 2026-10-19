import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { DIRS, GATES, KINDS, Sim, key, nbKey, xy } from './core/sim'
import type { Cell, Cells, Kind } from './core/sim'
import { LEVELS } from './campaign/levels'
import type { Level } from './campaign/levels'
import { exportWorld, importWorld } from './core/serialize'
import { load, save } from './core/storage'

type Tool = Kind | 'POINT' | 'ERASE' | 'SELECT'
interface Cam { x: number; y: number; z: number }
const BG = '#12141C', PANEL = '#1B1F2E', ON = '#FF3B5C', OFF = '#3A3F4B', CY = '#2EE6D6', AMB = '#FFC53D'
const ROTATABLE: Kind[] = [...GATES, 'DFF']
const CLK = [1, 2, 4, 8, 16, 32]
const ARROWS = ['▲', '▶', '▼', '◀']
const NAMES: Record<Kind, string> = { WIRE: 'Wire', CROSS: 'Crossing', LEVER: 'Lever', BUTTON: 'Button', CLOCK: 'Clock', LAMP: 'Lamp', BUF: 'Buffer', NOT: 'NOT', AND: 'AND', OR: 'OR', XOR: 'XOR', NAND: 'NAND', NOR: 'NOR', XNOR: 'XNOR', DFF: 'D flip-flop' }
const GROUPS: [string, Kind[]][] = [['Wiring', ['WIRE', 'CROSS']], ['Inputs', ['LEVER', 'BUTTON', 'CLOCK']], ['Output', ['LAMP']], ['Logic', ['BUF', 'NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR']], ['Memory', ['DFF']]]
const DEFAULT_BINDS: Record<string, string> = { WIRE: '1', CROSS: '2', LEVER: '3', BUTTON: '4', CLOCK: '5', LAMP: '6', BUF: '7', NOT: '8', AND: '9', OR: '0', XOR: 'e', NAND: 'n', NOR: 'm', XNOR: 'u', DFF: 'f' }
const mk = (i: number | null) => (i === null ? 'sandbox' : 'lv:' + LEVELS[i].id)
type Project = { id: string; name: string; updated: number; cells: Cells }
type Blueprint = { id: string; name: string; description?: string; cells: Cells }
function BlueprintPreview({ cells }: { cells: Cells }) {
  const entries = Object.entries(cells || {});
  if (!entries.length) return <div className="blueprint-preview empty">Empty circuit</div>
  const coords = entries.map(([k]) => xy(k)), minX = Math.min(...coords.map(v => v[0])), maxX = Math.max(...coords.map(v => v[0])), minY = Math.min(...coords.map(v => v[1])), maxY = Math.max(...coords.map(v => v[1]));
  const w = Math.max(1, maxX - minX + 1), h = Math.max(1, maxY - minY + 1);
  return <svg className="blueprint-preview" viewBox={`0 0 ${Math.max(120,w*18+20)} ${Math.max(64,h*18+20)}`} role="img" aria-label="Circuit blueprint preview"><g stroke="#30394c" strokeWidth="1">{Array.from({length:w+1},(_,i)=><path key={'x'+i} d={`M ${10+i*18} 10 V ${10+h*18}`}/>)}{Array.from({length:h+1},(_,i)=><path key={'y'+i} d={`M 10 ${10+i*18} H ${10+w*18}`}/>)}</g>{entries.map(([k,c])=>{const [x,y]=xy(k);const color=c.t==='LEVER'?'#ffc53d':c.t==='LAMP'?'#ff3b5c':c.t==='WIRE'?'#2ee6d6':'#aab5d1';return <g key={k}><rect x={12+(x-minX)*18} y={12+(y-minY)*18} width="14" height="14" rx="3" fill={color} opacity={c.t==='WIRE'?.75:.95}/>{c.t!=='WIRE'&&c.t!=='LAMP'&&<text x={19+(x-minX)*18} y={22+(y-minY)*18} textAnchor="middle" fontSize="6" fill="#12141c">{c.t.slice(0,3)}</text>}</g>})}</svg>
}
const fit = (l: Level): Cam => ({ x: l.w / 2, y: l.h / 2, z: 36 })
const seed = (l: Level | null): Cells => {
  const c: Cells = {}
  l?.levers.forEach(([x, y]) => (c[key(x, y)] = { t: 'LEVER', fixed: true }))
  l?.lamps.forEach(([x, y]) => (c[key(x, y)] = { t: 'LAMP', fixed: true }))
  return c
}

function drawCell(g: CanvasRenderingContext2D, sim: Sim, cells: Cells, k: string, c: Cell, px: number, py: number, z: number) {
  const cx = px + z / 2, cy = py + z / 2, lw = Math.max(2, z * 0.16)
  const col = (on: boolean) => (on ? ON : OFF)
  const line = (a: number, b: number, c2: number, d: number) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke() }
  g.lineCap = 'butt'
  if (c.t === 'WIRE') {
    const m = c.m ?? 15
    g.strokeStyle = g.fillStyle = col(sim.on(k)); g.lineWidth = lw
    for (let s = 0; s < 4; s++) if ((m >> s) & 1 && (m !== 15 || cells[nbKey(k, s)])) line(cx, cy, cx + DIRS[s][0] * z / 2, cy + DIRS[s][1] * z / 2)
    g.fillRect(cx - lw / 2, cy - lw / 2, lw, lw)
    if (m !== 15) { g.fillStyle = CY; g.fillRect(cx - z * .06, cy - z * .06, z * .12, z * .12) }
  } else if (c.t === 'CROSS') {
    g.lineWidth = lw; g.strokeStyle = col(sim.on(k + ':v')); line(cx, py, cx, cy - z * .28); line(cx, cy + z * .28, cx, py + z)
    g.strokeStyle = BG; g.lineWidth = lw + 4; line(px, cy, px + z, cy)
    g.strokeStyle = col(sim.on(k + ':h')); g.lineWidth = lw; line(px, cy, px + z, cy)
  } else if (c.t === 'LAMP') {
    const on = sim.lit(k)
    g.shadowColor = ON; g.shadowBlur = on ? z * .5 : 0; g.fillStyle = on ? ON : '#2A2E3B'
    g.fillRect(px + z * .2, py + z * .2, z * .6, z * .6); g.shadowBlur = 0
  } else {
    g.fillStyle = PANEL; g.fillRect(px + z * .08, py + z * .08, z * .84, z * .84)
    g.strokeStyle = c.t === 'CLOCK' ? AMB : c.t === 'LEVER' || c.t === 'BUTTON' ? '#6B7185' : CY; g.lineWidth = 2
    g.strokeRect(px + z * .08, py + z * .08, z * .84, z * .84)
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#E6E9F2'; g.font = `600 ${z * .24}px JetBrains Mono, monospace`
    if (c.t === 'LEVER' || c.t === 'BUTTON' || c.t === 'CLOCK') {
      g.fillStyle = sim.srcOn(k) ? ON : '#555B6B'; g.fillRect(px + z * .3, py + z * .3, z * .4, z * .4)
      g.fillStyle = '#E6E9F2'; if (c.t !== 'LEVER') g.fillText(c.t === 'BUTTON' ? 'BTN' : 'T' + (c.p ?? 4), cx, py + z * .84)
    } else {
      const r = c.r ?? 1
      g.fillText(c.t === 'DFF' ? 'DFF' : c.t, cx, cy)
      g.fillStyle = sim.out.get(k) ? ON : OFF; g.fillRect(cx + DIRS[r][0] * z * .4 - z * .07, cy + DIRS[r][1] * z * .4 - z * .07, z * .14, z * .14)
      if (c.t === 'DFF') { g.fillStyle = CY; g.font = `600 ${z * .2}px monospace`; g.fillText('D', cx + DIRS[(r + 2) % 4][0] * z * .3, cy + DIRS[(r + 2) % 4][1] * z * .3); g.fillText('>', cx + DIRS[(r + 1) % 4][0] * z * .3, cy + DIRS[(r + 1) % 4][1] * z * .3) }
    }
  }
}

export default function App() {
  const [view, setView] = useState<'home' | 'campaign' | 'editor'>('home')
  const [projects, setProjects] = useState<Project[]>(() => load<Project[]>('projects', [{ id: 'starter', name: 'My first circuit', updated: Date.now(), cells: {} }]))
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [blueprints, setBlueprints] = useState<Blueprint[]>(() => load<Blueprint[]>('blueprints', []))
  const [blueprintOverlay, setBlueprintOverlay] = useState(false)
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null)
  const [blueprintRotation, setBlueprintRotation] = useState(0)
  const [selectionRect, setSelectionRect] = useState<[number, number, number, number] | null>(null)
  const [li, setLi] = useState<number | null>(() => { const m = load<number | null>('mode', 0); return m !== null && !LEVELS[m] ? 0 : m })
  const level = li === null ? null : LEVELS[li]
  const [cells, setCells] = useState<Cells>(() => load(mk(li), seed(li === null ? null : LEVELS[li])))
  const cellsRef = useRef(cells)
  const set = (n: Cells) => { cellsRef.current = n; setCells(n) }
  const hist = useRef<Cells[]>([]), fut = useRef<Cells[]>([])
  const snap = () => { hist.current.push(cellsRef.current); if (hist.current.length > 100) hist.current.shift(); fut.current = [] }
  const undo = () => { const p = hist.current.pop(); if (p) { fut.current.push(cellsRef.current); set(p) } }
  const redo = () => { const n = fut.current.pop(); if (n) { hist.current.push(cellsRef.current); set(n) } }

  const [cam, setCam] = useState<Cam>(() => (li === null ? load('cam', { x: 0, y: 0, z: 36 }) : fit(LEVELS[li])))
  const [tool, setTool] = useState<Tool>('WIRE')
  const [rot, setRot] = useState(1)
  const [run, setRun] = useState(true)
  const [tps, setTps] = useState(10)
  const [msg, setMsg] = useState('')
  const [code, setCode] = useState('')
  const [hover, setHover] = useState<[number, number] | null>(null)
  const [binds, setBinds] = useState<Record<string, string>>(() => load('binds', DEFAULT_BINDS))
  const [bind, setBind] = useState<string | null>(null)
  const [solved, setSolved] = useState<string[]>(() => load('solved', []))
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [, force] = useState(0)
  const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<any>(null), space = useRef(false), held = useRef<string | null>(null), live = useRef<any>({})

  const sig = useMemo(() => Object.entries(cells).map(([k, c]) => k + c.t + (c.m ?? 15)).sort().join('|'), [cells])
  const sim = useMemo(() => new Sim(cells), [sig]) // rebuilt only when structure changes
  sim.cells = cells
  const tools: Kind[] = level ? level.toolbox : KINDS

  const go = (i: number | null) => {
    if (!activeProject) save(mk(li), cellsRef.current)
    if (activeProject) setProjects(ps => ps.map(p => p.id === activeProject ? { ...p, cells: cellsRef.current, updated: Date.now() } : p))
    setActiveProject(null); setSelectionRect(null); setSelectedBlueprint(null); setLi(i); save('mode', i); hist.current = []; fut.current = []
    set(load(mk(i), seed(i === null ? null : LEVELS[i])))
    setCam(i === null ? load('cam', { x: 0, y: 0, z: 36 }) : fit(LEVELS[i])); setTool('WIRE'); setMsg(''); setView('editor')
  }
  const leaveEditor = () => { if (activeProject) { const next = projects.map(p => p.id === activeProject ? { ...p, cells: cellsRef.current, updated: Date.now() } : p); setProjects(next); save('projects', next) } else save(mk(li), cellsRef.current); setSelectedBlueprint(null); setSelectionRect(null); setView(li === null ? 'home' : 'campaign') }
  const openProject = (p: Project) => { setSelectionRect(null); setSelectedBlueprint(null); setLi(null); setActiveProject(p.id); hist.current = []; fut.current = []; set(p.cells || {}); setCam({ x: 0, y: 0, z: 36 }); setTool('WIRE'); setMsg(''); setView('editor') }
  const createProject = () => { const name = prompt('Name your project', `Circuit ${projects.length + 1}`)?.trim(); if (!name) return; const p: Project = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, updated: Date.now(), cells: {} }; const next = [...projects, p]; setProjects(next); save('projects', next); openProject(p) }
  const selectedBlueprintCells = selectionRect ? Object.entries(cells).filter(([cellKey]) => {
    const [ax, ay, bx, by] = selectionRect
    const [x, y] = xy(cellKey)
    return x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)
  }) : []
  const saveBlueprint = () => {
    // Blueprint creation always requires an explicit selection; never silently save the whole board.
    if (!selectionRect) {
      setMsg('Choose Select area and drag around the blocks you want to reuse first.')
      return
    }
    if (!selectedBlueprintCells.length) {
      setMsg('The selected area is empty. Select an area containing logic blocks or wires.')
      return
    }
    const [ax, ay, bx, by] = selectionRect
    const minX = Math.min(ax, bx), minY = Math.min(ay, by)
    const blueprintCells: Cells = {}
    selectedBlueprintCells.forEach(([cellKey, cell]) => {
      const [x, y] = xy(cellKey)
      const copy = { ...cell }
      delete copy.fixed
      blueprintCells[key(x - minX, y - minY)] = copy
    })
    const name = prompt('Blueprint name', `Blueprint ${blueprints.length + 1}`)?.trim()
    if (!name) return
    const description = prompt('Optional description (what does this circuit pattern do?)', '')?.trim() || ''
    const b: Blueprint = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, description, cells: blueprintCells }
    const next = [...blueprints, b]
    setBlueprints(next)
    save('blueprints', next)
    setSelectionRect(null)
    setTool('WIRE')
    setMsg(`Saved ${selectedBlueprintCells.length} selected block${selectedBlueprintCells.length === 1 ? '' : 's'} as blueprint “${name}”. The rest of your circuit was left untouched.`)
  }
  const placeBlueprint = (b: Blueprint, at?: [number, number]): boolean => {
    const entries = Object.entries(b.cells || {})
    if (!entries.length) { setMsg('This blueprint is empty and cannot be placed.'); return false }
    const xs = entries.map(([k]) => xy(k)[0]), ys = entries.map(([k]) => xy(k)[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const baseX = at?.[0] ?? hover?.[0] ?? 0, baseY = at?.[1] ?? hover?.[1] ?? 0
    const normalized = entries.map(([k, c]) => {
      const [x, y] = xy(k)
      const dx = x - minX, dy = y - minY
      // Rotate the selected pattern in quarter turns around its top-left bounding box.
      const nx = blueprintRotation === 1 ? (Math.max(...ys) - minY - dy)
        : blueprintRotation === 2 ? (Math.max(...xs) - minX - dx) : blueprintRotation === 3 ? dy : dx
      const ny = blueprintRotation === 1 ? dx
        : blueprintRotation === 2 ? (Math.max(...ys) - minY - dy) : blueprintRotation === 3 ? (Math.max(...xs) - minX - dx) : dy
      return { dx: nx, dy: ny, cell: c }
    })
    const targets = normalized.map(({ dx, dy, cell }) => ({ target: key(baseX + dx, baseY + dy), cell }))
    const collision = targets.find(({ target }) => !!cellsRef.current[target])
    if (collision) {
      setMsg('Blueprint not placed: the selected area overlaps existing blocks. Choose an empty area; nothing was changed.')
      return false
    }
    snap()
    const n = { ...cellsRef.current }
    targets.forEach(({ target, cell }) => { const copy = { ...cell }; delete copy.fixed; n[target] = copy })
    set(n)
    setMsg(`Placed blueprint “${b.name}” (${targets.length} blocks).`)
    return true
  }
  const removeProject = (id: string) => { if (!confirm('Delete this project? This cannot be undone.')) return; const next = projects.filter(p => p.id !== id); setProjects(next); save('projects', next) }
  const removeBlueprint = (id: string) => { const next = blueprints.filter(b => b.id !== id); setBlueprints(next); save('blueprints', next) }
  const exportBackup = () => {
    try {
      const data: Record<string, unknown> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i)
        if (!storageKey?.startsWith('bf:')) continue
        const raw = localStorage.getItem(storageKey)
        if (raw !== null) data[storageKey] = JSON.parse(raw)
      }
      const blob = new Blob([JSON.stringify({ format: 'bitforge-backup', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `bitforge-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Backup exported successfully.')
    } catch { setMsg('Could not export a backup. Check available browser storage.') }
  }
  const importBackup = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Backup file is too large (10 MB maximum).')
      const backup = JSON.parse(await file.text())
      if (backup?.format !== 'bitforge-backup' || backup?.version !== 1 || !backup?.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) throw new Error('This is not a supported BitForge backup.')
      const entries = Object.entries(backup.data as Record<string, unknown>)
      if (entries.some(([k]) => !k.startsWith('bf:'))) throw new Error('Backup contains an invalid storage key.')
      if (!confirm('Restore this backup? It will replace BitForge data saved in this browser. Export your current data first if you want to keep it.')) return
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith('bf:')) localStorage.removeItem(k) }
      for (const [k, value] of entries) localStorage.setItem(k, JSON.stringify(value))
      window.location.reload()
    } catch (error) { setMsg(error instanceof Error ? error.message : 'Could not import this backup.') }
  }

  useEffect(() => { const t = setTimeout(() => { if (activeProject) { setProjects(ps => { const next = ps.map(p => p.id === activeProject ? { ...p, cells, updated: Date.now() } : p); save('projects', next); return next }) } else save(mk(li), cells) }, 250); return () => clearTimeout(t) }, [cells, li, activeProject])
  useEffect(() => { save('projects', projects) }, [projects])
  useEffect(() => { save('blueprints', blueprints) }, [blueprints])
  useEffect(() => { if (li === null) save('cam', cam) }, [cam, li])
  useEffect(() => save('binds', binds), [binds])
  useEffect(() => save('solved', solved), [solved])
  useEffect(() => { if (!run) return; const id = setInterval(() => { sim.step(); force((n) => n + 1) }, 1000 / tps); return () => clearInterval(id) }, [run, sim, tps])
  useEffect(() => {
    if (view !== 'editor' || !wrap.current) return
    const target = wrap.current
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }))
    ro.observe(target)
    return () => ro.disconnect()
  }, [view])

  const inb = (x: number, y: number) => !level || (x >= 0 && y >= 0 && x < level.w && y < level.h)
  const put = (x: number, y: number, t: Tool) => {
    if (!inb(x, y)) return
    const k = key(x, y), cur = cellsRef.current[k]
    if (cur?.fixed) return
    const n = { ...cellsRef.current }
    if (t === 'ERASE') { if (!cur) return; delete n[k] }
    else if (t === 'POINT' || t === 'SELECT') return
    else { const rt = ROTATABLE.includes(t); if (cur && cur.t === t && (!rt || cur.r === rot)) return; n[k] = rt ? { t, r: rot } : { t } }
    set(n)
  }
  const rotCell = (x: number, y: number) => {
    const k = key(x, y), c = cellsRef.current[k]
    if (c && !c.fixed && ROTATABLE.includes(c.t)) { snap(); set({ ...cellsRef.current, [k]: { ...c, r: ((c.r ?? 1) + 1) % 4 } }) }
  }
  const walk = (x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => void) => {
    let x = x0, y = y0; f(x, y)
    while (x !== x1 || y !== y1) { x += Math.sign(x1 - x); y += Math.sign(y1 - y); f(x, y) }
  }
  const world = (sx: number, sy: number): [number, number] => [(sx - size.w / 2) / cam.z + cam.x, (sy - size.h / 2) / cam.z + cam.y]
  const evPos = (e: ReactPointerEvent | ReactWheelEvent): [number, number] => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }

  const pointAt = (x: number, y: number, shift: boolean, wx: number, wy: number) => {
    const k = key(x, y), c = cellsRef.current[k]
    if (!c) return
    if (c.t === 'LEVER') { snap(); set({ ...cellsRef.current, [k]: { ...c, on: !c.on } }) }
    else if (c.t === 'BUTTON') { sim.pressed.add(k); held.current = k }
    else if (c.t === 'CLOCK') { snap(); set({ ...cellsRef.current, [k]: { ...c, p: CLK[(CLK.indexOf(c.p ?? 4) + 1) % CLK.length] } }) }
    else if (c.t === 'WIRE') {
      snap(); const m = c.m ?? 15, fx = wx - x - .5, fy = wy - y - .5
      const s = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 1 : 3) : fy > 0 ? 2 : 0
      const nm = m ^ (1 << s) // Toggle the side nearest the pointer; Shift-click uses the same predictable side toggle.
      set({ ...cellsRef.current, [k]: { ...c, m: nm } })
    } else rotCell(x, y)
  }

  const onDown = (e: ReactPointerEvent) => {
    cv.current!.setPointerCapture(e.pointerId)
    const [sx, sy] = evPos(e), [wx, wy] = world(sx, sy), x = Math.floor(wx), y = Math.floor(wy)
    if (selectedBlueprint && e.button === 0) { if (placeBlueprint(selectedBlueprint, [x, y])) setSelectedBlueprint(null); return }
    if (tool === 'SELECT' && e.button === 0) { setSelectionRect([x, y, x, y]); drag.current = { m: 'select', x, y }; return }
    if (e.button === 1 || space.current) { drag.current = { m: 'pan', sx, sy, cam0: cam }; return }
    if (e.button === 2) { snap(); put(x, y, 'ERASE'); drag.current = { m: 'erase', x, y }; return }
    if (tool === 'POINT') { pointAt(x, y, e.shiftKey, wx, wy); return }
    snap(); put(x, y, tool); drag.current = { m: 'paint', x, y }
  }
  const onMove = (e: ReactPointerEvent) => {
    const [sx, sy] = evPos(e), [wx, wy] = world(sx, sy), x = Math.floor(wx), y = Math.floor(wy)
    setHover([x, y])
    const d = drag.current
    if (!d) return
    if (d.m === 'select') { setSelectionRect([d.x, d.y, x, y]); return }
    if (d.m === 'pan') setCam({ ...d.cam0, x: d.cam0.x - (sx - d.sx) / cam.z, y: d.cam0.y - (sy - d.sy) / cam.z })
    else { walk(d.x, d.y, x, y, (a, b) => put(a, b, d.m === 'erase' ? 'ERASE' : tool)); d.x = x; d.y = y }
  }
  const onUp = () => { drag.current = null; if (held.current) { sim.pressed.delete(held.current); held.current = null } }
  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault()
    const [sx, sy] = evPos(e), [wx, wy] = world(sx, sy), z = Math.min(96, Math.max(8, cam.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
    setCam({ x: wx - (sx - size.w / 2) / z, y: wy - (sy - size.h / 2) / z, z })
  }

  live.current = { tool, tools, binds, bind, hover, cam, rot, blueprintActive: !!selectedBlueprint, undo, redo, rotCell, setRot, setTool, setBind, setBinds, setRun, setCam, step: () => { sim.step(); force((n) => n + 1) }, del: (x: number, y: number) => { snap(); put(x, y, 'ERASE') } }
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      const L = live.current, tg = e.target as HTMLElement
      if (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT') return
      const kk = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (L.bind) { if (kk.length === 1) { const nb = { ...L.binds }; for (const t in nb) if (nb[t] === kk) delete nb[t]; nb[L.bind] = kk; L.setBinds(nb) } L.setBind(null); e.preventDefault(); return }
      if (e.ctrlKey || e.metaKey) { if (kk === 'z') { e.shiftKey ? L.redo() : L.undo(); e.preventDefault() } else if (kk === 'y') L.redo(); return }
      if (e.altKey) return
      if (kk === ' ') { space.current = true; e.preventDefault(); return }
      if (kk === 'Enter') { L.setRun((r: boolean) => !r); return }
      if (kk === '.') { L.step(); return }
      if (kk === 'q') { L.setTool('POINT'); return }
      if (kk === 'z') { L.setTool('ERASE'); return }
      if (kk === 'r') { if (L.blueprintActive) { setBlueprintRotation((v) => (v + 1) % 4); return } if (L.tool === 'POINT' && L.hover) L.rotCell(L.hover[0], L.hover[1]); else L.setRot((v: number) => (v + 1) % 4); return }
      if ((kk === 'Delete' || kk === 'Backspace') && L.hover) { L.del(L.hover[0], L.hover[1]); return }
      const a = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].indexOf(kk)
      if (a >= 0) { L.setCam({ ...L.cam, x: L.cam.x + DIRS[a][0], y: L.cam.y + DIRS[a][1] }); e.preventDefault(); return }
      const t = (Object.keys(L.binds) as Kind[]).find((n) => L.binds[n] === kk)
      if (t && L.tools.includes(t)) L.setTool(t)
    }
    const up = (e: KeyboardEvent) => { if (e.key === ' ') space.current = false }
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    const c = cv.current
    if (!c || !size.w || !size.h) return
    const g = c.getContext('2d')
    if (!g) return
    const { w, h } = size
    c.width = w; c.height = h
    const z = cam.z, ox = w / 2 - cam.x * z, oy = h / 2 - cam.y * z
    const x0 = Math.floor(-ox / z), x1 = Math.ceil((w - ox) / z), y0 = Math.floor(-oy / z), y1 = Math.ceil((h - oy) / z)
    g.fillStyle = BG; g.fillRect(0, 0, w, h)
    if (z >= 14) {
      g.strokeStyle = '#1C2030'; g.lineWidth = 1; g.beginPath()
      for (let x = x0; x <= x1; x++) { const p = Math.round(ox + x * z) + .5; g.moveTo(p, 0); g.lineTo(p, h) }
      for (let y = y0; y <= y1; y++) { const p = Math.round(oy + y * z) + .5; g.moveTo(0, p); g.lineTo(w, p) }
      g.stroke()
    }
    if (level) { g.strokeStyle = CY; g.lineWidth = 2; g.strokeRect(ox, oy, level.w * z, level.h * z) }
    for (const k in cells) { const [x, y] = xy(k); if (x >= x0 - 1 && x <= x1 && y >= y0 - 1 && y <= y1) drawCell(g, sim, cells, k, cells[k], ox + x * z, oy + y * z, z) }
    if (hover) {
      const px = ox + hover[0] * z, py = oy + hover[1] * z
      if (tool !== 'POINT' && tool !== 'ERASE' && tool !== 'SELECT') { g.globalAlpha = .5; drawCell(g, sim, cells, key(hover[0], hover[1]), { t: tool, r: rot }, px, py, z); g.globalAlpha = 1 }
      g.strokeStyle = tool === 'ERASE' ? ON : CY; g.lineWidth = 2; g.strokeRect(px + 1, py + 1, z - 2, z - 2)
    }
    if (selectionRect) {
      const [ax, ay, bx, by] = selectionRect
      const sx = ox + Math.min(ax, bx) * z, sy = oy + Math.min(ay, by) * z
      const sw = (Math.abs(bx - ax) + 1) * z, sh = (Math.abs(by - ay) + 1) * z
      g.fillStyle = 'rgba(46,230,214,.10)'; g.fillRect(sx, sy, sw, sh)
      g.strokeStyle = CY; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(sx, sy, sw, sh); g.setLineDash([])
    }
    if (!level && !Object.keys(cells).length) {
      g.fillStyle = '#6B7185'; g.textAlign = 'center'; g.font = '14px JetBrains Mono, monospace'
      g.fillText('Pick a block (keys 1-0), then click or drag to place it.', w / 2, h / 2 - 10)
      g.fillText('Space or middle-drag pans, wheel zooms, right-click erases.', w / 2, h / 2 + 12)
    }
  })

  const test = () => {
    if (!level) return
    let ok = true
    for (let m = 0; m < 1 << level.levers.length && ok; m++) {
      const bits = level.levers.map((_, i) => (m >> i) & 1), c: Cells = { ...cells }
      level.levers.forEach(([x, y], i) => (c[key(x, y)] = { t: 'LEVER', fixed: true, on: !!bits[i] }))
      const s = new Sim(c); s.settle(40)
      ok = level.lamps.map(([x, y]) => (s.lit(key(x, y)) ? 1 : 0)).join() === level.expect(bits).join()
    }
    const gates = Object.values(cells).filter((c) => !c.fixed && c.t !== 'WIRE' && c.t !== 'CROSS').length
    setMsg(ok ? `Works! ${gates} gates (par ${level.par}${gates <= level.par ? ', perfect' : ''}).` : 'Not yet: some lever combination lights the lamps wrongly.')
    if (ok) setSolved((s) => (s.includes(level.id) ? s : [...s, level.id]))
  }
  const rows = level ? Array.from({ length: 1 << level.levers.length }, (_, m) => { const b = level.levers.map((_, i) => (m >> i) & 1); return [b, level.expect(b)] }) : []
  const hc = hover ? cells[key(hover[0], hover[1])] : undefined
  const info = hover ? `${hover[0]}, ${hover[1]}` + (hc ? `  ${NAMES[hc.t]}` + (hc.t === 'WIRE' ? ` (sides ${[0, 1, 2, 3].filter((s) => ((hc.m ?? 15) >> s) & 1).map((s) => 'NESW'[s]).join('') || 'none'})` : '') : '') : ''
  const messageIsSuccess = msg.startsWith('Saved ') || msg.startsWith('Placed ') || msg.startsWith('Circuit imported') || msg.startsWith('Area selection cleared.')

  if (view === 'campaign') return <div className="home campaign-home">
    <nav className="home-nav"><button className="back-link" onClick={() => setView('home')}>← Home</button><div className="brand"><span className="brand-mark">B</span> BitForge</div><span className="nav-tag">CAMPAIGN MODE</span><span className="local-save-pill"><span className="status-dot"/> Progress saved locally</span></nav>
    <section className="campaign-hero"><p className="eyebrow">LEARN BY BUILDING</p><h1>Think in <span>circuits.</span></h1><p>One challenge at a time. Build the logic, test every input combination, and unlock the next idea.</p><div className="campaign-progress"><strong>{solved.length} / {LEVELS.length}</strong><span>challenges completed</span><div className="progress-track"><i style={{width: `${Math.min(100, solved.length / Math.max(1, LEVELS.length) * 100)}%`}}/></div></div></section>
    <section className="home-section campaign-levels-section"><div className="section-head"><div><p className="eyebrow">YOUR LEARNING PATH</p><h2>Choose a challenge</h2></div><span className="campaign-count">{LEVELS.length} CHALLENGES</span></div><div className="campaign-level-grid">{LEVELS.map((l, i) => <article className="campaign-level-card" key={l.id}><div className="level-card-top"><span className="level-number">{String(i + 1).padStart(2, '0')}</span><span className={solved.includes(l.id) ? 'level-status complete' : 'level-status'}>{solved.includes(l.id) ? '✓ COMPLETED' : 'CHALLENGE'}</span></div><h3>{l.title}</h3><p>{l.brief}</p><div className="level-card-meta"><span>{l.levers.length} input{l.levers.length === 1 ? '' : 's'}</span><span>Par {l.par}</span></div><button className="primary" onClick={() => go(i)}>{solved.includes(l.id) ? 'Play again' : 'Start challenge'} <span>↗</span></button></article>)}</div></section>
    <footer className="home-footer"><span>BITFORGE <b>●</b> CAMPAIGN</span><button onClick={() => setView('home')}>Back to workspace</button><span>PROGRESS SAVED ON THIS DEVICE.</span></footer>
  </div>;

  if (view === 'home') return <div className="home"><nav className="home-nav"><div className="brand"><span className="brand-mark">B</span> BitForge</div><span className="nav-tag">DIGITAL LOGIC STUDIO</span><span className="local-save-pill"><span className="status-dot"/> Saves on this device</span><button className="primary" onClick={createProject}>＋ New project</button></nav><section className="hero"><div className="hero-copy"><p className="eyebrow">BUILD · CONNECT · COMPUTE</p><h1>Ideas become<br/><span>circuits.</span></h1><p className="hero-desc">A playground for digital logic. Design circuits, experiment in the sandbox, master the fundamentals, and reuse your best designs as blueprints.</p><div className="hero-actions"><button className="primary" onClick={createProject}>＋ Create a project</button><button onClick={() => go(null)}>Open sandbox <span>↗</span></button></div><div className="hero-stats"><div><strong>{projects.length}</strong><small>PROJECTS</small></div><div><strong>{blueprints.length}</strong><small>BLUEPRINTS</small></div><div><strong>{LEVELS.length}</strong><small>CAMPAIGN LEVELS</small></div></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="circuit-card"><div className="card-top"><i/><i/><i/><span>LIVE CIRCUIT / 001</span></div><svg viewBox="0 0 420 280" role="img"><g className="trace"><path d="M35 70 H115 V130 H180 M180 130 V70 H245 M180 130 V200 H245 M245 70 H320 V130 H380 M245 200 H320 V160 H380"/><path d="M35 210 H90 V160 H135"/></g><g className="nodes"><rect x="15" y="50" width="40" height="40" rx="8"/><rect x="135" y="110" width="90" height="40" rx="8"/><rect x="245" y="50" width="45" height="40" rx="8"/><rect x="245" y="180" width="45" height="40" rx="8"/><circle cx="380" cy="130" r="13"/><circle cx="380" cy="160" r="7"/></g><g className="labels"><text x="35" y="75">IN</text><text x="180" y="135">XOR</text><text x="267" y="75">NOT</text><text x="267" y="205">AND</text></g></svg><div className="card-bottom"><span><b/> SIMULATION READY</span><span>10 TICKS / SEC</span></div></div><div className="float-chip chip-a">01 <span>LOGIC</span></div><div className="float-chip chip-b">0101 <span> SIGNAL</span></div></div></section><section className="home-section"><div className="section-head"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Pick up where you left off.</h2></div><button onClick={createProject}>＋ New project</button></div><div className="project-grid">{projects.map((p, i) => <article className="project-card" key={p.id}><div className="project-visual"><span className="project-index">PROJECT / {String(i + 1).padStart(2, '0')}</span><div className="mini-circuit"><span/><i/><b/><em/></div><button className="delete-project" title="Delete project" onClick={() => removeProject(p.id)}>×</button></div><div className="project-meta"><div><h3>{p.name}</h3><p>{Object.keys(p.cells || {}).length} blocks · Edited {new Date(p.updated).toLocaleDateString()}</p></div><button className="open-project" onClick={() => openProject(p)}>Open ↗</button></div></article>)}<button className="new-project-card" onClick={createProject}><span>＋</span><strong>Start something new</strong><small>Every circuit gets its own workspace</small></button></div></section><section className="home-section split-section"><article className="feature-card campaign-card"><div className="feature-icon">◈</div><p className="eyebrow">LEARN BY BUILDING</p><h2>Campaign</h2><p>Short challenges that turn logic gates into intuition. Solve each level and track your progress.</p><button className="primary" onClick={() => setView('campaign')}>Explore campaign <span>↗</span></button><div className="feature-decoration">AND · XOR · NOT</div></article><article className="feature-card blueprint-card"><div className="feature-icon">▦</div><p className="eyebrow">BUILD ON YOUR BEST IDEAS</p><h2>Blueprint library <span>{blueprints.length}</span></h2><p>Save reusable circuit patterns and bring them into any project whenever you need them.</p><div className="blueprint-list">{blueprints.length ? blueprints.slice(0, 3).map(b => <div className="blueprint-row" key={b.id}><BlueprintPreview cells={b.cells}/><section><strong>{b.name}</strong><small>{b.description || `${Object.keys(b.cells).length} blocks`}</small></section><button onClick={() => removeBlueprint(b.id)} title="Delete blueprint">×</button></div>) : <small className="empty-note">Your saved blueprints will appear here. Open a project, select a region, and save it to get started.</small>}</div></article></section><footer className="home-footer"><span>BITFORGE <b>●</b> DIGITAL LOGIC STUDIO <small className="footer-local-note">Your work stays in this browser.</small></span><div className="backup-actions"><button onClick={exportBackup} title="Download a backup of projects, blueprints, and progress">Export backup ↓</button><label className="backup-import">Import backup ↑<input type="file" accept="application/json,.json" onChange={e => { void importBackup(e.target.files?.[0]); e.currentTarget.value = '' }} /></label></div><span>DESIGNED TO THINK DIFFERENTLY.</span></footer></div>;

  return (
    <div className="app">
      <header><button className="home-button" onClick={leaveEditor}>{level ? '← Campaign' : '← Home'}</button><h1>BitForge</h1><span className="sub">{level ? level.title : activeProject ? projects.find(p => p.id === activeProject)?.name || 'Project' : 'Sandbox (infinite)'}</span><span className="gap" /><span className="info">{info}</span></header>
      <aside>
        {level ? <>
          <h2>Campaign challenge</h2>
          <button onClick={() => { save(mk(li), cellsRef.current); setSelectionRect(null); setSelectedBlueprint(null); setView('campaign') }}>← All challenges</button>
          <p className="brief">{level.brief}</p>
          <table><thead><tr><th>In</th><th>Out</th></tr></thead><tbody>{rows.map(([i, o], n) => <tr key={n}><td>{i.join(' ')}</td><td>{o.join(' ')}</td></tr>)}</tbody></table>
          <button className="go" onClick={test}>Check circuit</button>
          <p className={msg.startsWith('Works') ? 'ok' : 'bad'}>{msg}</p>
        </> : <h2>Sandbox tools</h2>}
        {GROUPS.map(([name, list]) => { const l = list.filter((t) => tools.includes(t)); return l.length ? <div key={name}><h2>{name}</h2>
          {l.map((t) => <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)} onDoubleClick={() => setBind(t)}>{NAMES[t]}<kbd>{bind === t ? '…' : binds[t] ?? '·'}</kbd></button>)}</div> : null })}
        <p className="hint">Double-click a block to rebind its key.</p>
        {!level && <div className="share">
          <p className="hint">Blueprints save only the blocks inside your selected rectangle—not the full board.</p>
          <button onClick={saveBlueprint} disabled={!selectionRect || selectedBlueprintCells.length === 0}>Save selected area as blueprint{selectionRect ? ` (${selectedBlueprintCells.length} blocks)` : ''}</button>
          {selectionRect && <button onClick={() => { setSelectionRect(null); setMsg('Area selection cleared.') }}>Clear area selection</button>}
          {blueprints.length > 0 && <button className="primary" onClick={() => setBlueprintOverlay(true)}>▦ Browse blueprints ({blueprints.length})</button>}
          <button onClick={async () => { const c = await exportWorld(cells); setCode(c); navigator.clipboard?.writeText(c) }}>Export code</button>
          <button onClick={async () => { try { const imported = await importWorld(code); snap(); set(imported); setMsg('Circuit imported successfully.') } catch (e) { setMsg((e as Error).message) } }}>Import code</button>
          <button onClick={() => { if (confirm('Clear the whole board?')) { snap(); set({}) } }}>Clear board</button>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a BF1-W code" />
          <p className={messageIsSuccess ? 'ok' : 'bad'}>{msg}</p>
        </div>}
      </aside>
      <main>
        <div className="bar">
          {!level && !activeProject && <button onClick={createProject}>＋ New project</button>}
          <button className={tool === 'POINT' ? 'on' : ''} onClick={() => setTool('POINT')}>Pointer<kbd>q</kbd></button>
          {!level && <button className={tool === 'SELECT' ? 'on' : ''} onClick={() => { setTool('SELECT'); setSelectionRect(null); setSelectedBlueprint(null); setMsg('Drag a rectangle around only the logic blocks and wires you want to reuse.') }}>Select area</button>}
          <button className={tool === 'ERASE' ? 'on' : ''} onClick={() => setTool('ERASE')}>Erase<kbd>z</kbd></button>
          <button onClick={() => setRot((r) => (r + 1) % 4)}>Rotate {ARROWS[rot]}<kbd>r</kbd></button>
          <span className="gap" />
          <button onClick={undo}>Undo</button><button onClick={redo}>Redo</button>
          <button onClick={() => setRun(!run)}>{run ? 'Pause' : 'Play'}<kbd>⏎</kbd></button>
          <button onClick={() => { sim.step(); force((n) => n + 1) }}>Step<kbd>.</kbd></button>
          <select value={tps} onChange={(e) => setTps(+e.target.value)}>{[2, 5, 10, 20, 50].map((n) => <option key={n} value={n}>{n} ticks/s</option>)}</select>
          <button onClick={() => setCam(level ? fit(level) : { x: 0, y: 0, z: 36 })}>Center</button>
        </div>
        <div className="wrap" ref={wrap}>
          <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />
        </div>
      </main>
      {selectedBlueprint && <div className="placement-hud"><div><strong>Place: {selectedBlueprint.name}</strong><span>{selectedBlueprint.description || 'Click anywhere on the canvas to place this circuit.'}</span></div><BlueprintPreview cells={selectedBlueprint.cells}/><div className="placement-controls"><button onClick={() => setBlueprintRotation(v => (v + 1) % 4)}>Rotate {['0°','90°','180°','270°'][blueprintRotation]} ↻</button><button onClick={() => setSelectedBlueprint(null)}>Cancel</button></div></div>}
      {blueprintOverlay && <div className="modal-backdrop" onClick={() => setBlueprintOverlay(false)}><section className="blueprint-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setBlueprintOverlay(false)}>×</button><p className="eyebrow">REUSABLE CIRCUITS</p><h2>Blueprint library</h2><p className="auth-note">Choose a reusable circuit pattern, then click the canvas where its top-left corner should go. Existing blocks are never overwritten. Blueprints contain only blocks inside an explicitly selected rectangle. Close this panel, choose Select area, drag around the exact logic and wires you want, then save that selection. The rest of your build is never included automatically.</p><div className="blueprint-library-actions"><button onClick={() => { const payload = { format: 'bitforge-blueprints', version: 1, blueprints }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bitforge-blueprints.json'; a.click(); URL.revokeObjectURL(url); setMsg('Blueprint library exported.') }}>Export library ↓</button><label className="backup-import">Import blueprints ↑<input type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.currentTarget.value = ''; if (!file) return; try { const data = JSON.parse(await file.text()); const incoming = Array.isArray(data) ? data : data.blueprints; if (!Array.isArray(incoming)) throw new Error('This file does not contain a blueprint library.'); const valid = incoming.filter((b: any) => b && typeof b.name === 'string' && b.cells && typeof b.cells === 'object' && Object.values(b.cells).every((c: any) => c && KINDS.includes(c.t))); const merged = [...blueprints, ...valid.map((b: any) => ({ ...b, id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}` }))]; setBlueprints(merged); save('blueprints', merged); setMsg(`Imported ${valid.length} blueprint${valid.length === 1 ? '' : 's'}.`); } catch (err) { setMsg((err as Error).message || 'Could not import this file.'); } }} /></label></div><div className="blueprint-modal-grid">{blueprints.map(b => <article className="blueprint-tile" key={b.id}><BlueprintPreview cells={b.cells}/><h3>{b.name}</h3><p>{b.description || 'No description provided.'}</p><small>{Object.keys(b.cells).length} blocks</small><button className="primary" onClick={() => { setSelectedBlueprint(b); setBlueprintRotation(0); setBlueprintOverlay(false); setTool('POINT'); setMsg(`Selected ${b.name}. Click the canvas to place it.`) }}>Place blueprint ↗</button></article>)}</div></section></div>}
    </div>
  )
}
