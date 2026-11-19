// Mensajes en español para los errores de la base, por código y pista (las
// que emite 22-catalogo.sql), nunca por el texto.

export class SinFilas extends Error {
  constructor() {
    super('sin_filas')
    this.name = 'SinFilas'
  }
}

/** El producto cambió desde que se leyó (edición concurrente, BL-09). */
export class Conflicto extends Error {
  constructor() {
    super('conflicto')
    this.name = 'Conflicto'
  }
}

/** La lista cambió entre páginas de la exportación. */
export class ListaCambiada extends Error {
  constructor() {
    super('lista_cambiada')
    this.name = 'ListaCambiada'
  }
}

export const PISTAS: Record<string, string> = {
  productos_sin_permiso: 'No tienes permiso para editar productos.',
  productos_importar: 'No tienes permiso para importar productos.',
  productos_impuestos_admin: 'Solo un administrador cambia la clase de impuesto predeterminada.',
  productos_codigo_serie: 'La numeración automática no da un código válido; revisa el prefijo de la serie producto o escribe el código.',
  productos_codigo_archivado: 'El código de un producto archivado no se cambia.',
  productos_codigo_en_uso: 'El código no se cambia: el producto ya aparece en documentos o movimientos.',
  productos_sin_impuesto: 'No hay una clase de impuesto predeterminada; pide a un administrador que marque una.',
  productos_moneda: 'El precio de lista va en la moneda de la instalación.',
  productos_unidad_con_conversiones: 'La unidad base no cambia mientras el producto tenga unidades alternas; quítalas primero.',
  productos_unidad_con_precio: 'La unidad base no cambia con precio de lista: quita el precio, cambia la unidad y vuelve a ponerlo.',
  productos_unidad_en_uso: 'La unidad base no cambia: el producto ya aparece en documentos o movimientos.',
  productos_unidad_archivada: 'La unidad está archivada.',
  productos_impuesto_archivado: 'La clase de impuesto está archivada.',
  productos_categoria_archivada: 'La categoría está archivada.',
  productos_clave_inmutable: 'La clave no se cambia; crea otra y archiva esta.',
  productos_clase_inmutable: 'El tipo y el tratamiento de una clase no cambian; crea otra clase.',
  productos_sistema: 'La unidad del sistema no se archiva ni se borra.',
  productos_sin_predeterminado: 'Tiene que haber exactamente una clase de impuesto predeterminada y activa.',
  productos_categoria_ciclo: 'Una categoría no puede quedar dentro de sí misma.',
  productos_categoria_profundidad: 'Las categorías llegan hasta tres niveles.',
  productos_categoria_con_hijas: 'Archiva antes sus subcategorías.',
  productos_no_existe: 'El producto no existe.',
  productos_conversion_base: 'La unidad base no lleva conversión.',
  productos_factor_inexacto: 'Ese factor no es exacto: usa como unidad base la unidad menor.',
  productos_unidad_sin_conversion: 'El producto no tiene conversión a esa unidad.',
  productos_archivado: 'El producto está archivado.',
  productos_uso: 'El uso es venta o compra.',
  productos_importar_lote: 'Un lote admite hasta 500 filas.',
  productos_importar_fila: 'La fila no tiene el formato esperado.',
  productos_importar_nombre: 'Ya existe un producto con ese nombre; pon su código.',
  productos_conversion_repetida: 'Una unidad alterna va una sola vez.',
  productos_impuesto_no_existe: 'La clase de impuesto no existe.',
}

type ErrorPg = { code?: unknown; hint?: unknown }

export type Entidad = 'producto' | 'categoria' | 'unidad' | 'impuesto' | 'conversion'

const DUPLICADO: Record<Entidad, string> = {
  producto: 'Ya existe un producto con ese código, también entre los archivados.',
  categoria: 'Ya hay una categoría activa con ese nombre en el mismo nivel.',
  unidad: 'Ya existe una unidad con esa clave o con ese nombre.',
  impuesto: 'Ya existe una clase con esa clave.',
  conversion: 'El producto ya tiene esa unidad alterna.',
}

/**
 * `entidad` distingue el duplicado; `borrando` dice que un 23503 es una
 * referencia que impide borrar.
 */
export function traducirError(err: unknown, opciones: { entidad?: Entidad; borrando?: boolean } = {}): string {
  if (err instanceof SinFilas) return 'No se guardó nada: no tienes permiso o el registro ya no existe.'
  if (err instanceof Conflicto) return 'Otra persona cambió este producto. Recarga para ver sus cambios.'
  if (err instanceof ListaCambiada) return 'La lista cambió mientras se exportaba. Vuelve a intentarlo.'
  const e = (typeof err === 'object' && err !== null ? err : {}) as ErrorPg
  const code = typeof e.code === 'string' ? e.code : ''
  const hint = typeof e.hint === 'string' ? e.hint : ''
  if (PISTAS[hint]) return PISTAS[hint]
  switch (code) {
    case '23505':
      return opciones.entidad ? DUPLICADO[opciones.entidad] : 'El registro ya existe.'
    case '23503':
      return opciones.borrando ? 'No se puede borrar porque está en uso; archívalo.' : 'El registro relacionado ya no existe.'
    case '23502':
      return 'Falta un dato obligatorio.'
    case '23514':
      return 'Algún dato no cumple el formato esperado.'
    case '42501':
      return 'No tienes permiso para esta acción.'
    case '22P02':
    case '22023':
    case '22003':
      return 'Algún dato no es válido.'
    case 'PGRST116':
      return 'El registro no existe o no tienes acceso.'
    case '40P01':
      return 'Otra importación escribía lo mismo a la vez; vuelve a importar esta fila.'
    default:
      return 'No se pudo completar la operación.'
  }
}

/** Mensaje de una fila del resultado de productos_importar ({pista, mensaje}). */
export function errorDeFila(e: { pista?: unknown; mensaje?: unknown }): string {
  const pista = typeof e.pista === 'string' ? e.pista : ''
  if (pista === 'productos_importar_repetido' && typeof e.mensaje === 'string') {
    return e.mensaje.replace(/^repetido/, 'Repetido')
  }
  if (PISTAS[pista]) return PISTAS[pista]
  return traducirError({ code: pista, hint: '' }, { entidad: 'producto' })
}

/** Campo del formulario al que se refiere un error de la base, para mostrarlo junto a él. */
export function campoDeError(err: unknown): 'codigo' | 'unidad_base' | 'impuesto' | 'precio' | 'categoria_id' | null {
  const e = (typeof err === 'object' && err !== null ? err : {}) as ErrorPg
  const hint = typeof e.hint === 'string' ? e.hint : ''
  const code = typeof e.code === 'string' ? e.code : ''
  if (hint.startsWith('productos_codigo') || code === '23505') return 'codigo'
  if (hint.startsWith('productos_unidad')) return 'unidad_base'
  if (hint.startsWith('productos_impuesto') || hint === 'productos_sin_impuesto') return 'impuesto'
  if (hint === 'productos_moneda') return 'precio'
  if (hint === 'productos_categoria_archivada') return 'categoria_id'
  return null
}
