import { supabase } from './supabase'

// Cliente único de /api/connector-proxy (N-6). El cuerpo es { action, datos }
// (el proxy lo valida con .strict()); el error que llega a la interfaz es el
// texto genérico del servidor y, aparte, su código (modulo_inactivo, sin_permiso…).

export class ErrorProxy extends Error {
  readonly status: number
  readonly codigo: string | null
  constructor(mensaje: string, status: number, codigo: string | null) {
    super(mensaje)
    this.name = 'ErrorProxy'
    this.status = status
    this.codigo = codigo
  }
}

export function cuerpoProxy(action: string, datos?: object): string {
  return JSON.stringify(datos === undefined ? { action } : { action, datos })
}

export async function llamarProxy<T>(action: string, datos?: object): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErrorProxy('Sin sesión', 401, 'no_autenticado')
  const res = await fetch('/api/connector-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: cuerpoProxy(action, datos),
  })
  const json = (await res.json().catch(() => null)) as (T & { error?: string; codigo?: string }) | null
  if (!res.ok || !json) {
    throw new ErrorProxy(json?.error ?? `Error del servidor (${res.status})`, res.status, json?.codigo ?? null)
  }
  return json
}
