// Tipos del módulo Productos (fase 0.7). Forma de las filas de
// supabase/esquema/22-catalogo.sql; los importes llegan como número o como
// texto numérico (numeric de Postgres por la API).

export type TipoProducto = 'bien' | 'servicio'

export type Producto = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  tipo: TipoProducto
  vendible: boolean
  comprable: boolean
  categoria_id: string | null
  unidad_base: string
  impuesto: string
  precio_lista: number | string | null
  precio_lista_moneda: string | null
  archivado_en: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type Categoria = {
  id: string
  nombre: string
  padre_id: string | null
  orden: number
  archivado_en: string | null
}

export type Unidad = {
  clave: string
  nombre: string
  simbolo: string | null
  decimales: number
  sistema: boolean
  archivado_en: string | null
}

export type TipoImpuesto = 'iva' | 'inc' | 'otro'
export type Tratamiento = 'gravado' | 'exento' | 'excluido'

export type ClaseImpuesto = {
  clave: string
  nombre: string
  tipo: TipoImpuesto
  tratamiento: Tratamiento
  porcentaje: number | string
  predeterminado: boolean
  archivado_en: string | null
}

export type Conversion = {
  producto_id: string
  unidad: string
  factor: number | string
}

export type Cambio = {
  id: number
  entidad: 'producto' | 'conversion' | 'unidad' | 'impuesto' | 'categoria'
  entidad_id: string
  operacion: 'insert' | 'update' | 'delete'
  campos: string[]
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
  autor_id: string | null
  created_at: string
}

// Catálogos que necesitan la lista, la ficha, el formulario y el importador
export type Catalogos = {
  categorias: Categoria[]
  unidades: Unidad[]
  impuestos: ClaseImpuesto[]
}

export const CATALOGOS_VACIOS: Catalogos = { categorias: [], unidades: [], impuestos: [] }

export const TIPOS_PRODUCTO: { valor: TipoProducto; label: string }[] = [
  { valor: 'bien', label: 'Bien' },
  { valor: 'servicio', label: 'Servicio' },
]

export const nombreTipo = (t: string) => TIPOS_PRODUCTO.find((x) => x.valor === t)?.label ?? t

export const TIPOS_IMPUESTO: { valor: TipoImpuesto; label: string }[] = [
  { valor: 'iva', label: 'IVA' },
  { valor: 'inc', label: 'Impuesto al consumo' },
  { valor: 'otro', label: 'Otro' },
]

export const TRATAMIENTOS: { valor: Tratamiento; label: string }[] = [
  { valor: 'gravado', label: 'Gravado' },
  { valor: 'exento', label: 'Exento' },
  { valor: 'excluido', label: 'Excluido' },
]
