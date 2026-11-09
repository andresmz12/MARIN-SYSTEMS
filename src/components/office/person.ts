import * as THREE from 'three'

// Personas de bajo polígono, construidas con código: cada una con su tono de piel, peinado y ropa.
// Pueden estar sentadas (teclean, descansan, piden ayuda, se estiran, toman café) o de pie y
// caminando: las piernas tienen cadera y rodilla propias.

export interface PersonSpec {
  skin: number
  hair: number
  hairStyle: 'short' | 'long' | 'bun' | 'cap' | 'wavy' | 'ponytail'
  shirt: number
  pants: number
  female?: boolean
  /** Prenda de arriba/abajo: camiseta, polo, camisa, blusa, falda (con blusa) o vestido. */
  outfit?: 'tee' | 'polo' | 'shirt' | 'blouse' | 'skirt' | 'dress'
  skirt?: number
  shoe?: number
  eye?: number
  lip?: number
  beard?: 'full' | 'goatee' | 'stubble' | 'none'
  glasses?: boolean
  tights?: boolean
  /** Color del departamento: sale en el carné con cordón. */
  badge?: number
  /** Delantal (bartender). */
  apron?: boolean
  /** Traje: saco oscuro, camisa blanca y corbata (el CEO). */
  suit?: { jacket: number; tie: number }
  scale: number
  ghost: boolean
}

export type PersonPose = 'type' | 'rest' | 'lounge' | 'help' | 'idle' | 'walk' | 'stand' | 'coffee' | 'deliver' | 'wave' | 'play' | 'dance' | 'dj' | 'bartend' | 'barsit' | 'dancepair'

interface Arm {
  shoulder: THREE.Group
  elbow: THREE.Group
  hand: THREE.Object3D
}
interface Leg {
  hip: THREE.Group
  knee: THREE.Group
}
export interface Person {
  group: THREE.Group
  hips: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  armL: Arm
  armR: Arm
  legL: Leg
  legR: Leg
  cup: THREE.Object3D
  paper: THREE.Mesh
  snack: THREE.Object3D
  phone: THREE.Object3D
  mouth: THREE.Object3D
  eyes: THREE.Object3D[]
  seed: number
  /** 0 = sentada, 1 = de pie (se suaviza sola). */
  stance: number
  /** Fase del paso al caminar, en radianes. */
  phase: number
}

const SKINS = [0xf6d3b3, 0xf1c9a5, 0xe8b990, 0xe0ac86, 0xd09a74, 0xb9825c, 0x9a6a47]
const HAIRS = [0x1d1612, 0x2c2018, 0x4a3424, 0x5c4129, 0x6b4a2b, 0x9a6a3a, 0xb08a4f, 0xd8b27a, 0x7a3b24]
const PANTS = [0x2b3144, 0x3a3f52, 0x232733, 0x4a4036, 0x3b5b8c, 0xb59a6a, 0x5a5f6b]
const TOPS = [0xffffff, 0xf2e9d8, 0x4a7ab5, 0xe07a5f, 0x81b29a, 0xf2cc8f, 0x9aa5b1, 0xb56576, 0x3d405b, 0x7a9e7e]
const SKIRTS = [0x2f3b5c, 0x7a3b3b, 0x3b6b5b, 0x1f1f24, 0xc9b79c, 0x5b4a8a, 0xb56576]
const SHOES = [0x14151b, 0xf1f1f1, 0x5a3a28, 0xc0392b, 0x2f3b5c]
const EYES = [0x3b2a1e, 0x4a6b3a, 0x3b6ea5, 0x5a3b2a, 0x2a2118]
const LIPS = [0xc2455a, 0xa8324a, 0xd9707a, 0x9b2f45]
const DRINKS = [0xff6b6b, 0x4dd0e1, 0xffd54f, 0x9ccc65, 0xba68c8, 0xff9f43]
const SIT_Y = 0.6
const STAND_Y = 1.0

const FEMALE_NAMES = new Set(['maria', 'isabel', 'fernanda', 'samantha', 'angela', 'luisa', 'ana', 'sofia', 'laura', 'valeria', 'daniela', 'camila', 'carolina', 'paula', 'andrea', 'sara', 'lucia', 'natalia', 'diana', 'mariana', 'juliana', 'catalina', 'gabriela', 'valentina', 'paola', 'carmen', 'beatriz', 'raquel', 'ines', 'ruth', 'esther', 'monica', 'patricia', 'claudia', 'veronica', 'adriana', 'liliana', 'luz', 'rosa', 'angie', 'karen', 'lina', 'tatiana'])
const MALE_NAMES = new Set(['juan', 'felipe', 'tomas', 'alejandro', 'luis', 'jarvis', 'carlos', 'diego', 'pedro', 'mateo', 'camilo', 'andres', 'santiago', 'sebastian', 'david', 'daniel', 'jose', 'miguel', 'nicolas', 'jorge', 'oscar', 'ricardo', 'fernando', 'roberto', 'esteban', 'luca', 'joshua', 'andy'])
/** Mujer u hombre según el nombre (así María ya no sale con pelo de hombre). */
export function isFemaleName(name: string): boolean {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().split(/\s+/)[0] ?? ''
  if (FEMALE_NAMES.has(n)) return true
  if (MALE_NAMES.has(n)) return false
  return n.endsWith('a') || n.endsWith('el') && n.length > 4
}

function hashOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Rasgos estables por agente: la misma persona siempre se ve igual. */
export function specFor(id: string, shirt: number, ghost: boolean, name?: string): PersonSpec {
  const h = hashOf(id)
  const female = name ? isFemaleName(name) : ((h >>> 5) & 1) === 1
  const pick = <T,>(arr: T[], shift: number) => arr[(h >>> shift) % arr.length]
  const hairStyle: PersonSpec['hairStyle'] = female ? pick(['long', 'wavy', 'ponytail', 'bun', 'long', 'wavy'] as PersonSpec['hairStyle'][], 6) : pick(['short', 'short', 'cap', 'short'] as PersonSpec['hairStyle'][], 6)
  const outfit: PersonSpec['outfit'] = female ? pick(['blouse', 'skirt', 'dress', 'tee', 'skirt', 'blouse'] as PersonSpec['outfit'][], 18) : pick(['tee', 'polo', 'shirt', 'tee', 'polo'] as PersonSpec['outfit'][], 18)
  // Cada quien con ropa distinta: a veces el color de su área y otras uno de la paleta (el color del área queda en el carné).
  const top = (h >>> 15) % 5 < 2 ? shirt : pick(TOPS, 15)
  return {
    skin: pick(SKINS, 0),
    hair: pick(HAIRS, 3),
    hairStyle,
    shirt: top,
    pants: pick(PANTS, 9),
    scale: (female ? 0.94 : 0.98) + ((h >>> 12) % 9) / 100,
    ghost,
    female,
    outfit,
    skirt: pick(SKIRTS, 21),
    shoe: pick(SHOES, 24),
    eye: pick(EYES, 27),
    lip: pick(LIPS, 11),
    beard: female ? 'none' : pick(['full', 'goatee', 'stubble', 'full'] as NonNullable<PersonSpec['beard']>[], 21),
    glasses: false,
    tights: female && ((h >>> 2) % 3) === 0,
    badge: shirt,
  }
}

