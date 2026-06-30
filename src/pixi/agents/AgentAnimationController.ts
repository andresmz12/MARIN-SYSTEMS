import * as PIXI from 'pixi.js';
import { AgentCharacter } from './AgentCharacter';
import { HealthStatus, AnimationFrameData } from '@/types/agents';

export class AgentAnimationController {
  private character: AgentCharacter;
  private ticker: PIXI.Ticker;
  private elapsed: number = 0;
  private status: HealthStatus = 'unknown';
  private lastBlink: number = 0;
  private blinkInterval: number = 0;
  private shakeIntensity: number = 0;
  private downDuration: number = 0;

  constructor(character: AgentCharacter, ticker?: PIXI.Ticker) {
    this.character = character;
    this.ticker = ticker || new PIXI.Ticker();

    this.ticker.add(() => this.update());
    if (!ticker) {
      this.ticker.start();
    }

    this.randomizeBlink();
  }

  setState(status: HealthStatus) {
    if (status !== this.status) {
      this.status = status;
      this.character.setStatus(status);

      // Trigger shake en transición a 'down'
      if (status === 'down') {
        this.shakeIntensity = 1;
        this.downDuration = 0;
      }

      // Reset shake cuando se recupera
      if (status === 'healthy' && this.shakeIntensity > 0) {
        this.shakeIntensity = 0;
      }
    }
  }

  private update() {
    this.elapsed += 1 / 60;
    this.downDuration += 1 / 60;

    // Parpadeo aleatorio
    this.lastBlink += 1 / 60;
    if (this.lastBlink >= this.blinkInterval) {
      this.lastBlink = 0;
      this.randomizeBlink();
    }

    const frameData = this.calculateFrameData();
    this.character.redraw(frameData);
  }

  private calculateFrameData(): AnimationFrameData {
    const breathingAmount = Math.sin(this.elapsed * 0.8) * 2;
    const breathingIntensity = this.status === 'down' ? 0.3 : 1;

    // BREATHING
    const bodyOffsetY = breathingAmount * breathingIntensity;

    // TYPING
    const typingAmount = this.status === 'healthy' ? 1 : 0;
    const typingFreq = 6;
    const armLeftOffsetY = Math.sin(this.elapsed * typingFreq) * 8 * typingAmount;
    const armRightOffsetY =
      Math.sin(this.elapsed * typingFreq + Math.PI * 0.7) * 8 * typingAmount;

    let armLeftAngle = Math.sin(this.elapsed * typingFreq) * 0.4;
    let armRightAngle = Math.sin(this.elapsed * typingFreq + Math.PI * 0.7) * 0.4;

    // SLUMP (caída si estamos en 'down' por más de 60s)
    if (this.status === 'down' && this.downDuration > 60) {
      const slumpProgress = Math.min((this.downDuration - 60) / 2, 1);
      armLeftAngle = armLeftAngle * (1 - slumpProgress) - slumpProgress * 0.5;
      armRightAngle = armRightAngle * (1 - slumpProgress) - slumpProgress * 0.5;
    }

    // BLINK
    let eyeScaleY = 1;
    const blinkDuration = 0.15;
    if (this.lastBlink < blinkDuration) {
      const blinkPhase = this.lastBlink / blinkDuration;
      eyeScaleY = blinkPhase < 0.5 ? 1 - blinkPhase * 2 : (1 - blinkPhase) * 2;
    }

    if (this.status === 'down' && this.downDuration > 60) {
      eyeScaleY = 0.15;
    }

    // SHAKE
    let characterOffsetX = 0;
    if (this.shakeIntensity > 0) {
      characterOffsetX = Math.sin(this.elapsed * 25) * 6 * this.shakeIntensity;
      this.shakeIntensity *= 0.92;
    }

    // GLOW
    const glowColor = this.getGlowColor();
    const glowPulseSpeed =
      this.status === 'healthy' ? 0.8 : this.status === 'degraded' ? 2 : 4;
    const glowAlpha =
      0.3 +
      Math.sin(this.elapsed * glowPulseSpeed) * 0.3 +
      (this.status === 'down' ? 0.3 : 0);

    // HEAD ANGLE (slump)
    let headAngle = 0;
    if (this.status === 'down' && this.downDuration > 60) {
      const slumpProgress = Math.min((this.downDuration - 60) / 2, 1);
      headAngle = slumpProgress * 20;
    }

    return {
      bodyOffsetY,
      armLeftOffsetY,
      armLeftAngle,
      armRightOffsetY,
      armRightAngle,
      eyeScaleY,
      characterOffsetX,
      glowAlpha: Math.max(0, Math.min(1, glowAlpha)),
      glowScale: 1,
      glowColor,
      headAngle,
    };
  }

  private getGlowColor(): string {
    switch (this.status) {
      case 'healthy':  return '#22C55E';
      case 'degraded': return '#EAB308';
      case 'down':     return '#EF4444';
      default:         return '#6B7280';
    }
  }

  private randomizeBlink() {
    this.blinkInterval = 3 + Math.random() * 3;
  }

  destroy() {
    this.ticker.destroy();
  }
}
