import { fmtImporte } from '../../../lib/moneda'
import { ruta } from './categorias'
import { fmtCantidad } from './numeros'
import { nombreTipo, type Cambio, type Catalogos, type ClaseImpuesto } from './tipos'

// Reglas puras de las pantallas de Productos.

export { fmtFechaHora } from '../../crm/lib/vistas'

export type PestanaFicha = 'datos' | 'unidades' | 'historial'

export const PESTANAS_FICHA: { id: PestanaFicha; label: string }[] = [
  { id: 'datos', label: 'Datos' },
  { id: 'unidades', label: 'Unidades' },
  { id: 'historial', label: 'Historial' },
]

export function nombreUnidad(c: Catalogos, clave: string): string {
  return c.unidades.find((u) => u.clave === clave)?.nombre ?? clave
}

export function nombreImpuesto(c: Catalogos, clave: string): string {
  return c.impuestos.find((i) => i.clave === clave)?.nombre ?? clave
}

/** Precio con sus decimales significativos (hasta 4): «COP $ 10.000», «COP $ 1.250,5». */
export function fmtPrecio(importe: unknown, moneda: unknown): string {
  const s = importe === null || importe === undefined ? '' : String(importe)
  const d = (s.split('.')[1] ?? '').replace(/0+$/, '').length
  return fmtImporte(importe, moneda, Math.min(4, d))
}

/** «IVA general · 19 %»; exenta o excluida sin porcentaje. */
export function textoClase(i: ClaseImpuesto | undefined, clave: string): string {
  if (!i) return clave
  return i.tratamiento === 'gravado' ? `${i.nombre} · ${fmtCantidad(i.porcentaje)} %` : i.nombre
}

const ETIQUETAS: Record<string, string> = {
  codigo: 'Código',
  nombre: 'Nombre',
  descripcion: 'Descripción',
  tipo: 'Tipo',
  vendible: 'Se vende',
  comprable: 'Se compra',
  categoria_id: 'Categoría',
  unidad_base: 'Unidad base',
  impuesto: 'Impuesto',
}

function valor(campo: string, v: unknown, c: Catalogos): string {
  if (v === null || v === undefined || v === '') return '—'
  switch (campo) {
    case 'vendible':
    case 'comprable':
      return v === true ? 'Sí' : 'No'
    case 'categoria_id':
      return ruta(c.categorias, String(v)) || '—'
    case 'unidad_base':
      return nombreUnidad(c, String(v))
    case 'impuesto':
      return nombreImpuesto(c, String(v))
    case 'tipo':
      return nombreTipo(String(v))
    case 'descripcion': {
      const s = String(v)
      return s.length > 80 ? s.slice(0, 79) + '…' : s
    }
    default:
      return String(v)
  }
}

/**
 * Líneas legibles de un cambio del producto o de sus conversiones:
 * «Precio de lista: COP $ 10.000 → COP $ 12.000», «Unidad alterna caja:
 * factor 10 → 12». `moneda` es la del producto, para el precio cuando en el
 * cambio solo viaja el importe.
 */
export function describirCambio(cambio: Cambio, c: Catalogos, moneda: string | null): string[] {
  const antes = cambio.antes ?? {}
  const despues = cambio.despues ?? {}
  if (cambio.entidad === 'conversion') {
    const u = nombreUnidad(c, String(despues.unidad ?? antes.unidad ?? ''))
    if (cambio.operacion === 'insert') return [`Unidad alterna ${u} añadida: factor ${fmtCantidad(String(despues.factor))}`]
    if (cambio.operacion === 'delete') return [`Unidad alterna ${u} quitada`]
    return [`Unidad alterna ${u}: factor ${fmtCantidad(String(antes.factor))} → ${fmtCantidad(String(despues.factor))}`]
  }
  if (cambio.operacion === 'insert') return ['Producto creado']
  if (cambio.operacion === 'delete') return ['Producto borrado']
  const lineas: string[] = []
  for (const campo of cambio.campos) {
    if (campo === 'archivado_en') lineas.push(despues.archivado_en ? 'Archivado' : 'Restaurado')
    else if (campo === 'precio_lista' || (campo === 'precio_lista_moneda' && !cambio.campos.includes('precio_lista'))) {
      const mAntes = (antes.precio_lista_moneda as string | undefined) ?? moneda
      const mDespues = (despues.precio_lista_moneda as string | undefined) ?? moneda
      const precioAntes = 'precio_lista' in antes ? antes.precio_lista : null
      const precioDespues = 'precio_lista' in despues ? despues.precio_lista : null
      lineas.push(`Precio de lista: ${fmtPrecio(precioAntes, mAntes)} → ${fmtPrecio(precioDespues, mDespues)}`)
    } else if (ETIQUETAS[campo]) {
      lineas.push(`${ETIQUETAS[campo]}: ${valor(campo, antes[campo], c)} → ${valor(campo, despues[campo], c)}`)
    }
  }
  return lineas.length > 0 ? lineas : ['Cambios internos']
}