const fabricCache = new Map<number, THREE.CanvasTexture>()
/** Tela con rayas finas (cada traje con su color): le da aspecto de saco de verdad y no de bloque liso. */
function fabric(color: number): THREE.CanvasTexture {
  let t = fabricCache.get(color)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const g = c.getContext('2d')
  if (g) {
    const base = new THREE.Color(color)
    g.fillStyle = `#${base.getHexString()}`
    g.fillRect(0, 0, 32, 32)
    g.fillStyle = `#${base.clone().lerp(new THREE.Color(0xffffff), 0.14).getHexString()}`
    g.fillRect(7, 0, 1, 32)
    g.fillRect(23, 0, 1, 32)
  }
  t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 3)
  fabricCache.set(color, t)
  return t
}

const matCache = new Map<string, THREE.MeshStandardMaterial>()
function matFor(color: number, rough: number, cloth: boolean, alpha: number): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${cloth ? 1 : 0}|${alpha}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial(cloth ? { color: 0xffffff, map: fabric(color), roughness: rough, metalness: 0.02 } : { color, roughness: rough, metalness: 0.02 })
    if (alpha < 1) { m.transparent = true; m.opacity = alpha }
    matCache.set(key, m)
  }
  return m
}
const geoCache = new Map<string, THREE.BufferGeometry>()
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined
  if (!g) { g = make(); geoCache.set(key, g) }
  return g
}
function part(g: THREE.BufferGeometry, color: number, rough = 0.85, cloth = false, alpha = 1): THREE.Mesh {
  const m = new THREE.Mesh(g, matFor(color, rough, cloth, alpha))
  m.castShadow = true
  return m
}
const bx = (w: number, h: number, d: number) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d))
const cyl = (rt: number, rb: number, h: number, seg = 14) => geo(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
const ball = (r: number, ws = 14, hs = 10) => geo(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs))
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o }
const sc = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.scale.set(x, y, z); return o }
const rz = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.rotation.set(x, y, z); return o }

/** Mano con palma, cuatro dedos juntos y pulgar. */
function buildHand(side: 1 | -1, skin: number): THREE.Group {
  const h = new THREE.Group()
  h.scale.setScalar(1.18)
  h.add(at(part(bx(0.074, 0.075, 0.034), skin), 0, -0.035, 0))
  h.add(rz(at(part(bx(0.07, 0.055, 0.03), skin), 0, -0.095, 0.006), 0.25, 0, 0))
  h.add(rz(at(part(bx(0.022, 0.05, 0.026), skin), -side * 0.046, -0.05, 0.012), 0, 0, side * 0.5))
  return h
}

function buildArm(side: 1 | -1, sleeve: number, skin: number, suited: boolean, width: number, longSleeve: boolean): Arm {
  const shoulder = new THREE.Group()
  shoulder.position.set(side * width, 0.47, 0)
  shoulder.add(at(part(ball(0.066), sleeve, 0.85, suited), 0, 0, 0))
  shoulder.add(at(part(cyl(0.058, 0.05, 0.3), sleeve, 0.85, suited), 0, -0.15, 0))
  // Puño de la manga corta
  if (!suited && !longSleeve) shoulder.add(at(part(cyl(0.056, 0.056, 0.022), sleeve, 0.85), 0, -0.29, 0))
  const elbow = new THREE.Group()
  elbow.position.y = -0.3
  shoulder.add(elbow)
  const lower = suited || longSleeve ? sleeve : skin
  elbow.add(at(part(ball(0.051), lower, 0.85, suited), 0, 0, 0))
  elbow.add(at(part(cyl(0.049, 0.039, 0.26), lower, 0.85, suited), 0, -0.13, 0))
  if (suited || longSleeve) elbow.add(at(part(cyl(0.046, 0.046, 0.025), suited ? 0xf6f6f8 : sleeve), 0, -0.26, 0))
  const hand = buildHand(side, skin)
  hand.position.y = -0.285
  elbow.add(hand)
  return { shoulder, elbow, hand }
}

function buildLeg(side: 1 | -1, legColor: number, suited: boolean, shoe: number, dress: boolean): Leg {
  const hip = new THREE.Group()
  hip.position.set(side * 0.1, 0, 0)
  hip.add(at(part(ball(0.085), legColor, 0.85, suited), 0, 0, 0))
  hip.add(at(part(cyl(0.095, 0.078, 0.46), legColor, dress ? 0.5 : 0.85, suited), 0, -0.23, 0))
  const knee = new THREE.Group()
  knee.position.y = -0.46
  hip.add(knee)
  knee.add(at(part(ball(0.074), legColor, 0.85, suited), 0, 0, 0))
  knee.add(at(part(cyl(0.078, 0.058, 0.44), legColor, dress ? 0.5 : 0.85, suited), 0, -0.22, 0))
  // Tobillo, zapato con suela y puntera
  knee.add(at(part(ball(0.05), legColor), 0, -0.45, 0))
  const upper = sc(part(ball(1), shoe, suited ? 0.3 : 0.6), 0.07, 0.05, 0.14)
  knee.add(at(upper, 0, -0.482, 0.06))
  knee.add(at(part(bx(0.125, 0.022, 0.27), suited ? 0x0a0a0d : 0xe9e9e9, 0.9), 0, -0.508, 0.062))
  return { hip, knee }
}

