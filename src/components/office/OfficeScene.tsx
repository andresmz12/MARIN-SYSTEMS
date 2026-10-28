'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils'
import type { AgentStatus, OfficeAgent, OfficeDepartment } from '@/lib/office'

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
  /** Hora del reloj (real o de la demostración), en minutos desde 00:00: manda sobre el día y la noche. */
  minutes: number
  ceo: CeoStats
  /** Oficina clara (siempre de día) o noche cerrada con neón; la oscura sigue el reloj. */
  bright?: boolean
  onSelect: (id: string, departmentId: string | null) => void
}

// ───────────────────────── Distribución ─────────────────────────
const DESK_DX = 3.0
const DESK_DZ = 3.8
const ZONE_GAP = 2.4
const CEO_W = 9.6
const CEO_D = 6.4

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
  radar: { x: number; z: number }
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
    // Cada zona va a la columna más baja: así queda parejo, sin dejar huecos.
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
  const ceo = { x: maxX - CEO_W / 2, z: maxZ + 1.6 + CEO_D / 2 }
  const radar = { x: minX + (maxX - minX) * 0.28, z: ceo.z }
  return {
    zones,
    ceo,
    radar,
    floor: { minX: minX - 2.5, maxX: maxX + 2.5, minZ: -2.5, maxZ: ceo.z + CEO_D / 2 + 2.5 },
  }
}

// ───────────────────────── Utilidades 3D ─────────────────────────
const hex = (s: string) => parseInt(s.replace('#', ''), 16)
const mat = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.1, ...o })
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
function neon(color: number, w: number, h: number, d: number) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }))
}
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
  s.scale.set(0.9, 0.9, 1)
  return s
}
function gridTexture(repX: number, repY: number, bright = false) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = bright ? '#e9eef4' : '#0a1020'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = bright ? 'rgba(70,110,160,0.30)' : 'rgba(90,215,255,0.28)'
    g.lineWidth = 2
    g.strokeRect(1, 1, 254, 254)
    g.strokeStyle = bright ? 'rgba(70,110,160,0.12)' : 'rgba(90,215,255,0.10)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(128, 0)
    g.lineTo(128, 256)
    g.moveTo(0, 128)
    g.lineTo(256, 128)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repX, repY)
  return t
}
function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(' ')
  let line = ''
  let n = 0
  for (const w of words) {
    const t = `${line}${w} `
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line.trim(), x, y)
      line = `${w} `
      y += lh
      if (++n >= maxLines) return
    } else line = t
  }
  g.fillText(line.trim(), x, y)
}

// ───────────────────────── Robot (modelo animado) ─────────────────────────
// Un solo archivo (public/models/robot.glb, RobotExpressive: CC0, Tomás Laulhé) para todos los agentes.
let robotPromise: Promise<THREE.Group | null> | null = null
function loadRobot(): Promise<THREE.Group | null> {
  if (!robotPromise) {
    robotPromise = new Promise((resolve) => {
      new GLTFLoader().load(
        '/models/robot.glb',
        (gltf) => {
          const root = gltf.scene as THREE.Group
          root.userData.clips = gltf.animations
          resolve(root)
        },
        undefined,
        () => resolve(null),
      )
    })
  }
  return robotPromise
}

/** Lo que hace falta para sentar a un robot: un asiento, la figura simple de relleno y su color. */
interface Seatable {
  seat: THREE.Group
  fallback: THREE.Group
  color: number
  ghost: boolean
  mixer?: THREE.AnimationMixer
  actions?: Record<string, THREE.AnimationAction>
  playing?: string
  robot?: THREE.Group
}

interface Actor extends Seatable {
  id: string
  deptId: string
  a: OfficeAgent
  wrap: THREE.Group
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  zz: THREE.Sprite
  ex: THREE.Sprite
}

