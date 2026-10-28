import * as THREE from 'three'

// Personas de bajo polígono, construidas con código: cada una con su tono de piel, peso de cabello,
// peinado y ropa. Están sentadas frente al escritorio y cada estado tiene su postura:
// trabajar = teclea con las dos manos, descansar = cabeza baja, atención = levanta la mano.

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

export type PersonPose = 'type' | 'rest' | 'help' | 'idle'

interface Arm {
  shoulder: THREE.Group
  elbow: THREE.Group
  hand: THREE.Mesh
}
export interface Person {
  group: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  armL: Arm
  armR: Arm
  seed: number
}

const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x9a6648, 0x6f4a35]
const HAIRS = [0x1b1410, 0x3b2a1c, 0x6b4a2b, 0x9a6a3a, 0x2a2a2e, 0xb08a4f]
const PANTS = [0x2b3144, 0x3a3f52, 0x232733, 0x4a4036]

function hashOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Rasgos estables por agente: la misma persona siempre se ve igual. */
export function specFor(id: string, shirt: number, ghost: boolean): PersonSpec {
  const h = hashOf(id)
  const styles: PersonSpec['hairStyle'][] = ['short', 'long', 'bun', 'cap']
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >> 3) % HAIRS.length],
    hairStyle: styles[(h >> 6) % styles.length],
    shirt,
    pants: PANTS[(h >> 9) % PANTS.length],
    scale: 0.96 + ((h >> 12) % 9) / 100,
    ghost,
  }
}

// `ghost` se conserva en la firma (los puestos reservados usan una camisa gris), pero ya no vuelve transparente a nadie.
function part(geo: THREE.BufferGeometry, color: number, _ghost: boolean, rough = 0.85): THREE.Mesh {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 }),
  )
  m.castShadow = true
  return m
}
const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o }

function buildArm(side: 1 | -1, sleeve: number, skin: number, ghost: boolean): Arm {
  const shoulder = new THREE.Group()
  shoulder.position.set(side * 0.24, 0.46, 0)
  const upper = part(bx(0.1, 0.3, 0.1), sleeve, ghost)
  upper.position.y = -0.15
  shoulder.add(upper)
  const elbow = new THREE.Group()
  elbow.position.y = -0.3
  shoulder.add(elbow)
  const fore = part(bx(0.085, 0.27, 0.085), skin, ghost)
  fore.position.y = -0.135
  elbow.add(fore)
  const hand = part(bx(0.095, 0.1, 0.07), skin, ghost)
  hand.position.y = -0.31
  elbow.add(hand)
  return { shoulder, elbow, hand }
}

/** Una persona sentada, de frente hacia +z, con los pies en y = 0 y la cadera sobre una silla de 0.5. */
export function buildPerson(spec: PersonSpec, seed = 1): Person {
  const g = new THREE.Group()
  const { ghost } = spec
  const suit = spec.suit
  const top = suit ? suit.jacket : spec.shirt

  // Piernas sentadas: muslos hacia adelante, canillas hacia abajo, zapatos
  g.add(at(part(bx(0.4, 0.18, 0.26), spec.pants, ghost), 0, 0.6, 0))
  ;([1, -1] as const).forEach((s) => {
    g.add(at(part(bx(0.16, 0.16, 0.44), spec.pants, ghost), s * 0.1, 0.62, 0.24))
    g.add(at(part(bx(0.14, 0.46, 0.14), spec.pants, ghost), s * 0.1, 0.35, 0.43))
    g.add(at(part(bx(0.14, 0.08, 0.25), 0x14151b, ghost), s * 0.1, 0.06, 0.5))
  })

  // Torso (gira desde la cintura)
  const torso = new THREE.Group()
  torso.position.set(0, 0.68, 0)
  g.add(torso)
  const chest = part(bx(0.42, 0.52, 0.25), top, ghost)
  chest.position.y = 0.26
  torso.add(chest)
  if (suit) {
    const shirtStrip = part(bx(0.12, 0.38, 0.01), 0xf4f4f6, ghost)
    shirtStrip.position.set(0, 0.3, 0.128)
    torso.add(shirtStrip)
    const tie = part(bx(0.05, 0.3, 0.012), suit.tie, ghost)
    tie.position.set(0, 0.27, 0.135)
    torso.add(tie)
  }
  const neck = part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), spec.skin, ghost)
  neck.position.y = 0.56
  torso.add(neck)

  // Cabeza (gira desde el cuello)
  const head = new THREE.Group()
  head.position.set(0, 0.6, 0)
  torso.add(head)
  const skull = part(new THREE.SphereGeometry(0.15, 18, 14), spec.skin, ghost, 0.7)
  skull.position.y = 0.15
  head.add(skull)
  ;([1, -1] as const).forEach((s) => {
    const eye = part(new THREE.SphereGeometry(0.018, 8, 8), 0x14151b, ghost)
    eye.position.set(s * 0.055, 0.17, 0.138)
    head.add(eye)
  })
  const hairMat = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const m = part(geo, spec.hair, ghost, 0.9)
    m.position.set(x, y, z)
    head.add(m)
    return m
  }
  const crown = hairMat(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), 0, 0.165, -0.012)
  crown.rotation.x = -0.12
  if (spec.hairStyle === 'long') hairMat(bx(0.3, 0.34, 0.08), 0, 0.06, -0.12)
  if (spec.hairStyle === 'bun') hairMat(new THREE.SphereGeometry(0.075, 10, 10), 0, 0.3, -0.1)
  if (spec.hairStyle === 'short') hairMat(bx(0.3, 0.07, 0.05), 0, 0.12, -0.13)
  if (spec.hairStyle === 'cap') hairMat(bx(0.3, 0.1, 0.1), 0, 0.12, -0.1)

  const armL = buildArm(1, top, spec.skin, ghost)
  const armR = buildArm(-1, top, spec.skin, ghost)
  torso.add(armL.shoulder, armR.shoulder)

  g.scale.setScalar(spec.scale)
  return { group: g, torso, head, armL, armR, seed }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Pone la postura de la persona; `blend` suaviza el paso de un estado a otro (0-1 por cuadro). */
