'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AgentStatus, OfficeDepartment } from '@/lib/office'

interface Props {
  department: OfficeDepartment
  selectedId: string | null
  /** Estado que se muestra de cada agente (real, o el de la demostración). */
  statusOf: (agentId: string) => AgentStatus
  /** Hora simulada o real, en minutos desde 00:00, para el reloj de la pared. */
  minutes: number
  /** Papeles en el escritorio del dueño. */
  papers: number
  onSelect: (agentId: string) => void
}

interface Actor {
  id: string
  wrap: THREE.Group
  body: THREE.Mesh
  head: THREE.Mesh
  armL: THREE.Mesh
  armR: THREE.Mesh
  zz: THREE.Sprite
  ex: THREE.Sprite
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  color: number
}

const SPACING_X = 3.0
const SPACING_Z = 3.8
const FIRST_ROW_Z = -2.6

function layout(n: number) {
  const cols = n <= 4 ? Math.max(1, n) : n <= 6 ? 3 : 4
  const rows = Math.ceil(n / cols)
  const width = Math.max(12, cols * SPACING_X + 4)
  const backZ = FIRST_ROW_Z - 2.6
  const depth = Math.max(8.5, rows * SPACING_Z + 4.2)
  return { cols, rows, width, depth, backZ }
}

const mat = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.05, ...o })
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
function sprite(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  if (g) {
    g.font = '800 84px sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = color
    g.fillText(text, 64, 70)
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  s.scale.set(0.9, 0.9, 1)
  return s
}
const hex = (s: string) => parseInt(s.replace('#', ''), 16)

function buildAgent(id: string, color: number, ghost: boolean, x: number, z: number): Actor {
  const wood = ghost ? 0x2a3350 : 0x3a4468
  const desk = new THREE.Group()
  put(box(2.0, 0.12, 1.0, wood), 0, 0.78, 0, desk)
  ;[[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]].forEach((p) => put(box(0.1, 0.78, 0.1, 0x252d49), p[0], 0.39, p[1], desk))
  put(box(0.9, 0.55, 0.06, 0x0b1020), 0, 1.3, -0.25, desk)
  put(box(0.1, 0.25, 0.1, 0x252d49), 0, 0.95, -0.25, desk)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }))
  put(glow, 0, 1.3, -0.215, desk)
  put(box(0.7, 0.04, 0.26, 0x1c2339), 0, 0.86, 0.2, desk)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0x5a6483 }))
  put(lamp, 0.8, 0.9, -0.3, desk)
  put(box(0.5, 0.06, 0.5, 0x252d49), 0, 0.5, 0.95, desk)
  put(box(0.5, 0.5, 0.06, 0x252d49), 0, 0.8, 1.2, desk)

  const fade = ghost ? { transparent: true, opacity: 0.35 } : {}
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.62, 16), mat(ghost ? 0x4a5370 : color, fade))
  body.castShadow = true
  put(body, 0, 0.95, 0.9, desk)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 18), mat(ghost ? 0x4a5370 : 0xf1d3b8, fade))
  head.castShadow = true
  put(head, 0, 1.5, 0.9, desk)
  const armL = put(box(0.1, 0.1, 0.5, ghost ? 0x4a5370 : color, fade), -0.22, 1.1, 0.62, desk)
  const armR = put(box(0.1, 0.1, 0.5, ghost ? 0x4a5370 : color, fade), 0.22, 1.1, 0.62, desk)
  const zz = put(sprite('z', '#94a0bf'), 0.25, 1.95, 0.9, desk)
  const ex = put(sprite('!', '#f0645c'), 0, 2.0, 0.9, desk)
  ex.visible = false
  const wrap = new THREE.Group()
  wrap.add(desk)
  wrap.position.set(x, 0, z)
  return { id, wrap, body, head, armL, armR, zz, ex, glow, lamp, color }
}

