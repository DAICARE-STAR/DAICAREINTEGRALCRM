// Estados de un proyecto del lado Node (textos para la IA, HubSpot y el bot).
//
// El valor guardado no cambia: projects.status sigue siendo 'Listo' para el
// cierre positivo (CHECK de la migración 19); solo cambia lo que lee una
// persona o un modelo, que dice «Ganado».
//
// Tabla gemela de public/apps/shared/estados.js (apps estáticas). El test
// netlify/lib/__tests__/estados.test.ts ejecuta ese archivo y verifica que
// ambas dicen lo mismo: si se cambia una, se cambia la otra.

export const ESTADOS_PROYECTO = [
  'Sin empezar',
  'En progreso',
  'Detenido sin respuesta',
  'Listo',
  'No se realizará',
] as const

export const ESTADO_GANADO = 'Listo'
export const ESTADO_PERDIDO = 'No se realizará'

export function etiquetaEstado(s: string | null | undefined): string {
  if (!s) return 'sin estado'
  return s === ESTADO_GANADO ? 'Ganado' : s
}