export function animatePerson(p: Person, pose: PersonPose, t: number, k = 0.14) {
  const s = p.seed
  const target = {
    torsoX: 0.06, headX: 0.1, headY: 0,
    lS: -0.6, lE: -0.85, rS: -0.6, rE: -0.85, rZ: 0, rEz: 0,
    lHand: 0, rHand: 0,
  }
  // Respiración suave en todos los estados
  const breath = Math.sin(t * 1.6 + s) * 0.012

  if (pose === 'type') {
    // Teclear: antebrazos casi horizontales, cada mano rebota a su ritmo y la cabeza sigue la pantalla.
    target.torsoX = 0.1 + breath
    target.headX = 0.12 + Math.sin(t * 0.7 + s) * 0.05
    target.headY = Math.sin(t * 0.45 + s * 2) * 0.12
    target.lS = -0.62 + Math.sin(t * 9 + s) * 0.03
    target.rS = -0.62 + Math.sin(t * 11 + s * 2) * 0.03
    target.lE = -0.82 + Math.sin(t * 13 + s) * 0.07 + Math.sin(t * 4.1 + s) * 0.03
    target.rE = -0.82 + Math.sin(t * 15 + s * 3) * 0.07 + Math.sin(t * 3.7 + s) * 0.03
    target.lHand = Math.sin(t * 21 + s) * 0.22
    target.rHand = Math.sin(t * 19 + s * 2) * 0.22
  } else if (pose === 'rest') {
    // Fuera de horario: se recarga con la cabeza baja y los brazos sobre el escritorio.
    target.torsoX = 0.32 + breath * 2
    target.headX = 0.6
    target.lS = -0.95
    target.rS = -0.95
    target.lE = -0.25
    target.rE = -0.25
  } else if (pose === 'help') {
    // Necesita atención: mira al frente y agita la mano derecha.
    target.torsoX = -0.02
    target.headX = -0.05
    target.headY = Math.sin(t * 1.2) * 0.1
    target.rS = -0.1
    target.rZ = -2.55
    target.rE = 0
    target.rEz = Math.sin(t * 7) * 0.55
    target.lS = -0.5
    target.lE = -0.7
  } else {
    target.torsoX = 0.04 + breath
    target.headX = 0.05
    target.lS = -0.45
    target.rS = -0.45
    target.lE = -0.6
    target.rE = -0.6
  }

  p.torso.rotation.x = lerp(p.torso.rotation.x, target.torsoX, k)
  p.head.rotation.x = lerp(p.head.rotation.x, target.headX, k)
  p.head.rotation.y = lerp(p.head.rotation.y, target.headY, k)
  p.armL.shoulder.rotation.x = lerp(p.armL.shoulder.rotation.x, target.lS, k)
  p.armL.elbow.rotation.x = lerp(p.armL.elbow.rotation.x, target.lE, k)
  p.armL.hand.rotation.x = lerp(p.armL.hand.rotation.x, target.lHand, k * 2)
  p.armR.shoulder.rotation.x = lerp(p.armR.shoulder.rotation.x, target.rS, k)
  p.armR.shoulder.rotation.z = lerp(p.armR.shoulder.rotation.z, target.rZ, k)
  p.armR.elbow.rotation.x = lerp(p.armR.elbow.rotation.x, target.rE, k)
  p.armR.elbow.rotation.z = lerp(p.armR.elbow.rotation.z, target.rEz, k * 2)
  p.armR.hand.rotation.x = lerp(p.armR.hand.rotation.x, target.rHand, k * 2)
}
