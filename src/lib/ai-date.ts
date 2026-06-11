/** Returns a date-context prefix to prepend to Claude system prompts. */
export function datePrefix(): string {
  const fecha = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return (
    `La fecha actual es ${fecha}. ` +
    `Toda la información que generes debe ser actualizada a esta fecha. ` +
    `No menciones años anteriores como si fueran vigentes. ` +
    `Si hablas de deadlines, fechas límite o información del IRS, usa el año 2026.\n`
  )
}
