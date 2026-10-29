import * as THREE from 'three'

// Personas de bajo polígono, construidas con código: cada una con su tono de piel, peinado y ropa.
// Pueden estar sentadas (teclean, descansan, piden ayuda, se estiran, toman café) o de pie y
// caminando: las piernas tienen cadera y rodilla propias.

export interface PersonSpec {
  skin: number
  hair: number
  hairStyle: 'short' | 'long' | 'bun' | 'cap'
  shirt: number
  pants: number
  /** Traje: saco oscuro, camisa blanca y corbata (el CEO). */
  suit?: { jacket: number; tie: number }
  scale: number
  ghost: boolean
}

export type PersonPose = 'type' | 'rest' | 'lounge' | 'help' | 'idle' | 'walk' | 'stand' | 'coffee' | 'deliver' | 'wave'

interface Arm {
  shoulder: THREE.Group
  elbow: THREE.Group
  hand: THREE.Mesh
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
  cup: THREE.Mesh
  paper: THREE.Mesh
  seed: number
  /** 0 = sentada, 1 = de pie (se suaviza sola). */
  stance: number
  /** Fase del paso al caminar, en radianes. */
  phase: number
}

const SKINS = [0xf6d3b3, 0xf1c9a5, 0xe8b990, 0xe0ac86, 0xd09a74]
const HAIRS = [0x4a3424, 0x5c4129, 0x6b4a2b, 0x9a6a3a, 0x7a5535, 0xb08a4f]
const PANTS = [0x2b3144, 0x3a3f52, 0x232733, 0x4a4036]
const SIT_Y = 0.6
const STAND_Y = 1.0

function hashOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Rasgos estables por agente: la misma persona siempre se ve igual. */
export function specFor(id: string, shirt: number, ghost: boolean): PersonSpec {
  const h = hashOf(id)
  const styles: PersonSpec['hairStyle'][] = ['short', 'long', 'bun', 'cap']
  // Ropa casual (sport): camiseta del color de su rol y pantalón oscuro. El traje (ver buildPerson) queda solo para el CEO.
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >>> 3) % HAIRS.length],
    hairStyle: styles[(h >>> 6) % styles.length],
    shirt,
    pants: PANTS[(h >>> 9) % PANTS.length],
    scale: 0.96 + ((h >>> 12) % 9) / 100,
    ghost,
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

function part(geo: THREE.BufferGeometry, color: number, rough = 0.85, cloth = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(cloth ? { color: 0xffffff, map: fabric(color), roughness: rough, metalness: 0.02 } : { color, roughness: rough, metalness: 0.02 }))
  m.castShadow = true
  return m
}
const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o }

function buildArm(side: 1 | -1, sleeve: number, skin: number, suited = false): Arm {
  const shoulder = new THREE.Group()
  shoulder.position.set(side * 0.24, 0.46, 0)
  shoulder.add(at(part(bx(0.1, 0.3, 0.1), sleeve, 0.85, suited), 0, -0.15, 0))
  const elbow = new THREE.Group()
  elbow.position.y = -0.3
  shoulder.add(elbow)
  // De traje, la manga del saco llega hasta la muñeca y asoma el puño blanco de la camisa.
  elbow.add(at(part(bx(0.085, 0.27, 0.085), suited ? sleeve : skin, 0.85, suited), 0, -0.135, 0))
  if (suited) elbow.add(at(part(bx(0.092, 0.03, 0.092), 0xf6f6f8), 0, -0.265, 0))
  const hand = at(part(bx(0.095, 0.1, 0.07), skin), 0, -0.31, 0)
  elbow.add(hand)
  return { shoulder, elbow, hand }
}