export function OfficeScene({ department, selectedId, statusOf, minutes, papers, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  // Valores que cambian seguido viven en un ref para no reconstruir la escena.
  const live = useRef({ statusOf, minutes, selectedId })
  live.current = { statusOf, minutes, selectedId }
  const apiRef = useRef<{ setPapers: (n: number) => void } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0f1c)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)

    scene.add(new THREE.HemisphereLight(0x9bb2ff, 0x1a2036, 0.75))
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.85)
    sun.position.set(6, 12, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 })
    scene.add(sun)

    const accent = hex(department.accent)
    const n = department.agents.length
    const L = layout(n)
    const centerZ = L.backZ + L.depth / 2
    const root = new THREE.Group()
    scene.add(root)

    // Suelo, paredes, alfombra
    put(box(L.width, 0.2, L.depth, 0x1d2540), 0, -0.1, centerZ, root)
    const rug = box(L.cols * SPACING_X + 1, 0.02, L.rows * SPACING_Z - 0.4, 0x242f55)
    rug.material.color.set(accent).multiplyScalar(0.28)
    put(rug, 0, 0.01, FIRST_ROW_Z + 1.6 + (L.rows - 1) * SPACING_Z / 2, root)
    put(box(L.width, 3.6, 0.2, 0x2a3558), 0, 1.8, L.backZ, root)
    put(box(0.2, 3.6, L.depth, 0x232d4c), -L.width / 2, 1.8, centerZ, root)
    const wins = Math.max(2, Math.floor(L.width / 4.2))
    for (let i = 0; i < wins; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ color: 0x2c4a85 }))
      put(w, (i - (wins - 1) / 2) * 4.2, 2.1, L.backZ + 0.11, root)
    }
    // Reloj
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: 0xe8ecf6 }))
    put(clock, L.width / 2 - 1.6, 2.9, L.backZ + 0.12, root)
    const hand = (len: number, w: number) => {
      const m = box(w, len, 0.02, 0x0d1220)
      m.castShadow = false
      m.geometry.translate(0, len / 2, 0)
      return put(m, L.width / 2 - 1.6, 2.9, L.backZ + 0.16, root)
    }
    const hourHand = hand(0.22, 0.04)
    const minHand = hand(0.34, 0.03)
    // Letrero del departamento
    const signCv = document.createElement('canvas')
    signCv.width = 1024
    signCv.height = 192
    const sg = signCv.getContext('2d')
    if (sg) {
      sg.fillStyle = department.accent
      sg.fillRect(0, 36, 14, 120)
      sg.font = '800 92px system-ui, sans-serif'
      sg.textBaseline = 'middle'
      sg.fillStyle = '#e8ecf6'
      sg.fillText(department.name.length > 22 ? `${department.name.slice(0, 21)}…` : department.name, 40, 78)
      sg.font = '600 40px system-ui, sans-serif'
      sg.fillStyle = department.accent
      sg.fillText(department.kind === 'marketing' ? 'Departamento de marketing' : department.kind === 'monitoring' ? 'Departamento de monitoreo' : 'Dirección', 42, 150)
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 0.69), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCv), transparent: true }))
    put(sign, -L.width / 2 + 2.6, 3.2, L.backZ + 0.11, root)

    // Agentes
    const actors: Actor[] = department.agents.map((a, i) => {
      const r = Math.floor(i / L.cols)
      const inRow = Math.min(L.cols, n - r * L.cols)
      const c = i % L.cols
      const x = (c - (inRow - 1) / 2) * SPACING_X
      const z = FIRST_ROW_Z + r * SPACING_Z
      const actor = buildAgent(a.id, hex(a.color), a.status === 'ghost', x, z)
      root.add(actor.wrap)
      return actor
    })

    // Escritorio del dueño con la pila de papeles
    const boss = new THREE.Group()
    put(box(2.4, 0.12, 1.1, 0x4a3b2a), 0, 0.78, 0, boss)
    ;[[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]].forEach((p) => put(box(0.1, 0.78, 0.1, 0x2d2419), p[0], 0.39, p[1], boss))
    const stack = new THREE.Group()
    put(stack, 0.55, 0.84, 0.05, boss)
    put(box(0.3, 0.3, 0.3, 0x6b4a33), 1.0, 0.99, -0.3, boss)
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), mat(0x2f9e63))
    leaf.castShadow = true
    put(leaf, 1.0, 1.3, -0.3, boss)
    put(box(0.5, 0.35, 0.06, 0x0b1020), -0.1, 1.15, -0.2, boss)
    const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.66, 16), mat(0xe8ecf6))
    bBody.castShadow = true
    put(bBody, 0, 0.98, 0.95, boss)
    const bHead = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 18), mat(0xf1d3b8))
    bHead.castShadow = true
    put(bHead, 0, 1.56, 0.95, boss)
    put(box(0.55, 0.06, 0.55, 0x2d2419), 0, 0.5, 0.95, boss)
    const bossWrap = new THREE.Group()
    bossWrap.add(boss)
    bossWrap.rotation.y = Math.PI
    put(bossWrap, -L.width / 2 + 3, 0, L.backZ + L.depth - 2.2, root)

    const setPapers = (count: number) => {
      while (stack.children.length) stack.remove(stack.children[0])
      for (let i = 0; i < Math.min(count, 12); i++) {
        const p = box(0.5, 0.025, 0.36, 0xf4f1ea)
        p.position.set((i % 2) * 0.012, 0.0125 + i * 0.027, (i % 3) * 0.01)
        p.rotation.y = ((i * 0.37) % 0.4) - 0.2
        stack.add(p)
      }
    }
    setPapers(papers)
    apiRef.current = { setPapers }

    // Cámara orbitable
    let yaw = Math.PI / 4
    let pitch = 0.62
    let zoom = 1
    const pts = new Map<number, [number, number]>()
    let drag: { x: number; y: number } | null = null
    let pinch = 0
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, [e.clientX, e.clientY])
      drag = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, [e.clientX, e.clientY])
      const v = Array.from(pts.values())
      if (v.length === 2) {
        const d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1])
        if (pinch) zoom = Math.max(0.6, Math.min(2.2, (zoom * d) / pinch))
        pinch = d
        return
      }
      if (!drag) return
      yaw -= (e.clientX - drag.x) * 0.006
      pitch = Math.max(0.35, Math.min(1.1, pitch + (e.clientY - drag.y) * 0.004))
      drag = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      pinch = 0
      drag = null
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom = Math.max(0.6, Math.min(2.2, zoom * (e.deltaY < 0 ? 1.08 : 0.92)))
    }
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
    let raf = 0
    let last = performance.now()
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      const time = t / 1000
      // Encuadre automático: el cuarto entero cabe a lo alto y a lo ancho, sea chico o grande.
      const span = L.width + L.depth
      const viewH = Math.max(span * 0.5 + 1.5, (span * 0.76) / aspect) / zoom
      camera.left = (-viewH * aspect) / 2
      camera.right = (viewH * aspect) / 2
      camera.top = viewH / 2
      camera.bottom = -viewH / 2
      camera.updateProjectionMatrix()
      const R = 26
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * R, Math.sin(pitch) * R, centerZ + Math.cos(yaw) * Math.cos(pitch) * R)
      camera.lookAt(0, 0.8, centerZ + 0.2)

      const { statusOf: st, minutes: m, selectedId: sel } = live.current
      actors.forEach((o) => {
        const s = st(o.id)
        const working = s === 'work'
        const sleeping = s === 'sleep'
        const bob = working ? Math.sin(time * 9) * 0.015 : 0
        o.body.position.y = 0.95 + bob
        o.head.position.y = (sleeping ? 1.42 : 1.5) + bob
        o.head.rotation.x = sleeping ? 0.5 : 0
        o.armL.position.y = 1.1 + (working ? Math.sin(time * 14) * 0.03 : 0)
        o.armR.position.y = 1.1 + (working ? Math.sin(time * 14 + 2) * 0.03 : 0)
        o.glow.material.opacity = working ? 0.55 + Math.sin(time * 6) * 0.15 : s === 'alert' ? 0.35 : 0
        o.glow.material.color.setHex(s === 'alert' ? 0xf0645c : o.color)
        o.lamp.material.color.setHex(s === 'work' ? 0x4fd18b : s === 'alert' ? (Math.sin(time * 8) > 0 ? 0xf0645c : 0x5a1d1a) : 0x5a6483)
        o.zz.visible = sleeping
        o.zz.position.y = 1.95 + Math.sin(time * 2) * 0.06
        o.ex.visible = s === 'alert'
        o.ex.position.y = 2.0 + Math.abs(Math.sin(time * 6)) * 0.1
        // Etiqueta
        const el = labelRefs.current[o.id]
        if (el) {
          o.wrap.getWorldPosition(tmp)
          tmp.y += 2.3
          tmp.project(camera)
          el.style.left = `${(tmp.x * 0.5 + 0.5) * host.clientWidth}px`
          el.style.top = `${(-tmp.y * 0.5 + 0.5) * host.clientHeight}px`
          el.style.display = tmp.z > 1 ? 'none' : 'flex'
          el.dataset.status = s
          el.dataset.sel = sel === o.id ? '1' : '0'
        }
      })
      minHand.rotation.z = -((m % 60) / 60) * Math.PI * 2
      hourHand.rotation.z = -(((m / 60) % 12) / 12) * Math.PI * 2
      void dt
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
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
        const mt = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose())
        else mt?.dispose?.()
      })
      renderer.dispose()
      apiRef.current = null
    }
    // La escena se reconstruye solo al cambiar de departamento o de cantidad de agentes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department.id, department.agents.length, department.name, department.accent])

  useEffect(() => { apiRef.current?.setPapers(papers) }, [papers, department.id])

  return (
    <div ref={hostRef} className="relative h-full w-full overflow-hidden rounded-xl bg-[#0a0f1c]">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-grab touch-none active:cursor-grabbing" aria-label={`Oficina 3D: ${department.name}`} />
      <div className="pointer-events-none absolute inset-0">
        {department.agents.map((a) => (
          <button
            key={a.id}
            ref={(el) => { labelRefs.current[a.id] = el }}
            type="button"
            onClick={() => onSelect(a.id)}
            className="office-label pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-700 bg-[#0d1220]/90 py-0.5 pl-2 pr-2.5 text-[11px] font-bold text-zinc-100 data-[sel='1']:border-zinc-100"
          >
            <span className="office-dot h-2 w-2 rounded-full bg-zinc-500" />
            {a.name}
          </button>
        ))}
      </div>
    </div>
  )
}
