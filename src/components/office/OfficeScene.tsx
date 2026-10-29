'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AgentStatus, OfficeAgent, OfficeDepartment } from '@/lib/office'
import { animatePerson, buildPerson, specFor, type Person, type PersonPose } from './person'

export interface CeoStats {
  pending: number
  problems: number
  working: number
}

interface Props {
  departments: OfficeDepartment[]
  /** 'all' encuadra el piso entero; un id de departamento o 'ceo' acerca la cámara a esa zona. */
  focus: string
  /** Id de un agente o 'ceo'. */
  selectedId: string | null
  statusOf: (agentId: string) => AgentStatus
  /** Hora del reloj (real o de la demostración), en minutos desde 00:00. */
  minutes: number
  ceo: CeoStats
  onSelect: (id: string, departmentId: string | null) => void
  /** Cierra la tarjeta del agente elegido. */
  onClose: () => void
}

// ───────────────────────── Distribución ─────────────────────────
const DESK_DX = 3.0
const DESK_DZ = 3.8
const ZONE_GAP = 2.6
const CEO_W = 9.6
const CEO_D = 6.4
const PLATFORM_H = 0.35

interface ZonePlan {
  dept: OfficeDepartment
  cx: number
  cz: number
  w: number
  d: number
  desks: { agent: OfficeAgent; x: number; z: number }[]
}
interface Plan {
  zones: ZonePlan[]
  ceo: { x: number; z: number }
  floor: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/** Reparte los departamentos en dos columnas sobre un mismo piso abierto y pone al CEO en una plataforma aparte. */
export function planOffice(depts: OfficeDepartment[]): Plan {
  const sizes = depts.map((d) => {
    const n = d.agents.length
    const cols = n <= 3 ? Math.max(1, n) : n <= 6 ? 3 : 4
    const rows = Math.ceil(n / cols)
    return { cols, rows, w: cols * DESK_DX + 2.6, d: rows * DESK_DZ + 1.4 }
  })
  const nCols = depts.length <= 1 ? 1 : 2
  const colW = Array.from({ length: nCols }, () => 0)
  const colH = Array.from({ length: nCols }, () => 0)
  const colOf = depts.map((_, i) => {
    const c = nCols === 1 ? 0 : colH[0] <= colH[1] ? 0 : 1
    colW[c] = Math.max(colW[c], sizes[i].w)
    colH[c] += sizes[i].d + ZONE_GAP
    return c
  })
  const colX: number[] = []
  let x = 0
  colW.forEach((w) => { colX.push(x + w / 2); x += w + ZONE_GAP })
  const total = x - ZONE_GAP
  const cursor = Array.from({ length: nCols }, () => 0)
  const zones: ZonePlan[] = depts.map((dept, i) => {
    const c = colOf[i]
    const s = sizes[i]
    const cx = colX[c] - total / 2
    const cz = cursor[c] + s.d / 2
    cursor[c] += s.d + ZONE_GAP
    const desks = dept.agents.map((agent, k) => {
      const r = Math.floor(k / s.cols)
      const inRow = Math.min(s.cols, dept.agents.length - r * s.cols)
      const col = k % s.cols
      return { agent, x: cx + (col - (inRow - 1) / 2) * DESK_DX, z: cz - s.d / 2 + 1.5 + r * DESK_DZ }
    })
    return { dept, cx, cz, w: s.w, d: s.d, desks }
  })
  const maxZ = Math.max(0, ...zones.map((z) => z.cz + z.d / 2))
  const maxX = Math.max(CEO_W / 2, ...zones.map((z) => z.cx + z.w / 2))
  const minX = Math.min(-CEO_W / 2, ...zones.map((z) => z.cx - z.w / 2))
  const ceo = { x: maxX - CEO_W / 2, z: maxZ + 1.8 + CEO_D / 2 }
  return {
    zones,
    ceo,
    floor: { minX: minX - 2.2, maxX: maxX + 2.2, minZ: -2.2, maxZ: ceo.z + CEO_D / 2 + 1.6 },
  }
}

// ───────────────────────── Utilidades 3D ─────────────────────────
const hex = (s: string) => parseInt(s.replace('#', ''), 16)
const mat = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.78, metalness: 0.04, ...o })
function box(w: number, h: number, d: number, c: number, o: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o))
  m.castShadow = true
  m.receiveShadow = true
  return m
}
function put<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, parent?: THREE.Object3D): T {
  o.position.set(x, y, z)
  parent?.add(o)
  return o
}
/** Mezcla un color con blanco: para las alfombras suaves de cada área. */
const soft = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex()
const deep = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex()