function buildLeg(side: 1 | -1, pants: number, suited = false): Leg {
  const hip = new THREE.Group()
  hip.position.set(side * 0.1, 0, 0)
  hip.add(at(part(bx(0.16, 0.46, 0.16), pants, 0.85, suited), 0, -0.23, 0))
  const knee = new THREE.Group()
  knee.position.y = -0.46
  hip.add(knee)
  knee.add(at(part(bx(0.14, 0.46, 0.14), pants, 0.85, suited), 0, -0.23, 0))
  // Zapato de vestir (lustroso) y calcetín oscuro
  if (suited) knee.add(at(part(bx(0.12, 0.04, 0.12), 0x15161b), 0, -0.47, 0))
  const shoe = part(bx(0.14, 0.08, 0.26), suited ? 0x0f1014 : 0x14151b, suited ? 0.3 : 0.85)
  knee.add(at(shoe, 0, -0.5, 0.06))
  return { hip, knee }
}

/** Una persona de frente hacia +z, con los pies en y = 0 (sentada sobre una silla de 0.5, o de pie). */
export function buildPerson(spec: PersonSpec, seed = 1): Person {
  const g = new THREE.Group()
  const suit = spec.suit
  const top = suit ? suit.jacket : spec.shirt

  const hips = new THREE.Group()
  hips.position.y = SIT_Y
  g.add(hips)
  hips.add(part(bx(0.4, 0.18, 0.26), spec.pants, 0.85, !!suit))
  const legL = buildLeg(1, spec.pants, !!suit)
  const legR = buildLeg(-1, spec.pants, !!suit)
  hips.add(legL.hip, legR.hip)

  const torso = new THREE.Group()
  torso.position.set(0, 0.08, 0)
  hips.add(torso)
  const woman = spec.hairStyle === 'long' || spec.hairStyle === 'bun'
  if (!suit) {
    torso.add(at(part(bx(0.42, 0.52, 0.25), top), 0, 0.26, 0))
  } else {
    const jacket = suit.jacket
    const dark = new THREE.Color(jacket).multiplyScalar(0.78).getHex()
    // Saco entallado: pecho amplio, cintura más angosta, faldón sobre la cadera y hombreras.
    torso.add(at(part(bx(0.44, 0.3, 0.27), jacket, 0.85, true), 0, 0.37, 0))
    torso.add(at(part(bx(0.4, 0.26, 0.25), jacket, 0.85, true), 0, 0.12, 0))
    torso.add(at(part(bx(0.45, 0.14, 0.285), jacket, 0.85, true), 0, -0.04, 0))
    ;([1, -1] as const).forEach((sd) => torso.add(at(part(bx(0.12, 0.07, 0.275), jacket, 0.85, true), sd * 0.2, 0.5, 0)))
    // Camisa en V y cuello
    torso.add(at(part(bx(0.13, 0.4, 0.01), woman ? spec.shirt : 0xf4f4f6), 0, 0.31, 0.134))
    ;([1, -1] as const).forEach((sd) => {
      const col = at(part(bx(0.06, 0.05, 0.02), woman ? spec.shirt : 0xf8f8fa), sd * 0.045, 0.545, 0.128)
      col.rotation.z = sd * -0.35
      torso.add(col)
    })
    if (woman) {
      // Blusa del color del rol y un collar fino de perlas
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI
        torso.add(at(part(new THREE.SphereGeometry(0.014, 8, 8), 0xf3ece0, 0.4), Math.cos(a) * 0.06, 0.5 - Math.sin(a) * 0.07, 0.14))
      }
    } else {
      // Corbata con nudo y pala ancha, del color del rol
      torso.add(at(part(bx(0.06, 0.05, 0.022), suit.tie, 0.5), 0, 0.5, 0.14))
      torso.add(at(part(bx(0.055, 0.3, 0.014), suit.tie, 0.5), 0, 0.33, 0.142))
      torso.add(at(part(bx(0.06, 0.03, 0.016), suit.tie, 0.5), 0, 0.17, 0.142))
    }
    // Solapas, botones y pañuelo
    ;([1, -1] as const).forEach((sd) => {
      const l = at(part(bx(0.075, 0.34, 0.014), dark), sd * 0.105, 0.34, 0.136)
      l.rotation.z = sd * -0.3
      torso.add(l)
    })
    ;[0.2, 0.1].forEach((yy) => torso.add(at(part(bx(0.022, 0.022, 0.012), 0x14151b, 0.4), 0, yy, 0.139)))
    torso.add(at(part(bx(0.06, 0.04, 0.012), 0xf4f4f6), -0.14, 0.42, 0.139))
    // Cinturón con hebilla
    torso.add(at(part(bx(0.41, 0.03, 0.26), 0x14151b, 0.5), 0, -0.1, 0))
    torso.add(at(part(bx(0.04, 0.03, 0.01), 0xc9a24a, 0.3), 0, -0.1, 0.133))
  }
  torso.add(at(part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), spec.skin), 0, 0.56, 0))

  const head = new THREE.Group()
  head.position.set(0, 0.6, 0)
  torso.add(head)
  head.add(at(part(new THREE.SphereGeometry(0.15, 18, 14), spec.skin, 0.7), 0, 0.15, 0))
  ;([1, -1] as const).forEach((s) => head.add(at(part(new THREE.SphereGeometry(0.018, 8, 8), 0x14151b), s * 0.055, 0.17, 0.138)))
  const hairPart = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const m = at(part(geo, spec.hair, 0.9), x, y, z)
    head.add(m)
    return m
  }
  hairPart(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), 0, 0.165, -0.012).rotation.x = -0.12
  if (spec.hairStyle === 'long') hairPart(bx(0.3, 0.34, 0.08), 0, 0.06, -0.12)
  if (spec.hairStyle === 'bun') hairPart(new THREE.SphereGeometry(0.075, 10, 10), 0, 0.3, -0.1)
  if (spec.hairStyle === 'short') hairPart(bx(0.3, 0.07, 0.05), 0, 0.12, -0.13)
  if (spec.hairStyle === 'cap') hairPart(bx(0.3, 0.1, 0.1), 0, 0.12, -0.1)

  const armL = buildArm(1, top, spec.skin, !!suit)
  const armR = buildArm(-1, top, spec.skin, !!suit)
  torso.add(armL.shoulder, armR.shoulder)

  // Objetos que lleva en la mano: una taza (café) y un papel (entregas)
  const cup = at(part(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 10), 0xf4f4f4), 0, -0.4, 0.05)
  cup.visible = false
  armR.elbow.add(cup)
  const paper = at(part(bx(0.2, 0.01, 0.26), 0xffffff), 0, -0.37, 0.12)
  paper.visible = false
  armL.elbow.add(paper)

  g.scale.setScalar(spec.scale)
  return { group: g, hips, torso, head, armL, armR, legL, legR, cup, paper, seed, stance: 0, phase: 0 }
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
  const standing = pose === 'walk' || pose === 'stand' || pose === 'coffee' || pose === 'deliver' || pose === 'wave'
  p.stance = lerp(p.stance, standing ? 1 : 0, Math.min(1, dt * 6))
  p.phase += dt * 7.5 * walkSpeed

  const T: Target = { torsoX: 0.06, torsoY: 0, headX: 0.1, headY: 0, lS: -0.6, lE: -0.85, rS: -0.6, rE: -0.85, rZ: 0, rEz: 0, lHand: 0, rHand: 0 }
  const breath = Math.sin(t * 1.6 + s) * 0.012
  let showCup = false
  let showPaper = false

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
    if (s % 2 === 0) { T.lS = -0.45; T.lE = -1.15; T.rS = -0.45; T.rE = -1.15 } // manos sobre las piernas
    else { T.lS = -0.15; T.lE = -0.3; T.rS = -2.4; T.rE = -2.0 } // un brazo detrás de la cabeza
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
  } else {
    T.torsoX = 0.04 + breath
    T.headX = 0.05
    T.lS = -0.45; T.rS = -0.45; T.lE = -0.6; T.rE = -0.6
  }

  p.cup.visible = showCup
  p.paper.visible = showPaper

  p.torso.rotation.x = lerp(p.torso.rotation.x, T.torsoX, k)
  p.torso.rotation.y = lerp(p.torso.rotation.y, T.torsoY, k)
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
}
