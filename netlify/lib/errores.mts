// Errores hacia el log y hacia el cliente (seguridad.md: «hacia el cliente
// van errores genéricos; el detalle queda en el log»). Sin red ni efectos.
//
// - resumenError: lo único de un error que se escribe en el log: nombre,
//   código (PostgREST, Node o nodemailer) y el mensaje recortado. Nunca el
//   objeto completo, el stack ni campos con cuerpos de terceros (response,
//   responseText, body), que pueden traer datos personales o credenciales.
// - ErrorUsuario: un error cuyo texto lo escribimos nosotros para la persona
//   (por ejemplo el rechazo del anti-SSRF) y sí puede llegar al cliente.

export type ResumenError = { nombre: string; codigo: string | null; mensaje: string }

const MAX_MENSAJE = 200

export function resumenError(err: unknown): ResumenError {
  if (err === null || err === undefined) return { nombre: 'Error', codigo: null, mensaje: '' }
  if (typeof err !== 'object') return { nombre: 'Error', codigo: null, mensaje: String(err).slice(0, MAX_MENSAJE) }
  const e = err as { name?: unknown; code?: unknown; message?: unknown }
  const nombre = typeof e.name === 'string' && e.name ? e.name : 'Error'
  const codigo = typeof e.code === 'string' || typeof e.code === 'number' ? String(e.code).slice(0, 40) : null
  const mensaje = typeof e.message === 'string' ? e.message.slice(0, MAX_MENSAJE) : ''
  return { nombre, codigo, mensaje }
}

// Del cuerpo de error de un tercero, solo su categoría: `category` de
// HubSpot, el `error` de Google OAuth (invalid_grant) o el `error.status` de
// las API de Google (PERMISSION_DENIED). Nunca el texto, que puede traer
// correos, nombres o los datos que se enviaron.
export function categoriaError(cuerpo: string): string | null {
  let d: unknown
  try {
    d = JSON.parse(cuerpo)
  } catch {
    return null
  }
  if (!d || typeof d !== 'object') return null
  const o = d as { category?: unknown; error?: unknown }
  const valor =
    typeof o.category === 'string'
      ? o.category
      : typeof o.error === 'string'
        ? o.error
        : o.error && typeof o.error === 'object' && typeof (o.error as { status?: unknown }).status === 'string'
          ? (o.error as { status: string }).status
          : null
  return valor ? valor.slice(0, 60) : null
}

export class ErrorUsuario extends Error {
  readonly usuario = true
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorUsuario'
  }
}
