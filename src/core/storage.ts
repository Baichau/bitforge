// Tiny localStorage wrapper. Never throws (private mode / quota).
export const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('bf:' + k); return v ? (JSON.parse(v) as T) : d } catch { return d } }
export const save = (k: string, v: unknown) => { try { localStorage.setItem('bf:' + k, JSON.stringify(v)) } catch { /* ignore */ } }
