// Enlaces que el shell sigue al abrir una notificación personal.
//
// Misma regla que el CHECK user_notifications_link_interno de la migración
// 63: una ruta absoluta del propio portal, «/» seguida de una letra. Quedan
// fuera «//host» (react-router lo trata como enlace externo), los
// esquemas (https:, javascript:) y la cadena vacía. El CHECK es NOT VALID
// —las filas viejas no se revisan— y por eso el filtro se repite al leer.
const RUTA_INTERNA = /^\/[A-Za-z]/

export function esEnlaceInterno(link: string | null | undefined): link is string {
  return typeof link === 'string' && RUTA_INTERNA.test(link)
}
