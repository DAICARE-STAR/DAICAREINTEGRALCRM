import type { TipoProducto } from './tipos'

// Filtros de la lista de productos, en la URL. '' y false son los neutros.
// «Uso» es el p_uso de productos_buscar: se vende o se compra.

export type Uso = '' | 'venta' | 'compra'

export type FiltrosProductos = {
  q: string
  categoria: string
  tipo: '' | TipoProducto
  uso: Uso
  archivados: boolean
}

export const FILTROS_VACIOS: FiltrosProductos = { q: '', categoria: '', tipo: '', uso: '', archivados: false }

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const esUuid = (s: string): boolean => RE_UUID.test(s)

export function desdeParametros(p: URLSearchParams): FiltrosProductos {
  const tipo = p.get('tipo')
  const uso = p.get('uso')
  const categoria = p.get('categoria') ?? ''
  return {
    q: p.get('q') ?? '',
    categoria: RE_UUID.test(categoria) ? categoria : '',
    tipo: tipo === 'bien' || tipo === 'servicio' ? tipo : '',
    uso: uso === 'venta' || uso === 'compra' ? uso : '',
    archivados: p.get('archivados') === '1',
  }
}

// Solo los filtros no neutros, para que la URL quede corta
export function aParametros(f: FiltrosProductos): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.categoria) p.set('categoria', f.categoria)
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.uso) p.set('uso', f.uso)
  if (f.archivados) p.set('archivados', '1')
  return p
}

export function filtrosActivos(f: FiltrosProductos): number {
  return [f.q.trim(), f.categoria, f.tipo, f.uso].filter(Boolean).length + (f.archivados ? 1 : 0)
}

export type ParametrosRpc = {
  p_q: string | null
  p_categoria: string | null
  p_subcategorias: boolean
  p_tipo: string | null
  p_uso: string | null
  p_archivados: boolean
  p_limite: number
  p_desde: number
}

// Parámetros de productos_buscar: vacíos en null, límite entre 1 y 200, desde ≥ 0
export function aParametrosRpc(f: FiltrosProductos, desde: number, limite: number): ParametrosRpc {
  const lim = Number.isFinite(limite) ? Math.min(200, Math.max(1, Math.trunc(limite))) : 50
  const des = Number.isFinite(desde) ? Math.max(0, Math.trunc(desde)) : 0
  return {
    p_q: f.q.trim() || null,
    p_categoria: f.categoria || null,
    p_subcategorias: true,
    p_tipo: f.tipo || null,
    p_uso: f.uso || null,
    p_archivados: f.archivados,
    p_limite: lim,
    p_desde: des,
  }
}
