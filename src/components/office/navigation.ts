// Caminos para las personas de la oficina: una cuadrícula con los muebles como obstáculos y un
// buscador A* que rodea escritorios, mamparas y plantas. Todo en unidades del mundo 3D.

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Pt { x: number; z: number }

export class NavGrid {
  private readonly nx: number
  private readonly nz: number
  private readonly blocked: Uint8Array

  constructor(private readonly bounds: Rect, private readonly cell: number, obstacles: Rect[], margin: number) {
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / cell)
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / cell)
    this.blocked = new Uint8Array(this.nx * this.nz)
    // Cada obstáculo se infla por el "grosor" de una persona, así el camino no roza los muebles.
    for (const o of obstacles) {
      const [a, b] = this.toCell(o.x0 - margin, o.z0 - margin)
      const [c, d] = this.toCell(o.x1 + margin, o.z1 + margin)
      for (let i = Math.max(0, a); i <= Math.min(this.nx - 1, c); i++) {
        for (let j = Math.max(0, b); j <= Math.min(this.nz - 1, d); j++) this.blocked[j * this.nx + i] = 1
      }
    }
  }

  private toCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.bounds.x0) / this.cell), Math.floor((z - this.bounds.z0) / this.cell)]
  }
  private center(i: number, j: number): Pt {
    return { x: this.bounds.x0 + (i + 0.5) * this.cell, z: this.bounds.z0 + (j + 0.5) * this.cell }
  }
  private isBlocked(i: number, j: number): boolean {
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz || this.blocked[j * this.nx + i] === 1
  }

  /** Punto libre más cercano (por si el inicio o el destino cae justo sobre un mueble). */
  private nearestFree(p: Pt): [number, number] | null {
    const [ci, cj] = this.toCell(p.x, p.z)
    for (let r = 0; r < 14; r++) {
      for (let i = ci - r; i <= ci + r; i++) {
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue
          if (!this.isBlocked(i, j)) return [i, j]
        }
      }
    }
    return null
  }

  private lineClear(a: Pt, b: Pt): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.cell * 0.5))
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps
      const [i, j] = this.toCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)
      if (this.isBlocked(i, j)) return false
    }
    return true
  }

  /** Camino de `from` a `to` (null si no hay). Incluye el destino exacto como último punto. */
  findPath(from: Pt, to: Pt): Pt[] | null {
    const s = this.nearestFree(from)
    const g = this.nearestFree(to)
    if (!s || !g) return null
    const idx = (i: number, j: number) => j * this.nx + i
    const gScore = new Float32Array(this.nx * this.nz).fill(Infinity)
    const came = new Int32Array(this.nx * this.nz).fill(-1)
    const closed = new Uint8Array(this.nx * this.nz)
    const open: number[] = [idx(s[0], s[1])]
    gScore[idx(s[0], s[1])] = 0
    const h = (i: number, j: number) => Math.hypot(i - g[0], j - g[1])
    let found = false
    while (open.length) {
      let bi = 0
      for (let k = 1; k < open.length; k++) {
        const a = open[k], b = open[bi]
        if (gScore[a] + h(a % this.nx, Math.floor(a / this.nx)) < gScore[b] + h(b % this.nx, Math.floor(b / this.nx))) bi = k
      }
      const cur = open.splice(bi, 1)[0]
      const ci = cur % this.nx
      const cj = Math.floor(cur / this.nx)
      if (ci === g[0] && cj === g[1]) { found = true; break }
      closed[cur] = 1
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue
          const ni = ci + di, nj = cj + dj
          if (this.isBlocked(ni, nj) || closed[idx(ni, nj)]) continue
          // En diagonal no se cuela entre dos muebles pegados.
          if (di && dj && (this.isBlocked(ci + di, cj) || this.isBlocked(ci, cj + dj))) continue
          const tentative = gScore[cur] + (di && dj ? 1.414 : 1)
          const n = idx(ni, nj)
          if (tentative < gScore[n]) {
            gScore[n] = tentative
            came[n] = cur
            if (!open.includes(n)) open.push(n)
          }
        }
      }
    }
    if (!found) return null
    const cells: Pt[] = []
    for (let c = idx(g[0], g[1]); c !== -1; c = came[c]) cells.push(this.center(c % this.nx, Math.floor(c / this.nx)))
    cells.reverse()
    // Se estira el camino: se saltan los puntos intermedios que tienen línea libre.
    const pts: Pt[] = [from, ...cells.slice(1), to]
    const out: Pt[] = [pts[0]]
    let anchor = 0
    while (anchor < pts.length - 1) {
      let far = pts.length - 1
      while (far > anchor + 1 && !this.lineClear(pts[anchor], pts[far])) far--
      out.push(pts[far])
      anchor = far
    }
    return out
  }
}

export const inRect = (p: Pt, r: Rect) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1
