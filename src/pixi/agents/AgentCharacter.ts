import * as PIXI from 'pixi.js';
import { HealthStatus, AnimationFrameData } from '@/types/agents';

const GLOW_COLORS: Record<HealthStatus, number> = {
  healthy:  0x22C55E,
  degraded: 0xEAB308,
  down:     0xEF4444,
  unknown:  0x6B7280,
};

export class AgentCharacter extends PIXI.Container {
  private charName: string;
  private color: string;
  private status: HealthStatus = 'unknown';

  // Sub-containers y graphics
  private glowLayer: PIXI.Graphics;
  private bodyContainer: PIXI.Container;
  private head: PIXI.Container;
  private armLeft: PIXI.Graphics;
  private armRight: PIXI.Graphics;
  private badge: PIXI.Container;

  // Partes del cuerpo
  private torso: PIXI.Graphics;
  private eyeLeft: PIXI.Graphics;
  private eyeRight: PIXI.Graphics;
  private badgeText: PIXI.Text;

  constructor(name: string, color: string) {
    super();
    this.charName = name;
    this.color = color;

    // Glow layer (aura de fondo, se dibuja primero = z más bajo)
    this.glowLayer = new PIXI.Graphics();
    this.addChild(this.glowLayer);

    // Contenedor del cuerpo (breathing offset se aplica aquí)
    this.bodyContainer = new PIXI.Container();
    this.addChild(this.bodyContainer);

    // Torso (hijo del bodyContainer)
    this.torso = new PIXI.Graphics();
    this.bodyContainer.addChild(this.torso);

    // Cabeza (hijo del bodyContainer)
    this.head = new PIXI.Container();
    this.bodyContainer.addChild(this.head);

    // Ojos (hijos de head)
    this.eyeLeft = new PIXI.Graphics();
    this.head.addChild(this.eyeLeft);

    this.eyeRight = new PIXI.Graphics();
    this.head.addChild(this.eyeRight);

    // Brazos (hijos directos del Container principal para z-order independiente)
    this.armLeft = new PIXI.Graphics();
    this.addChild(this.armLeft);

    this.armRight = new PIXI.Graphics();
    this.addChild(this.armRight);

    // Badge de estado (sobre todo lo demás)
    this.badge = new PIXI.Container();
    this.addChild(this.badge);

    this.badgeText = new PIXI.Text({
      text: '?',
      style: {
        fontSize: 14,
        fill: 0xffffff,
        fontFamily: 'monospace',
        fontWeight: 'bold',
      },
    });
    this.badgeText.anchor.set(0.5);
    this.badge.addChild(this.badgeText);
    this.badge.x = 28;
    this.badge.y = -55;
  }

  // ─── MÉTODO PRINCIPAL DE RENDER ──────────────────────────────────────────

  redraw(frameData: AnimationFrameData): void {
    // Offset de respiración y shake aplicados al bodyContainer
    this.bodyContainer.y = frameData.bodyOffsetY;
    this.bodyContainer.x = frameData.characterOffsetX;

    // Offset de shake también en los brazos (se mueven con el cuerpo)
    this.armLeft.x = frameData.characterOffsetX;
    this.armRight.x = frameData.characterOffsetX;

    this.drawGlow(frameData);
    this.drawTorso();
    this.drawHead(frameData);
    this.drawArmLeft(frameData);
    this.drawArmRight(frameData);
    this.drawBadge();
  }

  // ─── GLOW ────────────────────────────────────────────────────────────────

  private drawGlow(frameData: AnimationFrameData): void {
    const color = this.hexToNumber(frameData.glowColor);
    this.glowLayer.clear();
    this.glowLayer.ellipse(0, 10, 45 * frameData.glowScale, 55 * frameData.glowScale);
    this.glowLayer.fill({ color, alpha: frameData.glowAlpha });
  }

  // ─── TORSO ───────────────────────────────────────────────────────────────

  private drawTorso(): void {
    const colorNum = this.hexToNumber(this.color);
    this.torso.clear();
    // Torso centrado en x=0, empieza en y=0, baja 60px
    this.torso.roundRect(-25, 0, 50, 60, 8);
    this.torso.fill({ color: colorNum });
    // Borde sutil más oscuro
    this.torso.roundRect(-25, 0, 50, 60, 8);
    this.torso.stroke({ color: this.darken(colorNum, 0.3), width: 2 });
  }

  // ─── CABEZA ──────────────────────────────────────────────────────────────

