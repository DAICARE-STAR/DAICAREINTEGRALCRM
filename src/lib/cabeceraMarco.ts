// Lógica pura de la cabecera fija del shell (GUIA-UI, «Cabeceras»): cada
// página registra lo que muestra la cabecera del marco y el marco pinta la
// última registrada. Sin React ni DOM, para probarla con Vitest.
//
// Al navegar, la página que sale y la que entra pueden quitar y registrar en
// el mismo tick y en cualquier orden: manda siempre la que se registró por
// última vez y sigue registrada. Actualizar una registrada la cambia en su
// sitio, sin robarle el turno a otra más reciente.

export interface Registro<T> {
  id: string
  datos: T
}

/** Registra o actualiza (en su sitio) la cabecera de `id`. */
export function registrar<T>(lista: readonly Registro<T>[], id: string, datos: T): Registro<T>[] {
  const i = lista.findIndex((r) => r.id === id)
  if (i === -1) return [...lista, { id, datos }]
  const copia = [...lista]
  copia[i] = { id, datos }
  return copia
}

/** Quita la cabecera de `id`; sin ella, devuelve la misma lista (sin repintar). */
export function quitar<T>(lista: Registro<T>[], id: string): Registro<T>[] {
  return lista.some((r) => r.id === id) ? lista.filter((r) => r.id !== id) : lista
}

/** La cabecera que pinta el marco: la última registrada, o null. */
export function cabeceraActiva<T>(lista: readonly Registro<T>[]): T | null {
  return lista.length > 0 ? lista[lista.length - 1].datos : null
}

// Mientras una página carga y aún no registró su cabecera, el marco muestra
// el título conocido de la ruta (o un esqueleto si no lo hay), nunca el de
// la página anterior. Las apps se resuelven con su slug en el shell.
export type ModuloRuta =
  | 'inicio'
  | 'herramientas'
  | 'chat'
  | 'correo'
  | 'calendario'
  | 'equipo'
  | 'sitio-web'
  | 'admin'

export type RutaCabecera = { modulo: ModuloRuta; titulo: string } | { app: string }

const RUTAS: Record<string, { modulo: ModuloRuta; titulo: string }> = {
  '': { modulo: 'inicio', titulo: 'Inicio' },
  herramientas: { modulo: 'herramientas', titulo: 'Herramientas' },
  chat: { modulo: 'chat', titulo: 'Chat' },
  correo: { modulo: 'correo', titulo: 'Correo' },
  calendario: { modulo: 'calendario', titulo: 'Calendario' },
  equipo: { modulo: 'equipo', titulo: 'Equipo' },
  'sitio-web': { modulo: 'sitio-web', titulo: 'Sitio web' },
  admin: { modulo: 'admin', titulo: 'Administración' },
}

/** Cabecera de respaldo de una ruta del shell, o null si no se conoce. */
export function rutaDeCabecera(pathname: string): RutaCabecera | null {
  const partes = pathname.split('/').filter(Boolean)
  const [primera = '', segunda] = partes
  if (primera === 'apps' || primera === 'app') {
    return segunda && partes.length === 2 ? { app: segunda } : null
  }
  const ruta = Object.prototype.hasOwnProperty.call(RUTAS, primera) ? RUTAS[primera] : undefined
  if (!ruta) return null
  // Solo Administración tiene subrutas (/admin/:seccion)
  if (partes.length > (primera === 'admin' ? 2 : 1)) return null
  return ruta
}
