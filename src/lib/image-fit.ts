import sharp from 'sharp'

export type FitMode = 'complete' | 'crop'

/** Recortes menores a esto se aceptan sin más (no se nota ni se pierde nada importante). */
const NEGLIGIBLE_LOSS = 0.03

/**
 * Lleva una imagen al tamaño exacto de la red SIN cortar lo importante:
 * - 'complete' (por defecto): la imagen entera va en el centro y los lados (o arriba y abajo) se rellenan con la misma
 *   imagen difuminada. El logo, el texto y los botones quedan intactos.
 * - 'crop': recorte al centro (se pierde lo que sobra).
 * Si la imagen ya casi tiene la proporción de la red, se recorta (la diferencia es mínima).
 */
export async function fitToSpec(input: Buffer, spec: { width: number; height: number }, loss: number, mode: FitMode): Promise<{ data: Buffer; action: 'crop' | 'complete' }> {
  const { width: W, height: H } = spec
  if (mode === 'crop' || loss <= NEGLIGIBLE_LOSS) {
    const data = await sharp(input).resize({ width: W, height: H, fit: 'cover', position: 'centre' }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()
    return { data, action: 'crop' }
  }
  const background = await sharp(input).resize({ width: W, height: H, fit: 'cover', position: 'centre' }).blur(36).toBuffer()
  const foreground = await sharp(input).resize({ width: W, height: H, fit: 'inside' }).toBuffer()
  const data = await sharp(background).composite([{ input: foreground, gravity: 'centre' }]).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()
  return { data, action: 'complete' }
}