function buildDesk(a: OfficeAgent, x: number, z: number, deptId: string): Actor {
  const ghost = a.status === 'ghost'
  const color = hex(a.color)
  const desk = new THREE.Group()
  put(box(2.0, 0.12, 1.0, ghost ? 0x1c2440 : 0x2a3558), 0, 0.78, 0, desk)
  ;[[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]].forEach((p) => put(box(0.08, 0.78, 0.08, 0x151c34), p[0], 0.39, p[1], desk))
  put(box(0.9, 0.55, 0.06, 0x05080f), 0, 1.3, -0.25, desk)
  put(box(0.1, 0.25, 0.1, 0x151c34), 0, 0.95, -0.25, desk)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }))
  put(glow, 0, 1.3, -0.215, desk)
  put(neon(ghost ? 0x3a4468 : color, 2.0, 0.025, 0.025), 0, 0.72, 0.5, desk)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0x5a6483 }))
  put(lamp, 0.8, 0.9, -0.3, desk)
  put(box(0.55, 0.06, 0.55, 0x151c34), 0, 0.5, 0.95, desk)
  put(box(0.55, 0.55, 0.06, 0x151c34), 0, 0.82, 1.22, desk)
  put(box(0.08, 0.5, 0.08, 0x151c34), 0, 0.25, 0.95, desk)

  // Asiento del agente: aquí entra el robot (o la figura simple mientras carga).
  const seat = new THREE.Group()
  seat.position.set(0, 0, 0.95)
  seat.rotation.y = Math.PI
  desk.add(seat)
  const fallback = new THREE.Group()
  const fade = ghost ? { transparent: true, opacity: 0.35 } : {}
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.62, 16), mat(ghost ? 0x4a5370 : color, fade))
  body.castShadow = true
  put(body, 0, 0.95, 0, fallback)
  put(new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 18), mat(ghost ? 0x4a5370 : 0xf1d3b8, fade)), 0, 1.5, 0, fallback)
  seat.add(fallback)

  const zz = put(textSprite('z', '#8d9ac0'), 0.25, 1.95, 0.95, desk)
  const ex = put(textSprite('!', '#f0645c'), 0, 2.1, 0.95, desk)
  ex.visible = false
  const wrap = new THREE.Group()
  wrap.add(desk)
  wrap.position.set(x, 0, z)
  return { id: a.id, deptId, a, wrap, seat, fallback, glow, lamp, zz, ex, color, ghost }
}

/** Mete el robot animado en el asiento, con el color del agente. */
function seatRobot(o: Seatable, template: THREE.Group, gold = false) {
  // Los tipos de SkeletonUtils de esta versión no incluyen clone(), pero el módulo sí lo trae.
  const robot = (SkeletonUtils as unknown as { clone: (o: THREE.Object3D) => THREE.Object3D }).clone(template) as THREE.Group
  const tint = gold ? 0xd9a93a : o.ghost ? 0x4a5370 : o.color
  robot.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    const old = m.material as THREE.MeshStandardMaterial
    const mt = old.clone()
    if (old.name === 'Main') {
      mt.color.setHex(tint)
      if (!o.ghost) { mt.emissive.setHex(tint); mt.emissiveIntensity = 0.18 }
    }
    if (o.ghost) { mt.transparent = true; mt.opacity = 0.32 }
    m.material = mt
  })
  // Escala: el modelo de pie mide ~3.5 unidades; en la oficina un adulto sentado ronda 1.2.
  const box3 = new THREE.Box3().setFromObject(robot)
  const h = box3.max.y - box3.min.y || 3.5
  const s = 1.75 / h
  robot.scale.setScalar(s)
  robot.position.y = -box3.min.y * s + 0.28
  o.seat.add(robot)
  o.fallback.visible = false
  o.robot = robot
  const mixer = new THREE.AnimationMixer(robot)
  const clips = (template.userData.clips ?? []) as THREE.AnimationClip[]
  const actions: Record<string, THREE.AnimationAction> = {}
  clips.forEach((c) => { actions[c.name] = mixer.clipAction(c) })
  o.mixer = mixer
  o.actions = actions
}

