import { ruta } from './categorias'
import { escribirConversiones } from './conversiones'
import { COLUMNAS, ENCABEZADOS, PREFIJO_EJEMPLO } from './importador'
import { aTextoComa } from './numeros'
import type { Catalogos, Conversion, Producto } from './tipos'

// Exportación CSV de la lista filtrada, reimportable entera: las columnas de
// la plantilla en el mismo orden, números con coma decimal y sin miles.

export const TOPE_EXPORTAR = 20000
export const PAGINA_EXPORTAR = 200

export function encabezados(): string[] {
  return COLUMNAS.map((c) => ENCABEZADOS[c])
}

const siNo = (b: boolean) => (b ? 'sí' : 'no')

export function filaExportada(p: Producto, conversiones: Conversion[], catalogos: Catalogos): string[] {
  return [
    p.codigo,
    p.nombre,
    p.tipo,
    siNo(p.vendible),
    siNo(p.comprable),
    ruta(catalogos.categorias, p.categoria_id),
    p.unidad_base,
    escribirConversiones(conversiones.filter((c) => c.producto_id === p.id)),
    p.impuesto,
    aTextoComa(p.precio_lista),
    p.precio_lista === null ? '' : p.precio_lista_moneda ?? '',
    p.descripcion ?? '',
    siNo(p.archivado_en !== null),
  ]
}

export function exportarProductos(productos: Producto[], conversiones: Conversion[], catalogos: Catalogos): string[][] {
  return [encabezados(), ...productos.map((p) => filaExportada(p, conversiones, catalogos))]
}

// Encabezados más una fila de ejemplo que el importador omite
export function plantilla(catalogos: Catalogos, moneda: string): string[][] {
  const impuesto = catalogos.impuestos.find((i) => i.predeterminado && !i.archivado_en)?.clave ?? ''
  return [
    encabezados(),
    [
      PREFIJO_EJEMPLO + 'A100', 'Producto de ejemplo', 'bien', 'sí', 'sí', '', 'und', 'caja=12',
      impuesto, '1.250,5', moneda, '', 'no',
    ],
  ]
}

/**
 * Comprueba que las páginas forman la lista entera: el total no cambió entre
 * páginas, llegaron tantas filas como dice y ninguna se repite. Si no, la
 * lista cambió mientras se exportaba.
 */
export function paginasCompletas(paginas: { filas: { id: string }[]; total: number }[]): boolean {
  if (paginas.length === 0) return true
  const total = paginas[0].total
  if (paginas.some((p) => p.total !== total)) return false
  const ids = new Set(paginas.flatMap((p) => p.filas.map((f) => f.id)))
  return ids.size === total && paginas.reduce((n, p) => n + p.filas.length, 0) === total
}