  private drawHead(frameData: AnimationFrameData): void {
    const colorNum = this.hexToNumber(this.color);

    // Limpiar cabeza y re-dibujar base
    // (los ojos son hijos fijos, solo redibujamos la base del head)
    this.head.y = -40;
    this.head.angle = frameData.headAngle;

    // Círculo base de la cabeza (no es Graphics, sino que usamos un Graphics temporal)
    // Nota: como head es un Container, dibujamos un Graphics hijo para la base
    // pero la inicializamos en el constructor y solo actualizamos ojos aquí
    // para evitar crear objetos en cada frame. El headBase se dibuja en init.
    // En este enfoque simplificado dibujamos directamente en el torso area:

    // Cara: círculo skin-colored
    const faceColor = this.lighten(colorNum, 0.4);

    // Reusar el primer hijo Graphics de head si existe, o crearlo
    let faceGfx = this.head.getChildAt(0) as PIXI.Graphics | undefined;
    if (!faceGfx || !(faceGfx instanceof PIXI.Graphics)) {
      faceGfx = new PIXI.Graphics();
      this.head.addChildAt(faceGfx, 0);
    }

    faceGfx.clear();
    faceGfx.circle(0, 0, 20);
    faceGfx.fill({ color: faceColor });
    faceGfx.circle(0, 0, 20);
    faceGfx.stroke({ color: this.darken(colorNum, 0.2), width: 2 });

    // Ojos con efecto de parpadeo
    this.drawEye(this.eyeLeft,  -8, -4, frameData.eyeScaleY);
    this.drawEye(this.eyeRight,  8, -4, frameData.eyeScaleY);
  }

  private drawEye(gfx: PIXI.Graphics, x: number, y: number, scaleY: number): void {
    gfx.clear();
    gfx.x = x;
    gfx.y = y;
    gfx.scale.y = scaleY;         // parpadeo: 1.0 = abierto, ~0.1 = cerrado
    gfx.ellipse(0, 0, 4, 5);
    gfx.fill({ color: 0x1a1a2e }); // casi negro
    // Brillo del ojo
    gfx.circle(1.5, -1.5, 1.5);
    gfx.fill({ color: 0xffffff, alpha: 0.8 });
  }

  // ─── BRAZOS ──────────────────────────────────────────────────────────────

  private drawArmLeft(frameData: AnimationFrameData): void {
    const colorNum = this.hexToNumber(this.color);
    const { armLeftOffsetY, armLeftAngle, bodyOffsetY } = frameData;

    // Hombro izquierdo: x=-25 del torso, y=10 del torso
    const shoulderX = -25;
    const shoulderY = 10 + bodyOffsetY;
    // Mano: baja hacia el teclado
    const handX = shoulderX - 15;
    const handY = shoulderY + 45 + armLeftOffsetY;
    // Control point para la curva Bezier (codo)
    const ctrlX = shoulderX - 20;
    const ctrlY = shoulderY + 22 + armLeftAngle;

    this.armLeft.clear();
    this.armLeft.moveTo(shoulderX, shoulderY);
    this.armLeft.quadraticCurveTo(ctrlX, ctrlY, handX, handY);
    this.armLeft.stroke({ color: colorNum, width: 8, cap: 'round' });
    // Mano (círculo pequeño)
    this.armLeft.circle(handX, handY, 5);
    this.armLeft.fill({ color: this.darken(colorNum, 0.2) });
  }

  private drawArmRight(frameData: AnimationFrameData): void {
    const colorNum = this.hexToNumber(this.color);
    const { armRightOffsetY, armRightAngle, bodyOffsetY } = frameData;

    const shoulderX = 25;
    const shoulderY = 10 + bodyOffsetY;
    const handX = shoulderX + 15;
    const handY = shoulderY + 45 + armRightOffsetY;
    const ctrlX = shoulderX + 20;
    const ctrlY = shoulderY + 22 + armRightAngle;

    this.armRight.clear();
    this.armRight.moveTo(shoulderX, shoulderY);
    this.armRight.quadraticCurveTo(ctrlX, ctrlY, handX, handY);
    this.armRight.stroke({ color: colorNum, width: 8, cap: 'round' });
    this.armRight.circle(handX, handY, 5);
    this.armRight.fill({ color: this.darken(colorNum, 0.2) });
  }

  // ─── BADGE DE ESTADO ─────────────────────────────────────────────────────

  private drawBadge(): void {
    const badgeGfx = this.badge.getChildAt(0);
    if (badgeGfx instanceof PIXI.Graphics) {
      badgeGfx.clear();
    }

    const icons: Record<HealthStatus, string> = {
      healthy:  '✓',
      degraded: '⚠',
      down:     '✗',
      unknown:  '?',
    };
    this.badgeText.text = icons[this.status];
  }

  // ─── API PÚBLICA ─────────────────────────────────────────────────────────

  setStatus(status: HealthStatus): void {
    this.status = status;
  }

  getStatus(): HealthStatus {
    return this.status;
  }

  getName(): string {
    return this.charName;
  }

  // ─── HELPERS DE COLOR ────────────────────────────────────────────────────

  private hexToNumber(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
  }

  private darken(color: number, amount: number): number {
    const r = Math.max(0, ((color >> 16) & 0xff) * (1 - amount));
    const g = Math.max(0, ((color >> 8)  & 0xff) * (1 - amount));
    const b = Math.max(0, ( color        & 0xff) * (1 - amount));
    return (r << 16) | (g << 8) | b;
  }

  private lighten(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + 255 * amount);
    const g = Math.min(255, ((color >> 8)  & 0xff) + 255 * amount);
    const b = Math.min(255, ( color        & 0xff) + 255 * amount);
    return (r << 16) | (g << 8) | b;
  }
}