/** Una persona de frente hacia +z, con los pies en y = 0 (sentada sobre una silla de 0.5, o de pie). */
export function buildPerson(spec: PersonSpec, seed = 1): Person {
  const g = new THREE.Group()
  const suit = spec.suit
  const female = !!spec.female
  const outfit = spec.outfit ?? 'tee'
  const dressy = outfit === 'skirt' || outfit === 'dress'
  const top = suit ? suit.jacket : spec.shirt
  const skin = spec.skin
  const shoulderX = female ? 0.225 : 0.245

  const hips = new THREE.Group()
  hips.position.y = SIT_Y
  g.add(hips)
  const legColor = dressy && !spec.tights ? skin : dressy ? 0x1b1b22 : spec.pants
  const pelvis = sc(part(cyl(female ? 0.205 : 0.2, 0.19, 0.18, 16), dressy ? (outfit === 'dress' ? top : spec.skirt ?? 0x2f3b5c) : spec.pants, 0.85, !!suit), 1, 1, 0.66)
  hips.add(pelvis)
  const legL = buildLeg(1, legColor, !!suit, spec.shoe ?? 0x14151b, dressy)
  const legR = buildLeg(-1, legColor, !!suit, spec.shoe ?? 0x14151b, dressy)
  hips.add(legL.hip, legR.hip)
  if (dressy) {
    // Falda o vestido: una campana que cae desde la cadera, con dobladillo
    const cloth = outfit === 'dress' ? top : spec.skirt ?? 0x2f3b5c
    hips.add(sc(at(part(cyl(0.19, 0.31, 0.34, 20), cloth, 0.8), 0, -0.16, 0), 1, 1, 0.8))
    hips.add(sc(at(part(cyl(0.312, 0.312, 0.02, 20), new THREE.Color(cloth).multiplyScalar(0.82).getHex(), 0.8), 0, -0.325, 0), 1, 1, 0.8))
    const pleat = new THREE.Color(cloth).multiplyScalar(0.88).getHex()
    for (let i = 0; i < 16; i++) {
      const pg = new THREE.Group()
      pg.rotation.y = (i / 16) * Math.PI * 2
      pg.scale.z = 0.8
      const rib = at(part(bx(0.014, 0.33, 0.02), pleat, 0.8), 0, -0.16, 0.253)
      rib.rotation.x = -0.34
      pg.add(rib)
      hips.add(pg)
    }
  }

  const torso = new THREE.Group()
  torso.position.set(0, 0.08, 0)
  hips.add(torso)
  const woman = female
  if (!suit) {
    const cw = female ? 0.19 : 0.215
    // Cintura y pecho por separado, para que no sea un cilindro
    torso.add(sc(at(part(cyl(cw * 0.88, cw * 0.82, 0.2, 18), top, 0.8), 0, 0.1, 0), 1, 1, 0.6))
    torso.add(sc(at(part(cyl(cw, cw * 0.88, 0.34, 18), top, 0.8), 0, 0.34, 0), 1, 1, female ? 0.6 : 0.64))
    torso.add(sc(at(part(ball(cw * 0.93, 16, 10), top, 0.8), 0, 0.5, 0), 1, 0.28, 0.6))
    // Cinturón (pantalón) o dobladillo
    if (!dressy && outfit !== 'tee') torso.add(at(part(bx(0.37, 0.03, 0.22), 0x14151b, 0.5), 0, -0.01, 0))
    // Cuello según la prenda
    if (outfit === 'polo' || outfit === 'shirt') {
      ;([1, -1] as const).forEach((sd) => torso.add(rz(at(part(bx(0.075, 0.04, 0.05), top, 0.8), sd * 0.048, 0.56, 0.085), 0, 0, sd * -0.5)))
      torso.add(at(part(bx(0.032, 0.2, 0.01), new THREE.Color(top).multiplyScalar(0.88).getHex(), 0.8), 0, 0.46, 0.137))
      ;[0.5, 0.42, 0.34].forEach((yy) => torso.add(at(part(ball(0.008), 0xf1f1f1), 0, yy, 0.143)))
    } else {
      torso.add(rz(at(part(new THREE.TorusGeometry(0.063, 0.013, 6, 16), new THREE.Color(top).multiplyScalar(0.85).getHex(), 0.8), 0, 0.555, 0.0), Math.PI / 2, 0, 0))
    }
    if (woman) {
      // Collar de perlas y aretes (los aretes van en la cabeza)
      for (let i = 0; i < 9; i++) {
        const an = (i / 8) * Math.PI
        torso.add(at(part(ball(0.012, 8, 6), 0xf3ece0, 0.4), Math.cos(an) * 0.07, 0.51 - Math.sin(an) * 0.05, 0.12))
      }
    }
    // Carné con cordón del color del área
    const lan = spec.badge ?? 0x4f8cff
    ;([1, -1] as const).forEach((sd) => torso.add(rz(at(part(bx(0.012, 0.3, 0.006), lan, 0.6), sd * 0.04, 0.4, 0.133), 0, 0, sd * 0.13)))
    torso.add(at(part(bx(0.075, 0.1, 0.008), 0xffffff, 0.5), 0, 0.22, 0.14))
    torso.add(at(part(bx(0.075, 0.025, 0.009), lan, 0.5), 0, 0.25, 0.141))
    if (spec.apron) {
      // Delantal negro de bartender con tirantes
      torso.add(at(part(bx(0.34, 0.5, 0.01), 0x17171c, 0.7), 0, 0.2, 0.15))
      ;([1, -1] as const).forEach((sd) => torso.add(at(part(bx(0.03, 0.34, 0.012), 0x17171c, 0.7), sd * 0.1, 0.5, 0.14)))
    }
  } else {
    const jacket = suit.jacket
    const dark = new THREE.Color(jacket).multiplyScalar(0.78).getHex()
    // Saco entallado: pecho amplio, cintura más angosta, faldón sobre la cadera y hombreras.
    torso.add(at(part(bx(0.44, 0.3, 0.27), jacket, 0.85, true), 0, 0.37, 0))
    torso.add(at(part(bx(0.4, 0.26, 0.25), jacket, 0.85, true), 0, 0.12, 0))
    torso.add(at(part(bx(0.45, 0.14, 0.285), jacket, 0.85, true), 0, -0.04, 0))
    ;([1, -1] as const).forEach((sd) => torso.add(at(part(bx(0.12, 0.07, 0.275), jacket, 0.85, true), sd * 0.2, 0.5, 0)))
    torso.add(at(part(bx(0.13, 0.4, 0.01), woman ? spec.shirt : 0xf4f4f6), 0, 0.31, 0.134))
    ;([1, -1] as const).forEach((sd) => {
      const col = at(part(bx(0.06, 0.05, 0.02), woman ? spec.shirt : 0xf8f8fa), sd * 0.045, 0.545, 0.128)
      col.rotation.z = sd * -0.35
      torso.add(col)
    })
    torso.add(at(part(bx(0.06, 0.05, 0.022), suit.tie, 0.5), 0, 0.5, 0.14))
    torso.add(at(part(bx(0.055, 0.3, 0.014), suit.tie, 0.5), 0, 0.33, 0.142))
    torso.add(at(part(bx(0.06, 0.03, 0.016), suit.tie, 0.5), 0, 0.17, 0.142))
    ;([1, -1] as const).forEach((sd) => {
      const l = at(part(bx(0.075, 0.34, 0.014), dark), sd * 0.105, 0.34, 0.136)
      l.rotation.z = sd * -0.3
      torso.add(l)
    })
    ;[0.2, 0.1].forEach((yy) => torso.add(at(part(bx(0.022, 0.022, 0.012), 0x14151b, 0.4), 0, yy, 0.139)))
    torso.add(at(part(bx(0.06, 0.04, 0.012), 0xf4f4f6), -0.14, 0.42, 0.139))
    torso.add(at(part(bx(0.41, 0.03, 0.26), 0x14151b, 0.5), 0, -0.1, 0))
    torso.add(at(part(bx(0.04, 0.03, 0.01), 0xc9a24a, 0.3), 0, -0.1, 0.133))
  }
  torso.add(at(part(cyl(0.052, 0.06, 0.15, 12), skin), 0, 0.575, 0))

  // ── Cabeza ──
  const head = new THREE.Group()
  head.position.set(0, 0.6, 0)
  torso.add(head)
  head.add(sc(at(part(ball(0.148, 20, 16), skin, 0.65), 0, 0.15, 0), 0.96, 1.06, 1))
  // Orejas
  ;([1, -1] as const).forEach((sd) => head.add(sc(at(part(ball(0.034, 8, 8), skin, 0.7), sd * 0.143, 0.15, -0.005), 0.55, 1, 0.8)))
  // Ojos: blanco, iris y pupila; cejas; nariz
  const eyeCol = spec.eye ?? 0x3b2a1e
  const eyeMeshes: THREE.Object3D[] = []
  ;([1, -1] as const).forEach((sd) => {
    const eyeW = sc(at(part(ball(0.03, 10, 8), 0xffffff, 0.35), sd * 0.054, 0.172, 0.126), 1, 0.8, 0.5)
    eyeMeshes.push(eyeW)
    head.add(eyeW)
    head.add(sc(at(part(ball(0.0195, 12, 10), eyeCol, 0.25), sd * 0.054, 0.172, 0.1375), 1, 1.05, 0.5))
    head.add(at(part(ball(0.008, 6, 6), 0x050506, 0.3), sd * 0.054, 0.172, 0.142))
    head.add(at(part(ball(0.004, 6, 6), 0xffffff, 0.2), sd * 0.058, 0.177, 0.145))
    // Ceja: más fina y arqueada en ellas, más gruesa en ellos
    head.add(rz(at(part(bx(female ? 0.05 : 0.058, female ? 0.009 : 0.016, 0.012), spec.hair, 0.9), sd * 0.057, female ? 0.208 : 0.205, 0.124), 0, 0, -sd * (female ? 0.16 : 0.06)))
    // Párpado y pestañas
    if (female) head.add(at(part(bx(0.046, 0.007, 0.01), 0x101012, 0.6), sd * 0.054, 0.192, 0.132))
    // Mejillas sonrojadas
    if (female) head.add(sc(at(part(ball(0.026, 8, 6), 0xf08a8a, 0.9, false, 0.45), sd * 0.09, 0.112, 0.108), 1, 0.7, 0.4))
  })
  head.add(sc(at(part(ball(0.02, 8, 8), new THREE.Color(skin).multiplyScalar(0.93).getHex(), 0.7), 0, 0.14, 0.145), 0.9, 1, 1))
  // Sonrisa suave y natural: labios y un arco apenas curvado, con comisuras marcadas
  const lip = female ? spec.lip ?? 0xc2455a : new THREE.Color(skin).multiplyScalar(0.62).getHex()
  const mouthMesh = sc(rz(at(part(new THREE.TorusGeometry(0.031, female ? 0.0085 : 0.0065, 8, 18, Math.PI * 0.8), lip, 0.45), 0, 0.114, 0.1415), 0, 0, Math.PI * 1.1), 1.05, 0.55, 1)
  head.add(mouthMesh)
  ;([1, -1] as const).forEach((sd) => head.add(at(part(ball(0.0055, 6, 6), new THREE.Color(skin).multiplyScalar(0.8).getHex(), 0.7), sd * 0.033, 0.1195, 0.1405)))

  // Barba (hombres) con el mismo color del pelo
  const hairCol = spec.hair
  if (!female && spec.beard && spec.beard !== 'none') {
    const bc = spec.beard === 'stubble' ? new THREE.Color(hairCol).lerp(new THREE.Color(skin), 0.55).getHex() : hairCol
    const R = spec.beard === 'stubble' ? 0.152 : 0.158
    const bsph = (ps: number, pl: number, ts: number, tl: number) => head.add(sc(at(part(new THREE.SphereGeometry(R, 16, 10, ps, pl, ts, tl), bc, 0.95), 0, 0.15, 0), 0.97, 1.05, 1.0))
    bsph(0, Math.PI * 2, Math.PI * 0.7, Math.PI * 0.3) // barbilla y mandíbula
    if (spec.beard !== 'goatee') {
      bsph(0, 1.05, Math.PI * 0.46, Math.PI * 0.26) // patilla izquierda
      bsph(Math.PI - 1.05, 1.05, Math.PI * 0.46, Math.PI * 0.26) // patilla derecha
    }
    if (spec.beard !== 'stubble') head.add(sc(at(part(ball(0.03, 8, 6), bc, 0.95), 0, 0.122, 0.142), 1.8, 0.45, 0.6)) // bigote
  }
  // Lentes
  if (spec.glasses) {
    ;([1, -1] as const).forEach((sd) => head.add(at(part(new THREE.TorusGeometry(0.036, 0.0045, 6, 18), 0x1a1a1f, 0.4), sd * 0.054, 0.172, 0.146)))
    head.add(at(part(bx(0.03, 0.006, 0.006), 0x1a1a1f, 0.4), 0, 0.176, 0.148))
    ;([1, -1] as const).forEach((sd) => head.add(at(part(bx(0.005, 0.005, 0.12), 0x1a1a1f, 0.4), sd * 0.093, 0.176, 0.085)))
  }
  // Aretes
  if (female) {
    ;([1, -1] as const).forEach((sd) => head.add(at(part(ball(0.013, 8, 6), 0xd4af37, 0.25), sd * 0.147, 0.115, 0.005)))
  }

  // Peinado
  const hp = (geoM: THREE.BufferGeometry, x: number, y: number, z: number, color = hairCol) => {
    const m = at(part(geoM, color, 0.6), x, y, z)
    head.add(m)
    return m
  }
  const hs = spec.hairStyle
  const capGeo = geo(`hcap${female}`, () => new THREE.SphereGeometry(0.158, 18, 14, 0, Math.PI * 2, 0, Math.PI * (female ? 0.5 : 0.46)))
  if (hs !== 'cap') {
    const cap = hp(capGeo, 0, 0.158, -0.01)
    cap.rotation.x = -0.28
    cap.scale.set(1.02, 1.04, 1.04)
    // Flequillo de lado (ellas) o copete peinado (ellos), redondeados
    if (female) {
      const f1 = hp(ball(0.1, 12, 8), 0.04, 0.252, 0.085)
      f1.scale.set(1.15, 0.36, 0.6)
      f1.rotation.set(0.45, 0, -0.2)
      const f2 = hp(ball(0.075, 10, 8), -0.075, 0.235, 0.1)
      f2.scale.set(1, 0.4, 0.55)
      f2.rotation.set(0.5, 0, 0.35)
    } else {
      const t1 = hp(ball(0.11, 12, 8), 0.01, 0.268, 0.07)
      t1.scale.set(1.1, 0.4, 0.75)
      t1.rotation.x = 0.35
    }
  }
  if (hs === 'short') {
    hp(bx(0.29, 0.13, 0.07), 0, 0.12, -0.115) // nuca
    ;([1, -1] as const).forEach((sd) => hp(bx(0.03, 0.1, 0.1), sd * 0.141, 0.19, -0.03)) // patillas altas
  } else if (hs === 'cap') {
    const capC = suit ? 0x1c2540 : top
    const cp = at(part(geo('ccap', () => new THREE.SphereGeometry(0.165, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), capC, 0.75), 0, 0.172, -0.005)
    cp.rotation.x = -0.12
    head.add(cp)
    head.add(rz(at(part(bx(0.22, 0.014, 0.12), capC, 0.75), 0, 0.185, 0.17), 0.12, 0, 0))
    hp(bx(0.29, 0.09, 0.07), 0, 0.1, -0.115)
  } else if (hs === 'long' || hs === 'wavy') {
    hp(bx(0.33, 0.5, 0.09), 0, -0.02, -0.105) // cortina de atrás hasta los hombros
    ;([1, -1] as const).forEach((sd) => {
      hp(bx(0.05, 0.42, 0.16), sd * 0.152, 0.0, -0.01) // mechones a los lados
      hp(bx(0.04, 0.2, 0.05), sd * 0.13, 0.12, 0.085).rotation.z = sd * 0.15 // por delante de la oreja
    })
    if (hs === 'wavy') {
      ;[-0.1, 0, 0.1].forEach((x) => hp(ball(0.05, 8, 6), x, -0.26, -0.105))
      ;([1, -1] as const).forEach((sd) => { hp(ball(0.045, 8, 6), sd * 0.152, -0.2, -0.01); hp(ball(0.04, 8, 6), sd * 0.152, -0.12, 0.05) })
    }
  } else if (hs === 'ponytail') {
    hp(ball(0.05, 10, 8), 0, 0.24, -0.16)
    const tail = hp(cyl(0.05, 0.02, 0.36, 8), 0, 0.02, -0.22)
    tail.rotation.x = 0.18
    hp(new THREE.TorusGeometry(0.045, 0.01, 6, 12), 0, 0.22, -0.165, 0xc0392b).rotation.x = Math.PI / 2
    hp(bx(0.3, 0.1, 0.06), 0, 0.13, -0.12)
  } else if (hs === 'bun') {
    hp(ball(0.085, 12, 10), 0, 0.33, -0.07)
    hp(bx(0.3, 0.1, 0.06), 0, 0.13, -0.12)
  }

  const armL = buildArm(1, top, skin, !!suit, shoulderX, outfit === 'shirt')
  const armR = buildArm(-1, top, skin, !!suit, shoulderX, outfit === 'shirt')
  torso.add(armL.shoulder, armR.shoulder)

  // Vaso con la bebida de colores y su sorbete; un papel; un snack (dona, pizza, papas o cupcake)
  const cupG = new THREE.Group()
  cupG.add(at(part(cyl(0.042, 0.032, 0.1, 10), 0xe8f4f8, 0.15, false, 0.55), 0, 0, 0))
  cupG.add(at(part(cyl(0.04, 0.031, 0.07, 10), DRINKS[seed % DRINKS.length], 0.4, false, 0.95), 0, -0.012, 0))
  cupG.add(rz(at(part(bx(0.008, 0.1, 0.008), 0xffffff, 0.5), 0.012, 0.05, 0), 0, 0, -0.15))
  cupG.position.set(0, -0.37, 0.06)
  cupG.visible = false
  armR.elbow.add(cupG)
  const paper = at(part(bx(0.2, 0.01, 0.26), 0xffffff), 0, -0.37, 0.12)
  paper.visible = false
  armL.elbow.add(paper)
  // Celular (para las selfies)
  const phone = new THREE.Group()
  phone.add(part(bx(0.07, 0.13, 0.012), 0x15171c, 0.4))
  phone.add(at(part(bx(0.06, 0.115, 0.004), 0x4a8cff, 0.3), 0, 0, 0.007))
  phone.position.set(0, -0.36, 0.08)
  phone.visible = false
  armR.elbow.add(phone)
  const snack = new THREE.Group()
  const kind = seed % 4
  if (kind === 0) {
    snack.add(rz(part(new THREE.TorusGeometry(0.04, 0.018, 8, 14), 0xf29bb5, 0.6), Math.PI / 2, 0, 0))
    snack.add(rz(part(new THREE.TorusGeometry(0.04, 0.015, 8, 14), 0x6b3f26, 0.6), Math.PI / 2, 0, 0).translateY(-0.012))
  } else if (kind === 1) {
    snack.add(rz(part(cyl(0.075, 0.075, 0.014, 3), 0xf2b84b, 0.7), Math.PI / 2, 0, 0))
    ;[[0.02, 0.01], [-0.02, 0.02], [0.0, -0.025]].forEach(([x, z]) => snack.add(at(part(ball(0.011, 6, 6), 0xc0392b, 0.6), x, 0.009, z)))
  } else if (kind === 2) {
    snack.add(part(bx(0.085, 0.12, 0.03), 0xd62828, 0.6))
    snack.add(at(part(bx(0.087, 0.04, 0.032), 0xffd23f, 0.6), 0, 0.01, 0))
  } else {
    snack.add(at(part(cyl(0.038, 0.028, 0.05, 10), 0x7cc4e8, 0.7), 0, -0.01, 0))
    snack.add(sc(at(part(ball(0.045, 10, 8), 0xffc2d4, 0.6), 0, 0.03, 0), 1, 0.8, 1))
    snack.add(at(part(ball(0.012, 6, 6), 0xd62828, 0.4), 0, 0.065, 0))
  }
  snack.position.set(0, -0.36, 0.07)
  snack.visible = false
  armL.elbow.add(snack)

  g.scale.setScalar(spec.scale)
  return { group: g, hips, torso, head, armL, armR, legL, legR, cup: cupG, paper, snack, phone, mouth: mouthMesh, eyes: eyeMeshes, seed, stance: 0, phase: 0 }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Qué gesto hace ahora mientras trabaja: de vez en cuando se estira, toma café o mira alrededor. */
function gestureAt(p: Person, t: number): 'none' | 'stretch' | 'sip' | 'look' {
  const period = 26 + (p.seed % 7) * 3
  const dur = 3.4
  const tt = t + p.seed * 7.3
  if (tt % period > dur) return 'none'
  return (['stretch', 'sip', 'look'] as const)[Math.floor(tt / period) % 3]
}

interface Target {
  torsoX: number; torsoY: number; headX: number; headY: number
  lS: number; lE: number; rS: number; rE: number; rZ: number; rEz: number
  lHand: number; rHand: number
}

/**
 * Pone la postura de la persona. `dt` suaviza el paso de un estado a otro.
 * `walkSpeed` (0-1) es qué tanto camina: mueve la fase del paso y balancea piernas y brazos.
 */
export function animatePerson(p: Person, pose: PersonPose, t: number, dt = 0.016, walkSpeed = 0) {
  const k = Math.min(1, dt * 8)
  const s = p.seed
  const standing = pose === 'walk' || pose === 'stand' || pose === 'coffee' || pose === 'deliver' || pose === 'wave' || pose === 'play' || pose === 'dance' || pose === 'dj' || pose === 'bartend' || pose === 'dancepair'
  p.stance = lerp(p.stance, standing ? 1 : 0, Math.min(1, dt * 6))
  p.phase += dt * 7.5 * walkSpeed

  const T: Target = { torsoX: 0.06, torsoY: 0, headX: 0.1, headY: 0, lS: -0.6, lE: -0.85, rS: -0.6, rE: -0.85, rZ: 0, rEz: 0, lHand: 0, rHand: 0 }
  const breath = Math.sin(t * 1.6 + s) * 0.012
  let showCup = false
  let bounce = 1
  // Unos pocos "pasados de copas" (en broma): se tambalean y bailan con el vaso en la mano.
  const tipsy = s % 6 === 1
  let showPaper = false
  let showSnack = false
  let showPhone = false
  const toast = t % 14 < 1.8 // brindis en grupo, todos a la vez

  if (pose === 'type') {
    const g = gestureAt(p, t)
    T.torsoX = 0.1 + breath
    T.headX = 0.12 + Math.sin(t * 0.7 + s) * 0.05
    T.headY = Math.sin(t * 0.45 + s * 2) * 0.12
    T.lS = -0.62 + Math.sin(t * 9 + s) * 0.03
    T.rS = -0.62 + Math.sin(t * 11 + s * 2) * 0.03
    T.lE = -0.82 + Math.sin(t * 13 + s) * 0.07 + Math.sin(t * 4.1 + s) * 0.03
    T.rE = -0.82 + Math.sin(t * 15 + s * 3) * 0.07 + Math.sin(t * 3.7 + s) * 0.03
    T.lHand = Math.sin(t * 21 + s) * 0.22
    T.rHand = Math.sin(t * 19 + s * 2) * 0.22
    if (g === 'stretch') { T.torsoX = -0.18; T.headX = -0.25; T.lS = -2.9; T.rS = -2.9; T.lE = -0.15; T.rE = -0.15; T.lHand = 0; T.rHand = 0 }
    if (g === 'sip') { T.rS = -0.95; T.rE = -1.95; T.rHand = 0; T.headX = 0.02; showCup = true }
    if (g === 'look') { T.headY = Math.sin(t * 2.2) * 0.85; T.torsoY = Math.sin(t * 2.2) * 0.25; T.headX = 0.02 }
  } else if (pose === 'rest') {
    T.torsoX = 0.32 + breath * 2
    T.headX = 0.6
    T.lS = -0.95; T.rS = -0.95; T.lE = -0.25; T.rE = -0.25
  } else if (pose === 'lounge') {
    // Sentado en el sofá, recostado y relajado: respira lento, mira un poco al techo y a los lados.
    T.torsoX = -0.26 + breath * 2
    T.headX = -0.12 + Math.sin(t * 0.5 + s) * 0.05
    T.headY = Math.sin(t * 0.22 + s * 3) * 0.28
    const bite = Math.sin(t * 1.1 + s * 2) > 0.55 // de vez en cuando se lleva algo a la boca
    if (s % 3 === 0) {
      // Comiendo un snack: la mano izquierda va y viene a la boca
      showSnack = true
      T.rS = -0.45; T.rE = -1.15
      if (bite) { T.lS = -0.95; T.lE = -1.95; T.headX = 0.05 } else { T.lS = -0.6; T.lE = -1.35 }
    } else if (s % 3 === 1) {
      // Con su bebida: la sostiene y de vez en cuando toma un sorbo
      showCup = true
      T.lS = -0.45; T.lE = -1.15
      if (bite) { T.rS = -0.95; T.rE = -1.95; T.headX = 0.02 } else { T.rS = -0.6; T.rE = -1.3 }
    } else if (s % 2 === 0) { T.lS = -0.15; T.lE = -0.3; T.rS = -2.4; T.rE = -2.0 } // un brazo detrás de la cabeza
    else {
      // Conversando: gesticula con la mano y gira la cabeza hacia quien le habla
      T.lS = -0.45; T.lE = -1.15
      T.rS = -0.9 + Math.sin(t * 3 + s) * 0.35; T.rE = -1.2 + Math.sin(t * 2.4 + s) * 0.3
      T.headY = Math.sin(t * 0.7 + s) * 0.55
    }
    if (s % 3 === 1 && toast) { T.rS = -2.2; T.rE = -0.5 }
  } else if (pose === 'help') {
    T.torsoX = -0.02
    T.headX = -0.05
    T.headY = Math.sin(t * 1.2) * 0.1
    T.rS = -0.1; T.rZ = -2.55; T.rE = 0; T.rEz = Math.sin(t * 7) * 0.55
    T.lS = -0.5; T.lE = -0.7
  } else if (pose === 'walk' || pose === 'deliver') {
    const sw = Math.sin(p.phase)
    T.torsoX = 0.05
    T.headX = 0
    T.lS = -sw * 0.55; T.rS = sw * 0.55
    T.lE = -0.25 - Math.max(0, sw) * 0.3; T.rE = -0.25 - Math.max(0, -sw) * 0.3
    if (pose === 'deliver') { T.lS = -1.2; T.lE = -0.9; showPaper = true }
  } else if (pose === 'wave') {
    // De pie, pidiendo ayuda: agita la mano derecha.
    T.torsoX = 0
    T.headX = -0.05
    T.rS = -0.1; T.rZ = -2.55; T.rE = 0; T.rEz = Math.sin(t * 7) * 0.55
    T.lS = -0.05; T.lE = -0.12
  } else if (pose === 'play') {
    // Jugando ping-pong: se inclina hacia la mesa y da raquetazos con la mano derecha.
    const sw = Math.sin(t * 5.2 + s)
    T.torsoX = 0.2
    T.headX = 0.1
    T.headY = Math.sin(t * 2.6 + s) * 0.25
    T.rS = -1.05 + sw * 0.45; T.rE = -0.9 - Math.max(0, sw) * 0.5
    T.lS = -0.5; T.lE = -0.7
  } else if (pose === 'dance') {
    // De fiesta: cada rato cambia de baile (brazos arriba, señalando, meciéndose o saltando).
    const beat = t * 6 + s
    const style = Math.floor(t * 0.14 + s * 0.37) % 4
    T.torsoX = 0.04 + Math.sin(beat * 0.5) * 0.1
    T.torsoY = Math.sin(t * 2.4 + s) * 0.45
    T.headX = 0.05 + Math.abs(Math.sin(beat)) * 0.18
    T.headY = Math.sin(t * 1.7 + s * 2) * 0.4
    if (style === 0) {
      const wild = s % 3 === 0
      T.lS = (wild ? -2.5 : -1.6) + Math.sin(beat) * 0.55
      T.rS = (wild ? -2.5 : -1.2) + Math.sin(beat + Math.PI) * 0.55
      T.lE = -0.5 - Math.max(0, Math.sin(beat)) * 0.5
      T.rE = -0.5 - Math.max(0, -Math.sin(beat)) * 0.5
      T.rZ = Math.sin(beat * 0.5) * 0.35
    } else if (style === 1) {
      // El señalado de discoteca: un brazo arriba apuntando, la otra mano en la cadera.
      T.rS = -2.55 + Math.sin(beat) * 0.2; T.rE = -0.1; T.rZ = -0.35
      T.lS = -0.2; T.lE = -1.6
      T.torsoY = Math.sin(t * 1.6 + s) * 0.6
    } else if (style === 2) {
      // Meciéndose: brazos sueltos a los lados y mucho giro de cintura.
      T.lS = -0.5 + Math.sin(beat * 0.5) * 0.5; T.lE = -0.5
      T.rS = -0.5 - Math.sin(beat * 0.5) * 0.5; T.rE = -0.5
      T.torsoY = Math.sin(t * 2.2 + s) * 0.7
      T.headX = 0.1
    } else {
      // Saltando con los dos brazos arriba, al doble de velocidad.
      T.lS = -2.6 + Math.sin(beat * 2) * 0.35; T.rS = -2.6 - Math.sin(beat * 2) * 0.35
      T.lE = -0.3; T.rE = -0.3
      bounce = 1.9
    }
    if (toast && (tipsy || s % 2 === 0)) { T.rS = -2.4; T.rE = -0.4 } // brindis con el vaso en alto
    if (s % 5 === 2 && (t * 0.08 + s * 0.17) % 1 < 0.3) {
      // Selfie: una mano estira el celular y la otra hace la V
      showPhone = true
      T.rS = -1.55; T.rE = -0.25; T.rZ = 0
      T.lS = -2.4; T.lE = -0.3
      T.headX = -0.05; T.headY = 0.1
    }
  } else if (pose === 'dj') {
    // En la cabina: las manos sobre los tornamesas y la cabeza al ritmo.
    const beat = t * 5 + s
    T.torsoX = 0.14
    T.headX = 0.08 + Math.abs(Math.sin(beat)) * 0.2
    T.headY = Math.sin(t * 1.3 + s) * 0.3
    T.lS = -1.05 + Math.sin(beat * 2) * 0.15; T.lE = -0.9
    T.rS = -1.05 + Math.sin(beat * 2 + 1.5) * 0.15; T.rE = -0.9
  } else if (pose === 'stand') {
    T.torsoX = 0.02 + breath
    T.headX = 0.02
    T.headY = Math.sin(t * 0.8 + s) * 0.2
    T.lS = -0.05; T.rS = -0.05; T.lE = -0.12; T.rE = -0.12
  } else if (pose === 'coffee') {
    T.torsoX = 0.02
    T.headX = -0.05 + Math.max(0, Math.sin(t * 1.4 + s)) * 0.12
    T.rS = -0.95; T.rE = -1.9; T.lS = -0.05; T.lE = -0.12
    showCup = true
    if (toast) { T.rS = -2.2; T.rE = -0.5 }
    if (s % 2 === 1) {
      // Además picando algo con la otra mano
      showSnack = true
      if (Math.sin(t * 1.3 + s) > 0.4) { T.lS = -0.95; T.lE = -1.95 } else { T.lS = -0.6; T.lE = -1.3 }
    }
  } else if (pose === 'barsit') {
    // Sentado en un taburete del bar: el brazo en la barra, bebe y brinda
    const sip = Math.sin(t * 0.9 + s * 2) > 0.5
    showCup = true
    T.torsoX = -0.04
    T.headX = 0.05
    T.headY = Math.sin(t * 0.6 + s) * 0.35
    T.lS = -0.85; T.lE = -0.9
    if (toast) { T.rS = -2.2; T.rE = -0.5 } else if (sip) { T.rS = -0.95; T.rE = -1.95 } else { T.rS = -0.8; T.rE = -1.0 }
  } else if (pose === 'dancepair') {
    // Bailando en pareja: brazos al frente, giro de cintura y de vez en cuando choque de manos
    const beat = t * 3.2 + s
    T.torsoY = Math.sin(beat) * 0.25
    T.torsoX = 0.05
    T.headY = Math.sin(beat + 1) * 0.3
    T.headX = 0.05
    if ((t * 0.12 + s * 0.2) % 1 < 0.12) { T.rS = -2.1; T.rE = -0.2; T.lS = -0.5; T.lE = -0.6 }
    else { T.lS = -1.25; T.lE = -0.7; T.rS = -1.25; T.rE = -0.7 }
  } else if (pose === 'bartend') {
    // Bartender: agita la coctelera, sirve el trago y lo pasa por la barra.
    const cyc = (t * 0.22 + s * 0.31) % 1
    T.torsoX = 0.1
    T.headX = 0.08
    T.headY = Math.sin(t * 0.8 + s) * 0.35
    showCup = true
    if (cyc < 0.42) {
      const sh = Math.sin(t * 17) * 0.14
      T.lS = -1.55 + sh; T.rS = -1.55 - sh; T.lE = -1.5; T.rE = -1.5
      T.torsoY = Math.sin(t * 17) * 0.05
    } else if (cyc < 0.72) {
      T.rS = -1.25; T.rE = -0.55; T.lS = -0.9; T.lE = -1.05
      T.torsoX = 0.2
    } else {
      T.rS = -1.55; T.rE = -0.08; T.lS = -0.2; T.lE = -0.35
      T.headY = 0
    }
  } else {
    T.torsoX = 0.04 + breath
    T.headX = 0.05
    T.lS = -0.45; T.rS = -0.45; T.lE = -0.6; T.rE = -0.6
  }

  if (pose === 'dance' && (tipsy || s % 2 === 0) && !showPhone) showCup = true
  // Expresión: de vez en cuando se ríen (sonrisa más grande y ojos achinados)
  const happy = pose === 'dance' || pose === 'dancepair' || pose === 'barsit' || pose === 'lounge' || pose === 'coffee'
  const laugh = happy && Math.sin(t * 0.9 + s * 3) > 0.55
  p.mouth.scale.x = lerp(p.mouth.scale.x, laugh ? 1.35 : 1.05, k)
  p.mouth.scale.y = lerp(p.mouth.scale.y, laugh ? 1.1 : 0.55, k)
  p.eyes.forEach((e) => { e.scale.y = lerp(e.scale.y, laugh ? 0.4 : 0.8, k) })
  p.cup.visible = showCup
  p.snack.visible = showSnack
  p.phone.visible = showPhone
  p.paper.visible = showPaper

  p.torso.rotation.x = lerp(p.torso.rotation.x, T.torsoX, k)
  p.torso.rotation.y = lerp(p.torso.rotation.y, T.torsoY, k)
  p.torso.rotation.z = lerp(p.torso.rotation.z, tipsy && (pose === 'dance' || pose === 'coffee') ? Math.sin(t * 1.3 + s) * 0.2 : 0, k)
  p.head.rotation.z = lerp(p.head.rotation.z, tipsy && pose === 'dance' ? Math.sin(t * 1.1 + s * 2) * 0.3 : 0, k)
  p.head.rotation.x = lerp(p.head.rotation.x, T.headX, k)
  p.head.rotation.y = lerp(p.head.rotation.y, T.headY, k)
  p.armL.shoulder.rotation.x = lerp(p.armL.shoulder.rotation.x, T.lS, k)
  p.armL.elbow.rotation.x = lerp(p.armL.elbow.rotation.x, T.lE, k)
  p.armL.hand.rotation.x = lerp(p.armL.hand.rotation.x, T.lHand, k * 2)
  p.armR.shoulder.rotation.x = lerp(p.armR.shoulder.rotation.x, T.rS, k)
  p.armR.shoulder.rotation.z = lerp(p.armR.shoulder.rotation.z, T.rZ, k)
  p.armR.elbow.rotation.x = lerp(p.armR.elbow.rotation.x, T.rE, k)
  p.armR.elbow.rotation.z = lerp(p.armR.elbow.rotation.z, T.rEz, k * 2)
  p.armR.hand.rotation.x = lerp(p.armR.hand.rotation.x, T.rHand, k * 2)

  // Piernas: sentada = muslos hacia adelante y rodillas dobladas; de pie = rectas y, al caminar, un paso alterno.
  const st = p.stance
  const swing = Math.sin(p.phase) * 0.6 * walkSpeed
  const kneeBend = (ph: number) => Math.max(0, Math.sin(ph + 0.5)) * 0.9 * walkSpeed
  p.legL.hip.rotation.x = lerp(-Math.PI / 2, swing, st)
  p.legR.hip.rotation.x = lerp(-Math.PI / 2, -swing, st)
  p.legL.knee.rotation.x = lerp(Math.PI / 2, kneeBend(p.phase + Math.PI), st)
  p.legR.knee.rotation.x = lerp(Math.PI / 2, kneeBend(p.phase), st)
  p.hips.position.y = lerp(SIT_Y, STAND_Y, st) + Math.abs(Math.sin(p.phase)) * 0.04 * walkSpeed
  if (pose === 'dancepair') {
    p.hips.position.y += Math.abs(Math.sin(t * 3.2 + s)) * 0.035
  }
  if (pose === 'dance') {
    // Rebote al ritmo: sube y baja con las rodillas.
    const bn = Math.sin(t * (bounce > 1 ? 9 : 6) + s)
    p.hips.position.y += Math.abs(bn) * 0.07 * bounce
    p.legL.knee.rotation.x += Math.max(0, bn) * 0.45 * bounce
    p.legR.knee.rotation.x += Math.max(0, -bn) * 0.45 * bounce
  }
}
