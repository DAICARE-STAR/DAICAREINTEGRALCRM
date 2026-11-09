import type { TipoCuenta } from './tipos'

// Estado de los filtros de la lista de cuentas. '' y false son los neutros.
export type FiltrosCrm = {
  q: string
  tipo: '' | TipoCuenta
  etapa: string
  origen: string
  responsable: string
  etiqueta: string
  archivadas: boolean
}

export const FILTROS_VACIOS: FiltrosCrm = {
  q: '', tipo: '', etapa: '', origen: '', responsable: '', etiqueta: '', archivadas: false,
}

const TEXTOS = ['q', 'etapa', 'origen', 'responsable', 'etiqueta'] as const

export function desdeParametros(p: URLSearchParams): FiltrosCrm {
  const f: FiltrosCrm = { ...FILTROS_VACIOS }
  for (const k of TEXTOS) f[k] = p.get(k) ?? ''
  const tipo = p.get('tipo')
  f.tipo = tipo === 'persona' || tipo === 'empresa' ? tipo : ''
  f.archivadas = p.get('archivadas') === '1'
  return f
}

// Solo escribe los filtros no neutros, para que la URL quede corta
export function aParametros(f: FiltrosCrm): URLSearchParams {
  const p = new URLSearchParams()
  for (const k of TEXTOS) if (f[k].trim()) p.set(k, f[k].trim())
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.archivadas) p.set('archivadas', '1')
  return p
}

export function filtrosActivos(f: FiltrosCrm): number {
  let n = 0
  for (const k of TEXTOS) if (f[k].trim()) n++
  if (f.tipo) n++
  if (f.archivadas) n++
  return n
}

export type ParametrosRpc = {
  p_q: string | null
  p_tipo: string | null
  p_etapa: string | null
  p_origen: string | null
  p_responsable: string | null
  p_etiqueta: string | null
  p_archivadas: boolean
  p_limite: number
  p_desde: number
}

function nulo(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

// Parámetros de la RPC crm_buscar. Límite entre 1 y 200; desde ≥ 0.
export function aParametrosRpc(f: FiltrosCrm, desde: number, limite: number): ParametrosRpc {
  const lim = Number.isFinite(limite) ? Math.min(200, Math.max(1, Math.trunc(limite))) : 50
  const des = Number.isFinite(desde) ? Math.max(0, Math.trunc(desde)) : 0
  return {
    p_q: nulo(f.q),
    p_tipo: nulo(f.tipo),
    p_etapa: nulo(f.etapa),
    p_origen: nulo(f.origen),
    p_responsable: nulo(f.responsable),
    p_etiqueta: nulo(f.etiqueta),
    p_archivadas: f.archivadas,
    p_limite: lim,
    p_desde: des,
  }
}
