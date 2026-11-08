// Navegación con flechas en grupos de controles (pestañas, menús): a qué
// índice va el foco con cada tecla. Función pura, sin DOM: la usan
// <Pestanas> (horizontal) y el menú de usuario del shell (vertical).

export type Orientacion = 'horizontal' | 'vertical'

/**
 * Índice siguiente al pulsar `tecla` estando en `actual` dentro de `total`
 * elementos, o null si la tecla no navega (o no hay elementos).
 * Las flechas son circulares; Inicio y Fin van al primero y al último.
 * Si `actual` está fuera de rango (nada enfocado todavía), avanzar va al
 * primero y retroceder al último.
 */
export function indiceSiguiente(
  actual: number,
  total: number,
  tecla: string,
  orientacion: Orientacion = 'horizontal'
): number | null {
  if (total <= 0) return null
  const [atras, adelante] =
    orientacion === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
  const fuera = actual < 0 || actual >= total

  if (tecla === adelante) return fuera ? 0 : (actual + 1) % total
  if (tecla === atras) return fuera ? total - 1 : (actual - 1 + total) % total
  if (tecla === 'Home') return 0
  if (tecla === 'End') return total - 1
  return null
}