function playClip(o: Seatable, name: string, speed = 1) {
  if (!o.actions || !o.actions[name]) return
  const next = o.actions[name]
  next.timeScale = speed
  if (o.playing !== name) {
    const prev = o.playing ? o.actions[o.playing] : null
    next.reset().fadeIn(0.3).play()
    prev?.fadeOut(0.3)
    o.playing = name
  }
}

// ───────────────────────── Componente ─────────────────────────
export function OfficeScene({ departments, focus, selectedId, statusOf, minutes, ceo, bright = false, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const live = useRef({ statusOf, minutes, selectedId, focus, ceo })
  live.current = { statusOf, minutes, selectedId, focus, ceo }

  // La escena se reconstruye solo si cambia la estructura (zonas y agentes), no por el estado.
  const structure = departments.map((d) => `${d.id}:${d.name}:${d.accent}:${d.agents.map((a) => `${a.id}${a.status === 'ghost' ? 'g' : ''}${a.color}`).join(',')}`).join('|') + (bright ? '|bright' : '|dark')

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    let disposed = false

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bright ? 0xcfe3f5 : 0x070b16)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 250)
    const hemi = new THREE.HemisphereLight(bright ? 0xffffff : 0x9bb2ff, bright ? 0xb9c6d8 : 0x10152a, bright ? 0.72 : 0.6)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.7)
    sun.position.set(14, 26, 16)
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

    // Piso con cuadrícula, borde de luz y ciudad al fondo
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.3, fd), new THREE.MeshStandardMaterial({ map: gridTexture(fw / 2.1, fd / 2.1, bright), color: bright ? 0xd9e0e9 : 0xffffff, roughness: 0.6, metalness: 0.2 }))
    floorMesh.receiveShadow = true
    put(floorMesh, fcx, -0.15, fcz, root)
    const edges: THREE.Mesh[] = []
    ;[
      put(neon(0x5ad7ff, fw, 0.04, 0.06), fcx, 0.01, floor.minZ, root),
      put(neon(0x5ad7ff, 0.06, 0.04, fd), floor.minX, 0.01, fcz, root),
    ].forEach((m) => edges.push(m))
    put(box(fw, 0.9, 0.3, 0x141c38), fcx, 0.45, floor.maxZ, root)
    const windows: THREE.Mesh[] = []
    const count = Math.ceil(fw / 1.3)
    for (let i = 0; i < count; i++) {
      const h = 3 + Math.abs(Math.sin(i * 7.3)) * 9
      const w = 1.1 + Math.abs(Math.cos(i * 3.1)) * 1.4
      const x = floor.minX + i * 1.3
      put(box(w, h, 1, 0x0d1328), x, h / 2, floor.maxZ + 2.4 + (i % 3) * 0.8, root)
      for (let r = 0; r < Math.floor(h / 1.1); r++) {
        if (Math.sin(i * 12.9 + r * 4.1) > -0.2) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.4), new THREE.MeshBasicMaterial({ color: bright ? 0x8fb4de : 0xffd98a }))
          win.position.set(x + (r % 2 ? 0.2 : -0.2), 0.8 + r * 1.05, floor.maxZ + 1.9 + (i % 3) * 0.8)
          win.rotation.y = Math.PI // mira hacia la cámara
          win.userData.id = i * 31 + r
          root.add(win)
          windows.push(win)
        }
      }
    }

    // Zonas de luz por departamento
    const zoneLines: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = []
    plan.zones.forEach((z) => {
      const c = hex(z.dept.accent)
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: bright ? 0.16 : 0.07 }))
      pad.rotation.x = -Math.PI / 2
      put(pad, z.cx, 0.02, z.cz, root)
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map((s) => new THREE.Vector3(z.cx + (s[0] * z.w) / 2, 0.04, z.cz + (s[1] * z.d) / 2))
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.8 }))
      root.add(line)
      zoneLines.push(line)
      ;[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((s) => put(neon(c, 0.5, 0.06, 0.5), z.cx + (s[0] * z.w) / 2, 0.05, z.cz + (s[1] * z.d) / 2, root))
    })

    // Radar central
    const radar = new THREE.Group()
    radar.position.set(plan.radar.x, 0.05, plan.radar.z)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5ad7ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.1, 64), ringMat)
    ring.rotation.x = -Math.PI / 2
    radar.add(ring)
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.25, 64), new THREE.MeshBasicMaterial({ color: 0x5ad7ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }))
    ring2.rotation.x = -Math.PI / 2
    radar.add(ring2)
    const sweep = new THREE.Mesh(new THREE.CircleGeometry(2.0, 32, 0, 0.6), new THREE.MeshBasicMaterial({ color: 0x5ad7ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }))
    sweep.rotation.x = -Math.PI / 2
    radar.add(sweep)
    root.add(radar)

    // Agentes en sus escritorios
    const actors: Actor[] = []
    plan.zones.forEach((z) => z.desks.forEach((d) => {
      const o = buildDesk(d.agent, d.x, d.z, z.dept.id)
      actors.push(o)
      root.add(o.wrap)
    }))

    // Oficina del CEO: plataforma elevada con vidrio y la pantalla central
    const cg = new THREE.Group()
    cg.position.set(plan.ceo.x, 0, plan.ceo.z)
    put(box(CEO_W, 0.5, CEO_D, 0x141c38), 0, 0.25, 0, cg)
    const gold = 0xd6b35a
    put(neon(gold, CEO_W, 0.05, 0.05), 0, 0.5, -CEO_D / 2, cg)
    put(neon(gold, 0.05, 0.05, CEO_D), -CEO_W / 2, 0.5, 0, cg)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x5ad7ff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.6, side: THREE.DoubleSide })
    put(new THREE.Mesh(new THREE.BoxGeometry(CEO_W, 3.4, 0.08), glassMat), 0, 2.2, CEO_D / 2, cg)
    put(new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.4, CEO_D), glassMat), CEO_W / 2, 2.2, 0, cg)
    ;[[-CEO_W / 2, CEO_D / 2], [CEO_W / 2, CEO_D / 2], [CEO_W / 2, -CEO_D / 2]].forEach((p) => put(neon(gold, 0.07, 3.4, 0.07), p[0], 2.2, p[1], cg))
    put(neon(gold, CEO_W, 0.06, 0.06), 0, 3.9, CEO_D / 2, cg)
    put(neon(gold, 0.06, 0.06, CEO_D), CEO_W / 2, 3.9, 0, cg)
    put(box(4.2, 0.14, 1.3, 0x1b2446), 0, 1.0, 0.3, cg)
    ;[[-1.9, -0.2], [1.9, -0.2], [-1.9, 0.8], [1.9, 0.8]].forEach((p) => put(box(0.1, 0.5, 0.1, 0x0c1226), p[0], 0.75, p[1], cg))
    put(neon(gold, 4.2, 0.03, 0.03), 0, 0.93, 0.95, cg)
    const cv = document.createElement('canvas')
    cv.width = 768
    cv.height = 384
    const tex = new THREE.CanvasTexture(cv)
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: tex }))
    screenMesh.rotation.y = Math.PI
    put(screenMesh, 0, 2.5, CEO_D / 2 - 0.1, cg)
    put(neon(gold, 4.8, 0.04, 0.04), 0, 3.7, CEO_D / 2 - 0.11, cg)
    put(neon(gold, 4.8, 0.04, 0.04), 0, 1.3, CEO_D / 2 - 0.11, cg)
    const ceoSeat = new THREE.Group()
    ceoSeat.position.set(0, 0.5, 1.5)
    ceoSeat.rotation.y = Math.PI
    cg.add(ceoSeat)
    const ceoFallback = new THREE.Group()
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.7, 18), mat(0xf2e3b0, { emissive: 0x6a5420, emissiveIntensity: 0.4 }))
    put(cb, 0, 0.95, 0, ceoFallback)
    put(new THREE.Mesh(new THREE.SphereGeometry(0.23, 18, 18), mat(0xf1d3b8)), 0, 1.55, 0, ceoFallback)
    ceoSeat.add(ceoFallback)
    const crown = neon(gold, 0.5, 0.06, 0.5)
    put(crown, 0, 2.55, 0, ceoSeat)
    put(box(0.6, 0.06, 0.6, 0x0c1226), 0, 0.5, 1.5, cg)
    put(box(0.6, 0.6, 0.06, 0x0c1226), 0, 0.85, 1.78, cg)
    put(box(1.5, 0.4, 0.6, 0x1b2446), 3.1, 0.7, 2.0, cg)
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), mat(0x2f9e63, { emissive: 0x0b3a22, emissiveIntensity: 0.5 }))
    put(leaf, -3.9, 1.1, 2.2, cg)
    put(box(0.4, 0.5, 0.4, 0x2a3558), -3.9, 0.75, 2.2, cg)
    root.add(cg)
    const ceoActor: Seatable = { seat: ceoSeat, fallback: ceoFallback, color: gold, ghost: false }

    // Oficina clara: se repintan los muebles con una paleta de día (blanco, madera, gris azulado).
    if (bright) {
      const LIGHT: Record<number, number> = {
        0x2a3558: 0xf2f4f8, 0x1c2440: 0xdde2ea, 0x151c34: 0x6f7a90, 0x0c1226: 0x7a8499,
        0x1b2446: 0xc8a770, 0x141c38: 0xcfd6e2, 0x0d1328: 0xc9d7e8, 0x232d4c: 0xdbe3ee, 0x4a3b2a: 0xc8a770,
      }
      scene.traverse((o) => {
        const mt = (o as THREE.Mesh).material
        if (mt instanceof THREE.MeshStandardMaterial) {
          const to = LIGHT[mt.color.getHex()]
          if (to !== undefined) mt.color.setHex(to)
        }
      })
    }

    // Robots animados (cuando el modelo carga reemplazan a las figuras simples)
    loadRobot().then((tpl) => {
      if (disposed || !tpl) return
      actors.forEach((o) => seatRobot(o, tpl))
      seatRobot(ceoActor, tpl, true)
      ceoActor.robot?.position.set(0, ceoActor.robot.position.y, 0)
      playClip(ceoActor, 'Sitting')
    })

    // Líneas de datos: el trabajo viaja entre agentes y termina en el escritorio del CEO
    const deskPos = new Map(actors.map((o) => [o.id, o.wrap.position]))
    const ceoTarget = new THREE.Vector3(plan.ceo.x, 1.8, plan.ceo.z - 1)
    interface Pulse { cv: THREE.QuadraticBezierCurve3; line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; ball: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; from: Actor; kind: 'flow' | 'alert'; off: number }
    const pulses: Pulse[] = []
    const link = (fromId: string, to: THREE.Vector3, color: number, lift: number, kind: 'flow' | 'alert') => {
      const from = actors.find((a) => a.id === fromId)
      const p = deskPos.get(fromId)
      if (!from || !p) return
      const p0 = new THREE.Vector3(p.x, 1.8, p.z)
      const mid = p0.clone().add(to).multiplyScalar(0.5)
      mid.y += lift
      const cvv = new THREE.QuadraticBezierCurve3(p0, mid, to)
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cvv.getPoints(40)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.15 }))
      scene.add(line)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshBasicMaterial({ color }))
      scene.add(ball)
      pulses.push({ cv: cvv, line, ball, from, kind, off: Math.random() })
    }
    plan.zones.forEach((z) => {
      const find = (suffix: string) => z.dept.agents.find((a) => a.id.endsWith(`-${suffix}`))
      const r = find('research'), w = find('writer'), c = find('checker'), an = find('analyst')
      if (r && w) link(r.id, deskPos.get(w.id) ?? ceoTarget, 0x4fb6d9, 1.2, 'flow')
      if (w && c) link(w.id, deskPos.get(c.id) ?? ceoTarget, 0xb58cff, 1.2, 'flow')
      if (c) link(c.id, ceoTarget, 0xf2b84b, 3, 'flow')
      if (an) link(an.id, ceoTarget, 0xf0645c, 4, 'flow')
      if (z.dept.kind === 'monitoring') z.dept.agents.forEach((a, i) => link(a.id, ceoTarget, 0xf0645c, 4 + i * 0.5, 'alert'))
    })

    // Holograma del agente elegido
    const hcv = document.createElement('canvas')
    hcv.width = 512
    hcv.height = 256
    const htex = new THREE.CanvasTexture(hcv)
    const holo = new THREE.Sprite(new THREE.SpriteMaterial({ map: htex, transparent: true, depthWrite: false, depthTest: false }))
    holo.scale.set(4.4, 2.2, 1)
    holo.renderOrder = 10
    scene.add(holo)
    let holoKey = ''
    const paintHolo = (a: OfficeAgent, s: AgentStatus) => {
      const key = `${a.id}|${s}|${a.lastReport}`
      if (holoKey === key) return
      holoKey = key
      const g = hcv.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, 512, 256)
      g.fillStyle = 'rgba(8,14,34,.82)'
      g.fillRect(8, 8, 496, 240)
      g.strokeStyle = a.color
      g.lineWidth = 3
      g.strokeRect(8, 8, 496, 240)
      g.fillStyle = a.color
      g.fillRect(8, 8, 8, 240)
      for (let y = 14; y < 242; y += 6) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(16, y, 480, 2) }
      g.fillStyle = '#fff'
      g.font = '800 30px sans-serif'
      g.fillText(a.name.replace(' (próximamente)', ''), 34, 56)
      g.fillStyle = '#8d9ac0'
      g.font = '500 20px sans-serif'
      g.fillText(a.role.slice(0, 44), 34, 84)
      g.fillStyle = s === 'work' ? '#4fd18b' : s === 'alert' ? '#f0645c' : '#8d9ac0'
      g.font = '700 20px sans-serif'
      g.fillText(s === 'work' ? '● Trabajando' : s === 'alert' ? '● Necesita atención' : s === 'ghost' ? '● Puesto libre' : '● Fuera de horario', 34, 120)
      g.fillStyle = '#cdd5ea'
      g.font = '500 19px sans-serif'
      wrapText(g, s === 'work' && a.doing ? a.doing : a.lastReport, 34, 156, 440, 26, 3)
      htex.needsUpdate = true
    }

    // Pantalla central del CEO
    let screenKey = ''
    const drawScreen = (c: CeoStats, m: number) => {
      const key = `${c.pending}|${c.problems}|${c.working}|${Math.floor(m / 5)}`
      if (key === screenKey) return
      screenKey = key
      const g = cv.getContext('2d')
      if (!g) return
      const W = cv.width, H = cv.height
      const grd = g.createLinearGradient(0, 0, W, H)
      grd.addColorStop(0, '#0a1330')
      grd.addColorStop(1, '#10143a')
      g.fillStyle = grd
      g.fillRect(0, 0, W, H)
      g.strokeStyle = 'rgba(214,179,90,.7)'
      g.lineWidth = 3
      g.strokeRect(6, 6, W - 12, H - 12)
      g.fillStyle = '#d6b35a'
      g.font = '700 22px monospace'
      g.fillText('CENTRO DE MANDO · CEO', 28, 44)
      g.fillStyle = '#8d9ac0'
      g.font = '500 20px monospace'
      g.fillText(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`, W - 110, 44)
      const items: [string, number, string][] = [['POR APROBAR', c.pending, '#f2b84b'], ['CON PROBLEMAS', c.problems, '#f0645c'], ['TRABAJANDO', c.working, '#4fd18b']]
      items.forEach((it, i) => {
        const x = 28 + i * 242
        g.fillStyle = 'rgba(255,255,255,.04)'
        g.fillRect(x, 80, 226, 200)
        g.fillStyle = it[2]
        g.font = '800 96px sans-serif'
        g.fillText(String(it[1]), x + 18, 190)
        g.fillStyle = '#cdd5ea'
        g.font = '700 16px sans-serif'
        g.fillText(it[0], x + 18, 240)
      })
      g.fillStyle = c.problems ? '#f0645c' : '#4fd18b'
      g.font = '600 20px monospace'
      g.fillText(c.problems ? '● Hay agentes que necesitan atención' : '● Todo el sistema funciona bien', 28, 330)
      tex.needsUpdate = true
    }

    // Cámara orbitable con foco suave
    const focusOf = (k: string) => {
      if (k === 'ceo') return { tx: plan.ceo.x, tz: plan.ceo.z - 1, span: 20 }
      const z = plan.zones.find((q) => q.dept.id === k)
      if (z) return { tx: z.cx, tz: z.cz, span: Math.max(z.w, z.d) * 1.35 + 8 }
      return { tx: fcx, tz: fcz, span: Math.max(fw, fd) + Math.min(fw, fd) * 0.5 }
    }
    let yaw = (Math.PI * 5) / 4 // se mira desde el lado en que los agentes dan la cara
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
    const place = (el: HTMLElement | null, x: number, y: number, z: number) => {
      if (!el) return
      const p = project(x, y, z)
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      el.style.display = p.back ? 'none' : 'flex'
    }

    // Etiquetas sin pisarse: se acomodan de mayor a menor prioridad y las que chocan suben un poco.
    // La posición se suaviza para que no salten al girar la cámara.
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
        const w = it.el.offsetWidth || 90
        const h = 22
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

    const clock = new THREE.Clock()
    let raf = 0
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, clock.getDelta())
      const time = t / 1000
      const { statusOf: st, minutes: m, selectedId: sel, focus: fcs, ceo: cs } = live.current

      // Día y noche según la hora del reloj
      const day = bright ? 1 : Math.max(0, Math.sin((Math.PI * (m - 360)) / 720))
      const night = 1 - day
      if (!bright) {
        scene.background = (scene.background as THREE.Color).setRGB(0.027 + day * 0.07, 0.043 + day * 0.1, 0.086 + day * 0.2)
        hemi.intensity = 0.38 + day * 0.5
        sun.intensity = 0.22 + day * 0.75
      } else sun.intensity = 0.7
      zoneLines.forEach((l) => { l.material.opacity = 0.55 + night * 0.4 })
      windows.forEach((w) => { w.visible = bright ? true : night > 0.25 ? Math.sin(w.userData.id * 9.7) > -0.3 + (1 - night) : Math.sin(w.userData.id * 3.3) > 0.85 })

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
        const working = s === 'work'
        const sleeping = s === 'sleep'
        o.mixer?.update(dt)
        if (o.robot) {
          // Trabaja: sentado y activo; descansa: sentado y quieto; alerta: se levanta y pide ayuda.
          if (s === 'alert') playClip(o, 'Wave', 1.1)
          else { playClip(o, 'Sitting', working ? 0.6 : 0.12); o.robot.rotation.x = sleeping ? 0.12 : 0 }
        } else {
          o.fallback.position.y = working ? Math.sin(time * 9) * 0.015 : 0
        }
        o.glow.material.opacity = working ? 0.6 + Math.sin(time * 6) * 0.15 : s === 'alert' ? 0.4 : 0
        o.glow.material.color.setHex(s === 'alert' ? 0xf0645c : o.color)
        o.lamp.material.color.setHex(working ? 0x4fd18b : s === 'alert' ? (Math.sin(time * 8) > 0 ? 0xf0645c : 0x5a1d1a) : 0x5a6483)
        o.zz.visible = sleeping
        o.zz.position.y = 1.95 + Math.sin(time * 2) * 0.06
        o.ex.visible = s === 'alert'
        o.ex.position.y = 2.1 + Math.abs(Math.sin(time * 6)) * 0.1
        const el = labelRefs.current[o.id]
        if (el) {
          pushLabel(el, o.wrap.position.x, 2.5, o.wrap.position.z + 0.95, sel === o.id ? 0 : s === 'alert' ? 1 : s === 'work' ? 2 : s === 'sleep' ? 3 : 4)
          el.dataset.status = s
          el.dataset.sel = sel === o.id ? '1' : '0'
          el.style.opacity = fcs === 'all' || fcs === o.deptId ? '' : '0.4'
        }
      })
      // CEO
      if (ceoActor.mixer) { ceoActor.mixer.update(dt) }
      crown.position.y = 2.55 + Math.sin(time * 2) * 0.03
      const ceoEl = labelRefs.current.ceo
      if (ceoEl) { pushLabel(ceoEl, plan.ceo.x, 3.9, plan.ceo.z + 1.5, 1); ceoEl.dataset.sel = sel === 'ceo' ? '1' : '0' }
      flushLabels()
      plan.zones.forEach((z) => {
        const el = zoneRefs.current[z.dept.id]
        if (!el) return
        place(el, z.cx, 0.2, z.cz + z.d / 2 + 0.9)
        el.style.opacity = fcs === 'all' || fcs === z.dept.id ? '1' : '0.35'
      })
      drawScreen(cs, m)

      sweep.rotation.z = -time * 1.4
      ringMat.opacity = 0.45 + Math.sin(time * 2) * 0.15
      edges.forEach((e) => { (e.material as THREE.MeshBasicMaterial).color.setHex(night > 0.5 ? 0x5ad7ff : 0x3a9cc0) })
      pulses.forEach((pl) => {
        const s = st(pl.from.id)
        const on = pl.kind === 'alert' ? s === 'alert' : s === 'work'
        pl.line.material.opacity = on ? 0.75 : 0.1
        if (pl.kind === 'alert') pl.line.material.color.setHex(0xf0645c)
        pl.ball.visible = on
        if (on) pl.ball.position.copy(pl.cv.getPoint((time * 0.45 + pl.off) % 1))
      })

      const selActor = actors.find((a) => a.id === sel)
      if (selActor) {
        paintHolo(selActor.a, st(selActor.id))
        holo.visible = true
        holo.position.set(selActor.wrap.position.x, 4.1 + Math.sin(time * 1.6) * 0.08, selActor.wrap.position.z + 0.95)
      } else holo.visible = false

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      actors.forEach((o) => o.mixer?.stopAllAction())
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

  return (
    <div ref={hostRef} className="relative h-full w-full overflow-hidden rounded-xl bg-[#070b16]">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-grab touch-none active:cursor-grabbing" aria-label="Sala de control 3D con las zonas de cada departamento y la oficina del CEO" />
      <div className="pointer-events-none absolute inset-0">
        {departments.map((d) => (
          <div
            key={`zone-${d.id}`}
            ref={(el) => { zoneRefs.current[d.id] = el }}
            className="absolute hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.22em] md:flex"
            style={bright ? { color: d.accent, filter: 'brightness(0.62)', textShadow: '0 0 6px #fff, 0 0 10px #fff' } : { color: d.accent, textShadow: `0 0 12px ${d.accent}` }}
          >
            {d.name}
          </div>
        ))}
        {departments.flatMap((d) => d.agents.map((a) => (
          <button
            key={a.id}
            ref={(el) => { labelRefs.current[a.id] = el }}
            type="button"
            onClick={() => onSelect(a.id, d.id)}
            className="office-label pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-700 bg-[#0d1220]/90 py-0.5 pl-2 pr-2.5 text-[11px] font-bold text-zinc-100 data-[sel='1']:border-cyan-300 data-[sel='1']:shadow-[0_0_12px_-2px_#5ad7ff]"
          >
            <span className="office-dot h-2 w-2 rounded-full bg-zinc-500" />
            {a.name.replace(' (próximamente)', '')}
          </button>
        )))}
        <button
          ref={(el) => { labelRefs.current.ceo = el }}
          type="button"
          onClick={() => onSelect('ceo', null)}
          className="office-label pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/60 bg-[#0d1220]/90 py-0.5 pl-2 pr-2.5 text-[11px] font-bold text-amber-200 data-[sel='1']:border-amber-200"
        >
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Tú · CEO
        </button>
      </div>
    </div>
  )
}