function textSprite(text: string, color: string, size = 84) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  if (g) {
    g.font = `800 ${size}px sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = color
    g.fillText(text, 64, 70)
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  s.scale.set(0.8, 0.8, 1)
  return s
}
function floorTexture(repX: number, repY: number) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = '#e8e2d6'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = 'rgba(120,105,85,0.20)'
    g.lineWidth = 2
    g.strokeRect(1, 1, 254, 254)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repX, repY)
  return t
}

function plant(x: number, z: number, parent: THREE.Object3D, s = 1) {
  const g = new THREE.Group()
  put(new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.38 * s, 12), mat(0xc2754a)), 0, 0.19 * s, 0, g)
  ;[[0, 0.62, 0, 0.3], [0.15, 0.85, 0.05, 0.22], [-0.14, 0.78, -0.06, 0.24]].forEach((p) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(p[3] * s, 12, 10), mat(0x3f9b5a))
    l.castShadow = true
    put(l, p[0] * s, p[1] * s, p[2] * s, g)
  })
  g.position.set(x, 0, z)
  parent.add(g)
}

// ───────────────────────── Escritorio con su persona ─────────────────────────
interface Actor {
  id: string
  deptId: string
  a: OfficeAgent
  wrap: THREE.Group
  person: Person
  screen: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  zz: THREE.Sprite
  ex: THREE.Sprite
  ghost: boolean
}

function buildDesk(a: OfficeAgent, x: number, z: number, deptId: string, accent: number): Actor {
  const ghost = a.status === 'ghost'
  const desk = new THREE.Group()
  const wood = 0xe8d9bd
  put(box(2.0, 0.08, 1.0, wood), 0, 0.8, 0, desk)
  ;[[-0.92, -0.42], [0.92, -0.42], [-0.92, 0.42], [0.92, 0.42]].forEach((p) => put(box(0.06, 0.78, 0.06, 0xf6f6f4), p[0], 0.39, p[1], desk))
  // Monitor con el encendido según el estado
  put(box(0.1, 0.22, 0.08, 0x2a2e38), 0, 0.95, -0.28, desk)
  const screen = box(0.92, 0.55, 0.05, 0x14171d, { emissive: new THREE.Color(0x000000), emissiveIntensity: 1 }) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  put(screen, 0, 1.3, -0.3, desk)
  put(box(0.62, 0.025, 0.2, 0xcfd3da), 0, 0.85, 0.2, desk)
  put(box(0.1, 0.1, 0.1, 0xf4f4f4), 0.75, 0.9, 0.05, desk) // taza
  put(box(0.34, 0.012, 0.24, 0xf6efe0), -0.7, 0.845, 0.1, desk) // cuaderno
  // Silla con el color del área
  const chairColor = deep(accent, 0.78)
  put(box(0.55, 0.07, 0.55, chairColor), 0, 0.5, 0.95, desk)
  put(box(0.55, 0.55, 0.07, chairColor), 0, 0.82, 1.23, desk)
  put(box(0.07, 0.46, 0.07, 0x3a3f4a), 0, 0.24, 0.95, desk)
  put(box(0.5, 0.04, 0.5, 0x3a3f4a), 0, 0.03, 0.95, desk)

  const seat = new THREE.Group()
  seat.position.set(0, 0, 0.95)
  seat.rotation.y = Math.PI // mira hacia el monitor
  desk.add(seat)
  const person = buildPerson(specFor(a.id, hex(a.color), ghost), (a.id.length * 7) % 13)
  person.group.scale.multiplyScalar(1.15)
  seat.add(person.group)

  const zz = put(textSprite('z', '#7f8aa3'), 0.25, 1.95, 0.95, desk)
  const ex = put(textSprite('!', '#e5484d'), 0, 2.15, 0.95, desk)
  ex.visible = false
  const wrap = new THREE.Group()
  wrap.add(desk)
  wrap.position.set(x, 0, z)
  return { id: a.id, deptId, a, wrap, person, screen, zz, ex, ghost }
}

// ───────────────────────── Componente ─────────────────────────
export function OfficeScene({ departments, focus, selectedId, statusOf, minutes, ceo, onSelect, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const popRef = useRef<HTMLDivElement>(null)
  const live = useRef({ statusOf, minutes, selectedId, focus, ceo })
  live.current = { statusOf, minutes, selectedId, focus, ceo }

  // La escena se reconstruye solo si cambia la estructura (zonas y agentes), no por el estado.
  const structure = departments.map((d) => `${d.id}:${d.name}:${d.accent}:${d.agents.map((a) => `${a.id}${a.name}${a.status === 'ghost' ? 'g' : ''}${a.color}`).join(',')}`).join('|')

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xdfe9f2)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 250)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd5e0, 0.8))
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.75)
    sun.position.set(-14, 26, -10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 90 })
    scene.add(sun)

    const plan = planOffice(departments)
    const { floor } = plan
    const fw = floor.maxX - floor.minX
    const fd = floor.maxZ - floor.minZ
    const fcx = (floor.minX + floor.maxX) / 2
    const fcz = (floor.minZ + floor.maxZ) / 2
    const root = new THREE.Group()
    scene.add(root)

    // Piso cálido y paredes del fondo con ventanales (un solo espacio abierto)
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.3, fd), new THREE.MeshStandardMaterial({ map: floorTexture(fw / 2.4, fd / 2.4), roughness: 0.85 }))
    floorMesh.receiveShadow = true
    put(floorMesh, fcx, -0.15, fcz, root)
    const wallColor = 0xf3f0e9
    const WALL_H = 6.4
    put(box(fw, WALL_H, 0.2, wallColor), fcx, WALL_H / 2, floor.maxZ, root) // pared del fondo
    put(box(0.2, WALL_H, fd, wallColor), floor.maxX, WALL_H / 2, fcz, root) // pared derecha
    // Letrero con el nombre de la corporación, sobre los ventanales
    const signCv = document.createElement('canvas')
    signCv.width = 1400
    signCv.height = 260
    const sg = signCv.getContext('2d')
    if (sg) {
      sg.clearRect(0, 0, 1400, 260)
      sg.fillStyle = '#2f3b5c'
      sg.font = '800 150px system-ui, -apple-system, sans-serif'
      sg.textBaseline = 'middle'
      sg.fillText('Corporación Marin', 10, 120)
      sg.fillStyle = '#b8863b'
      sg.fillRect(14, 218, 520, 10)
    }
    const signTex = new THREE.CanvasTexture(signCv)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 1.75), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }))
    sign.rotation.y = Math.PI
    put(sign, floor.minX + fw * 0.34, 5.0, floor.maxZ - 0.12, root)
    const glass = new THREE.MeshBasicMaterial({ color: 0xc4e1f6 })
    const winFrame = (w: number, h: number, d: number) => box(w, h, d, 0xffffff)
    const backWins = Math.max(2, Math.floor(fw / 4.6))
    for (let i = 0; i < backWins; i++) {
      const wx = floor.minX + ((i + 0.5) * fw) / backWins
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.0), glass)
      pane.rotation.y = Math.PI
      put(pane, wx, 2.2, floor.maxZ - 0.11, root)
      put(winFrame(3.0, 0.1, 0.12), wx, 3.25, floor.maxZ - 0.1, root)
      put(winFrame(3.0, 0.1, 0.12), wx, 1.15, floor.maxZ - 0.1, root)
      put(winFrame(0.08, 2.1, 0.12), wx, 2.2, floor.maxZ - 0.1, root)
    }
    const sideWins = Math.max(2, Math.floor(fd / 4.6))
    for (let i = 0; i < sideWins; i++) {
      const wz = floor.minZ + ((i + 0.5) * fd) / sideWins
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.0), glass)
      pane.rotation.y = -Math.PI / 2
      put(pane, floor.maxX - 0.11, 2.2, wz, root)
      put(winFrame(0.12, 0.1, 3.0), floor.maxX - 0.1, 3.25, wz, root)
      put(winFrame(0.12, 0.1, 3.0), floor.maxX - 0.1, 1.15, wz, root)
      put(winFrame(0.12, 2.1, 0.08), floor.maxX - 0.1, 2.2, wz, root)
    }
    // Zócalo y plantas grandes en las esquinas
    put(box(fw, 0.18, 0.12, 0xd9d2c3), fcx, 0.09, floor.maxZ - 0.15, root)
    put(box(0.12, 0.18, fd, 0xd9d2c3), floor.maxX - 0.15, 0.09, fcz, root)
    plant(floor.maxX - 0.9, floor.maxZ - 0.9, root, 1.5)
    plant(floor.minX + 0.9, floor.maxZ - 0.9, root, 1.4)

    // Áreas: alfombra suave del color del departamento y mamparas de vidrio en los lados del fondo
    const partition = new THREE.MeshStandardMaterial({ color: 0xe6f3fb, transparent: true, opacity: 0.38, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide })
    plan.zones.forEach((z) => {
      const c = hex(z.dept.accent)
      const rug = box(z.w - 0.5, 0.03, z.d - 0.5, soft(c, 0.78))
      rug.castShadow = false
      put(rug, z.cx, 0.015, z.cz, root)
      // Mampara trasera y lateral: dividen sin encerrar
      const backLen = z.w * 0.82
      const wallZ = z.cz + z.d / 2 - 0.1
      const WALL = 1.9
      put(new THREE.Mesh(new THREE.BoxGeometry(backLen, WALL, 0.07), new THREE.MeshStandardMaterial({ color: 0xf6f8fa, transparent: true, opacity: 0.8, roughness: 0.4 })), z.cx, WALL / 2, wallZ, root)
      put(box(backLen, 0.07, 0.11, 0xc9a77a), z.cx, WALL + 0.03, wallZ, root)
      // Nombre del área, escrito en la pared
      const cvz = document.createElement('canvas')
      cvz.width = 1200
      cvz.height = 240
      const gz = cvz.getContext('2d')
      if (gz) {
        const label = z.dept.name.toUpperCase()
        let size = 110
        gz.font = `800 ${size}px system-ui, -apple-system, sans-serif`
        while (gz.measureText(label).width > 1120 && size > 40) { size -= 6; gz.font = `800 ${size}px system-ui, -apple-system, sans-serif` }
        gz.textBaseline = 'middle'
        gz.textAlign = 'center'
        gz.fillStyle = `#${deep(c, 0.62).toString(16).padStart(6, '0')}`
        gz.fillText(label, 600, 112)
        gz.fillStyle = `#${deep(c, 0.9).toString(16).padStart(6, '0')}`
        gz.fillRect(420, 190, 360, 10)
      }
      const nameW = backLen * 0.86
      const nameBoard = new THREE.Mesh(new THREE.PlaneGeometry(nameW, nameW / 5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvz), transparent: true }))
      nameBoard.rotation.y = Math.PI
      put(nameBoard, z.cx, WALL * 0.52, wallZ - 0.045, root)
      const sideLen = z.d * 0.62
      put(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, sideLen), partition), z.cx + z.w / 2 - 0.1, 0.62, z.cz + (z.d - sideLen) / 2 - 0.1, root)
      put(box(0.09, 0.06, sideLen, 0xc9a77a), z.cx + z.w / 2 - 0.1, 1.18, z.cz + (z.d - sideLen) / 2 - 0.1, root)
      plant(z.cx + z.w / 2 - 0.7, z.cz + z.d / 2 - 0.7, root)
      plant(z.cx - z.w / 2 + 0.7, z.cz + z.d / 2 - 0.7, root, 0.85)
    })

    // Personas en sus escritorios
    const actors: Actor[] = []
    plan.zones.forEach((z) => z.desks.forEach((d) => {
      const o = buildDesk(d.agent, d.x, d.z, z.dept.id, hex(z.dept.accent))
      actors.push(o)
      root.add(o.wrap)
    }))

    // Oficina de Andrés: plataforma de madera, vidrio y la pantalla central detrás
    const cg = new THREE.Group()
    cg.position.set(plan.ceo.x, 0, plan.ceo.z)
    put(box(CEO_W, PLATFORM_H, CEO_D, 0xcdac78), 0, PLATFORM_H / 2, 0, cg)
    put(box(CEO_W - 0.6, 0.02, CEO_D - 0.6, 0xf1e8d6), 0, PLATFORM_H + 0.01, 0, cg)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide })
    put(new THREE.Mesh(new THREE.BoxGeometry(CEO_W, 3.0, 0.06), glassMat), 0, PLATFORM_H + 1.5, CEO_D / 2, cg)
    put(new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.0, CEO_D), glassMat), CEO_W / 2, PLATFORM_H + 1.5, 0, cg)
    put(box(CEO_W, 0.08, 0.1, 0x8a6a45), 0, PLATFORM_H + 3.0, CEO_D / 2, cg)
    put(box(0.1, 0.08, CEO_D, 0x8a6a45), CEO_W / 2, PLATFORM_H + 3.0, 0, cg)
    ;[[-CEO_W / 2, CEO_D / 2], [CEO_W / 2, CEO_D / 2], [CEO_W / 2, -CEO_D / 2]].forEach((p) => put(box(0.1, 3.0, 0.1, 0x8a6a45), p[0], PLATFORM_H + 1.5, p[1], cg))
    // Panel con la pantalla (por aprobar, con problemas, trabajando)
    put(box(5.0, 2.6, 0.12, 0xb69362), 0, PLATFORM_H + 2.0, CEO_D / 2 - 0.35, cg)
    const cv = document.createElement('canvas')
    cv.width = 768
    cv.height = 384
    const tex = new THREE.CanvasTexture(cv)
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: tex }))
    screenMesh.rotation.y = Math.PI
    put(screenMesh, 0, PLATFORM_H + 2.0, CEO_D / 2 - 0.42, cg)
    // Escritorio grande, silla y a Andrés
    put(box(4.0, 0.1, 1.3, 0x6a4a31), 0, PLATFORM_H + 0.78, 0.2, cg)
    ;[[-1.8, -0.35], [1.8, -0.35], [-1.8, 0.75], [1.8, 0.75]].forEach((p) => put(box(0.08, 0.74, 0.08, 0x3d2b1c), p[0], PLATFORM_H + 0.37, p[1], cg))
    put(box(0.9, 0.55, 0.05, 0x14171d), -0.9, PLATFORM_H + 1.2, -0.1, cg)
    put(box(0.5, 0.025, 0.2, 0xcfd3da), -0.9, PLATFORM_H + 0.85, 0.35, cg)
    put(box(0.34, 0.012, 0.24, 0xf6efe0), 1.0, PLATFORM_H + 0.835, 0.35, cg)
    put(box(0.6, 0.07, 0.6, 0x2a2d36), 0, PLATFORM_H + 0.5, 1.5, cg)
    put(box(0.6, 0.65, 0.07, 0x2a2d36), 0, PLATFORM_H + 0.85, 1.82, cg)
    put(box(0.08, 0.46, 0.08, 0x1c1e25), 0, PLATFORM_H + 0.24, 1.5, cg)
    const ceoSeat = new THREE.Group()
    ceoSeat.position.set(0, PLATFORM_H, 1.5)
    ceoSeat.rotation.y = Math.PI
    cg.add(ceoSeat)
    const ceoPerson = buildPerson({ skin: 0xd9a77f, hair: 0x2a1d14, hairStyle: 'short', shirt: 0xf4f4f6, pants: 0x1f2433, suit: { jacket: 0x273553, tie: 0xb8863b }, scale: 1.02, ghost: false }, 3)
    ceoPerson.group.scale.multiplyScalar(1.15)
    ceoSeat.add(ceoPerson.group)
    put(box(1.6, 0.42, 0.7, 0x51657f), 3.0, PLATFORM_H + 0.21, -1.6, cg) // sofá
    put(box(1.6, 0.4, 0.14, 0x51657f), 3.0, PLATFORM_H + 0.6, -1.95, cg)
    plant(-3.9, -2.3, cg, 1.2)
    plant(-3.9, 2.0, cg, 0.9)
    root.add(cg)

    // Pantalla: ANDRÉS MARÍN · CEO con los tres números
    let screenKey = ''
    const drawScreen = (c: CeoStats) => {
      const key = `${c.pending}|${c.problems}|${c.working}`
      if (key === screenKey) return
      screenKey = key
      const g = cv.getContext('2d')
      if (!g) return
      const W = cv.width, H = cv.height
      g.fillStyle = '#10182c'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#e8ecf6'
      g.font = '700 26px sans-serif'
      g.fillText('Andrés Marín · CEO', 28, 46)
      g.fillStyle = '#8d9ac0'
      g.font = '500 20px sans-serif'
      g.fillText('Lo que necesita tu decisión hoy', 28, 74)
      const items: [string, number, string][] = [['Por aprobar', c.pending, '#f2b84b'], ['Con problemas', c.problems, '#f0645c'], ['Trabajando', c.working, '#4fd18b']]
      items.forEach((it, i) => {
        const x = 28 + i * 242
        g.fillStyle = 'rgba(255,255,255,.06)'
        g.fillRect(x, 100, 226, 190)
        g.fillStyle = it[2]
        g.font = '800 96px sans-serif'
        g.fillText(String(it[1]), x + 18, 205)
        g.fillStyle = '#cdd5ea'
        g.font = '700 20px sans-serif'
        g.fillText(it[0], x + 18, 254)
      })
      g.fillStyle = c.problems ? '#f0645c' : '#4fd18b'
      g.font = '600 22px sans-serif'
      g.fillText(c.problems ? 'Hay agentes que necesitan atención' : 'Todo el sistema funciona bien', 28, 338)
      tex.needsUpdate = true
    }

    // Anillo bajo el agente seleccionado
    const selRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0x5b6cff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    selRing.rotation.x = -Math.PI / 2
    selRing.visible = false
    scene.add(selRing)

    // Cámara orbitable con foco suave
    const focusOf = (k: string) => {
      if (k === 'ceo') return { tx: plan.ceo.x, tz: plan.ceo.z - 0.5, span: 20 }
      const z = plan.zones.find((q) => q.dept.id === k)
      if (z) return { tx: z.cx, tz: z.cz, span: Math.max(z.w, z.d) * 1.35 + 8 }
      return { tx: fcx, tz: fcz, span: (Math.max(fw, fd) + Math.min(fw, fd) * 0.5) * 0.98 }
    }
    let yaw = (Math.PI * 5) / 4 // se mira desde el lado en que las personas dan la cara
    let pitch = 0.6
    let zoom = 1
    const cur = { ...focusOf('all') }
    const pts = new Map<number, [number, number]>()
    let drag: { x: number; y: number } | null = null
    let pinch = 0
    const onDown = (e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY } }
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, [e.clientX, e.clientY])
      const v = Array.from(pts.values())
      if (v.length === 2) {
        const d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1])
        if (pinch) zoom = Math.max(0.6, Math.min(2.4, (zoom * d) / pinch))
        pinch = d
        return
      }
      if (!drag) return
      yaw -= (e.clientX - drag.x) * 0.006
      pitch = Math.max(0.35, Math.min(1.1, pitch + (e.clientY - drag.y) * 0.004))
      drag = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; drag = null }
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom = Math.max(0.6, Math.min(2.4, zoom * (e.deltaY < 0 ? 1.08 : 0.92))) }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    let aspect = 1.6
    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      renderer.setSize(w, h, false)
      aspect = w / Math.max(1, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const tmp = new THREE.Vector3()
    const project = (x: number, y: number, z: number) => {
      tmp.set(x, y, z).project(camera)
      return { x: (tmp.x * 0.5 + 0.5) * host.clientWidth, y: (-tmp.y * 0.5 + 0.5) * host.clientHeight, back: tmp.z > 1 }
    }

    // Etiquetas sin pisarse: se acomodan de mayor a menor prioridad y las que chocan suben un poco.
    const labelItems: { el: HTMLElement; x: number; y: number; p: number }[] = []
    const smoothY = new Map<HTMLElement, number>()
    const pushLabel = (el: HTMLElement | null, x: number, y: number, z: number, p: number) => {
      if (!el) return
      const q = project(x, y, z)
      if (q.back) { el.style.display = 'none'; return }
      labelItems.push({ el, x: q.x, y: q.y, p })
    }
    const flushLabels = () => {
      labelItems.sort((a, b) => a.p - b.p)
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
      labelItems.forEach((it) => {
        const w = it.el.offsetWidth || 70
        const h = 16
        let y = it.y
        for (let n = 0; n < 10; n++) {
          const hit = placed.find((r) => it.x - w / 2 < r.x1 && it.x + w / 2 > r.x0 && y - h < r.y1 && y > r.y0)
          if (!hit) break
          y = hit.y0 - 2
        }
        const prev = smoothY.get(it.el)
        const ny = prev === undefined || Math.abs(prev - y) > 120 ? y : prev + (y - prev) * 0.3
        smoothY.set(it.el, ny)
        placed.push({ x0: it.x - w / 2, y0: ny - h, x1: it.x + w / 2, y1: ny })
        it.el.style.left = `${it.x}px`
        it.el.style.top = `${ny}px`
        it.el.style.display = 'flex'
      })
      labelItems.length = 0
    }

    const poseOf = (s: AgentStatus): PersonPose => (s === 'work' ? 'type' : s === 'sleep' ? 'rest' : s === 'alert' ? 'help' : 'idle')

    let raf = 0
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const time = t / 1000
      const { statusOf: st, selectedId: sel, focus: fcs, ceo: cs } = live.current

      const f = focusOf(fcs)
      cur.tx += (f.tx - cur.tx) * 0.1
      cur.tz += (f.tz - cur.tz) * 0.1
      cur.span += (f.span - cur.span) * 0.1
      const viewH = Math.max(cur.span * 0.5 + 1.5, (cur.span * 0.76) / aspect) / zoom
      camera.left = (-viewH * aspect) / 2
      camera.right = (viewH * aspect) / 2
      camera.top = viewH / 2
      camera.bottom = -viewH / 2
      camera.updateProjectionMatrix()
      const R = 80
      camera.position.set(cur.tx + Math.sin(yaw) * Math.cos(pitch) * R, Math.sin(pitch) * R, cur.tz + Math.cos(yaw) * Math.cos(pitch) * R)
      camera.lookAt(cur.tx, 0.8, cur.tz)

      actors.forEach((o) => {
        const s = st(o.id)
        animatePerson(o.person, poseOf(s), time)
        // La pantalla se enciende cuando trabaja y parpadea en rojo si algo falla.
        const em = o.screen.material
        if (s === 'work') { em.emissive.setHex(0x7ab8ff); em.emissiveIntensity = 0.75 + Math.sin(time * 7) * 0.1 }
        else if (s === 'alert') { em.emissive.setHex(0xff5b5b); em.emissiveIntensity = Math.sin(time * 6) > 0 ? 0.8 : 0.15 }
        else { em.emissive.setHex(0x000000); em.emissiveIntensity = 1 }
        o.zz.visible = s === 'sleep'
        o.zz.position.y = 1.95 + Math.sin(time * 2) * 0.06
        o.ex.visible = s === 'alert'
        o.ex.position.y = 2.15 + Math.abs(Math.sin(time * 6)) * 0.1
        const el = labelRefs.current[o.id]
        if (el) {
          pushLabel(el, o.wrap.position.x, 2.2, o.wrap.position.z + 0.95, sel === o.id ? 0 : s === 'alert' ? 1 : s === 'work' ? 2 : s === 'sleep' ? 3 : 4)
          el.dataset.status = s
          el.dataset.sel = sel === o.id ? '1' : '0'
          el.style.opacity = fcs === 'all' || fcs === o.deptId ? '' : '0.4'
        }
      })
      animatePerson(ceoPerson, cs.problems > 0 ? 'type' : 'type', time + 4)
      const ceoEl = labelRefs.current.ceo
      if (ceoEl) { pushLabel(ceoEl, plan.ceo.x, PLATFORM_H + 2.4, plan.ceo.z + 1.5, 1); ceoEl.dataset.sel = sel === 'ceo' ? '1' : '0' }
      flushLabels()
      // Tarjeta del agente elegido: flota encima de su etiqueta, sin salirse del cuadro.
      const pop = popRef.current
      if (pop) {
        const selLabel = sel ? labelRefs.current[sel] : null
        if (selLabel && selLabel.style.display !== 'none') {
          const pw = pop.offsetWidth || 260
          const ph = pop.offsetHeight || 140
          const lx = parseFloat(selLabel.style.left || '0')
          const ly = parseFloat(selLabel.style.top || '0') - selLabel.offsetHeight - 8
          const x = Math.max(8 + pw / 2, Math.min(host.clientWidth - 8 - pw / 2, lx))
          const y = Math.max(8 + ph, Math.min(host.clientHeight - 8, ly))
          pop.style.left = `${x}px`
          pop.style.top = `${y}px`
          pop.style.visibility = 'visible'
        } else pop.style.visibility = 'hidden'
      }
      drawScreen(cs)

      const selActor = actors.find((a) => a.id === sel)
      if (selActor) {
        selRing.visible = true
        selRing.position.set(selActor.wrap.position.x, 0.06, selActor.wrap.position.z + 0.95)
        selRing.scale.setScalar(1 + Math.sin(time * 3) * 0.05)
      } else if (sel === 'ceo') {
        selRing.visible = true
        selRing.position.set(plan.ceo.x, PLATFORM_H + 0.06, plan.ceo.z + 1.5)
        selRing.scale.setScalar(1 + Math.sin(time * 3) * 0.05)
      } else selRing.visible = false

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose?.()
        const mt = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose())
        else mt?.dispose?.()
      })
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure])

  // Contenido de la tarjeta flotante del agente (o de Andrés) elegido.
  const short = (t: string, n = 150) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
  let popContent: { title: string; subtitle: string; status: string; pill: string; text: string; href?: string; cta: string } | null = null
  if (selectedId === 'ceo') {
    popContent = {
      title: 'Andrés Marín',
      subtitle: 'CEO · oficina de cristal',
      status: 'En su puesto',
      pill: 'bg-emerald-100 text-emerald-700',
      text: `${ceo.pending} por aprobar · ${ceo.problems} con problemas · ${ceo.working} trabajando`,
      href: '/dashboard',
      cta: 'Abrir el Dashboard',
    }
  } else if (selectedId) {
    const found = departments.flatMap((d) => d.agents.map((a) => ({ a, d }))).find((x) => x.a.id === selectedId)
    if (found) {
      const stt = statusOf(found.a.id)
      popContent = {
        title: found.a.name,
        subtitle: `${found.a.role} · ${found.d.name}`,
        status: stt === 'work' ? 'Trabajando' : stt === 'alert' ? 'Necesita atención' : stt === 'ghost' ? 'Puesto libre' : 'Fuera de horario',
        pill: stt === 'work' ? 'bg-emerald-100 text-emerald-700' : stt === 'alert' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-600',
        text: short(stt === 'work' && found.a.doing ? found.a.doing : found.a.lastReport),
        href: stt === 'ghost' ? undefined : found.a.href,
        cta: 'Abrir su trabajo',
      }
    }
  }

  return (
    <div ref={hostRef} className="relative h-full w-full overflow-hidden rounded-xl bg-[#dfe9f2]">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-grab touch-none active:cursor-grabbing" aria-label="Oficina con las áreas de cada departamento y la oficina de Andrés Marín" />
      <div className="pointer-events-none absolute inset-0">
        {departments.flatMap((d) => d.agents.map((a) => (
          <button
            key={a.id}
            ref={(el) => { labelRefs.current[a.id] = el }}
            type="button"
            onClick={() => onSelect(a.id, d.id)}
            className="office-label pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap rounded-full border border-zinc-300 bg-white/95 py-px pl-1.5 pr-2 text-[9px] font-bold leading-tight text-zinc-800 shadow-sm data-[sel='1']:border-indigo-500 data-[sel='1']:ring-2 data-[sel='1']:ring-indigo-300/70"
          >
            <span className="office-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
            {a.name}{a.status === 'ghost' ? ' · pronto' : ''}
          </button>
        )))}
        {popContent && (
          <div
            ref={popRef}
            className="pointer-events-auto absolute w-[260px] -translate-x-1/2 -translate-y-full rounded-xl border border-zinc-200 bg-white p-3 text-zinc-800 shadow-xl"
            style={{ visibility: 'hidden' }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-2 top-1.5 rounded p-0.5 text-sm leading-none text-zinc-400 hover:text-zinc-700"
            >
              ✕
            </button>
            <p className="pr-5 text-[13px] font-extrabold leading-tight">{popContent.title}</p>
            <p className="text-[11px] text-zinc-500">{popContent.subtitle}</p>
            <span className={`mt-1.5 inline-block rounded-full px-2 py-px text-[10px] font-bold ${popContent.pill}`}>{popContent.status}</span>
            <p className="mt-1.5 text-[11px] leading-snug text-zinc-700">{popContent.text}</p>
            {popContent.href && (
              <a href={popContent.href} className="mt-2 inline-block text-[11px] font-bold text-indigo-600 hover:underline">{popContent.cta} →</a>
            )}
          </div>
        )}
        <button
          ref={(el) => { labelRefs.current.ceo = el }}
          type="button"
          onClick={() => onSelect('ceo', null)}
          className="office-label pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap rounded-full border border-amber-500/70 bg-white/95 py-px pl-1.5 pr-2 text-[9px] font-bold leading-tight text-amber-800 shadow-sm data-[sel='1']:ring-2 data-[sel='1']:ring-amber-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Andrés Marín
        </button>
      </div>
    </div>
  )
}
