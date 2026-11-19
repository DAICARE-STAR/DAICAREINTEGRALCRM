import { logAction } from '../../../lib/audit'
import { supabase } from '../../../lib/supabase'
import { normalizarNombre } from './codigo'
import { Conflicto, ListaCambiada, SinFilas } from './errores'
import { PAGINA_EXPORTAR, paginasCompletas, TOPE_EXPORTAR } from './exportador'
import { aParametrosRpc, type FiltrosProductos } from './filtros'
import { leerRespuesta, type FilaResultado, type FilaRpc } from './importador'
import type { DatosProducto } from './validacion'
import type { Cambio, Catalogos, Categoria, ClaseImpuesto, Conversion, Producto, Unidad } from './tipos'

// Acceso a Supabase del módulo Productos (22-catalogo.sql). Cada escritura
// pide .select() y falla si no tocó filas: la RLS no da error, devuelve
// cero filas. La base hace cumplir permisos y reglas; aquí solo se traduce.

export { traducirError, campoDeError, Conflicto, ListaCambiada, SinFilas } from './errores'

function afectadas<T>(rows: T[] | null): T[] {
  if (!rows || rows.length === 0) throw new SinFilas()
  return rows
}

// ---------- Catálogos ----------

export async function leerCatalogos(): Promise<Catalogos> {
  const [cat, uni, imp] = await Promise.all([
    supabase.from('productos_categorias').select('id, nombre, padre_id, orden, archivado_en').order('orden').order('nombre'),
    supabase.from('productos_unidades').select('clave, nombre, simbolo, decimales, sistema, archivado_en').order('nombre'),
    supabase.from('productos_impuestos').select('clave, nombre, tipo, tratamiento, porcentaje, predeterminado, archivado_en').order('nombre'),
  ])
  if (cat.error) throw cat.error
  if (uni.error) throw uni.error
  if (imp.error) throw imp.error
  return {
    categorias: (cat.data ?? []) as Categoria[],
    unidades: (uni.data ?? []) as Unidad[],
    impuestos: (imp.data ?? []) as ClaseImpuesto[],
  }
}

export async function guardarCategoria(id: string | null, datos: { nombre: string; padre_id: string | null; orden?: number }): Promise<void> {
  const consulta = id
    ? supabase.from('productos_categorias').update(datos).eq('id', id)
    : supabase.from('productos_categorias').insert(datos)
  const { data, error } = await consulta.select('id')
  if (error) throw error
  afectadas(data)
}

/** Crea las categorías de una ruta «A / B / C» que falten; devuelve el id de la última. */
export async function crearRuta(partes: string[], existentes: Categoria[]): Promise<string> {
  let padre: string | null = null
  const lista = [...existentes]
  for (const nombre of partes) {
    const n = normalizarNombre(nombre)
    const hallada: Categoria | undefined = lista.find((c) => !c.archivado_en && c.padre_id === padre && normalizarNombre(c.nombre) === n)
    if (hallada) {
      padre = hallada.id
      continue
    }
    const { data, error } = await supabase.from('productos_categorias').insert({ nombre, padre_id: padre }).select('id, nombre, padre_id, orden, archivado_en')
    if (error) throw error
    const nueva = afectadas(data)[0] as Categoria
    lista.push(nueva)
    padre = nueva.id
  }
  if (!padre) throw new SinFilas()
  return padre
}

export async function archivarCategoria(id: string, archivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('productos_categorias')
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
  if (error) throw error
  afectadas(data)
}

export async function guardarUnidad(nueva: boolean, u: { clave: string; nombre: string; simbolo: string | null; decimales: number }): Promise<void> {
  const consulta = nueva
    ? supabase.from('productos_unidades').insert(u)
    : supabase.from('productos_unidades').update({ nombre: u.nombre, simbolo: u.simbolo, decimales: u.decimales }).eq('clave', u.clave)
  const { data, error } = await consulta.select('clave')
  if (error) throw error
  afectadas(data)
}

export async function archivarUnidad(clave: string, archivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('productos_unidades')
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq('clave', clave)
    .select('clave')
  if (error) throw error
  afectadas(data)
}

export type DatosClase = Pick<ClaseImpuesto, 'clave' | 'nombre' | 'tipo' | 'tratamiento'> & { porcentaje: string }

export async function guardarClase(nueva: boolean, c: DatosClase): Promise<void> {
  const consulta = nueva
    ? supabase.from('productos_impuestos').insert(c)
    : supabase.from('productos_impuestos').update({ nombre: c.nombre, porcentaje: c.porcentaje }).eq('clave', c.clave)
  const { data, error } = await consulta.select('clave')
  if (error) throw error
  afectadas(data)
  void logAction(nueva ? 'productos.impuesto_crear' : 'productos.impuesto_editar', `Clase de impuesto ${c.clave}`, 'productos_impuestos', c.clave)
}

export async function archivarClase(clave: string, archivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('productos_impuestos')
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq('clave', clave)
    .select('clave')
  if (error) throw error
  afectadas(data)
}

export async function predeterminarClase(clave: string): Promise<void> {
  const { error } = await supabase.rpc('productos_impuesto_predeterminar', { p_clave: clave })
  if (error) throw error
  void logAction('productos.impuesto_predeterminar', `Clase predeterminada ${clave}`, 'productos_impuestos', clave)
}

// ---------- Productos ----------

export type PaginaProductos = { filas: Producto[]; total: number }

/** productos_buscar devuelve {fila, total}: la fila entera como objeto. */
export async function buscarProductos(f: FiltrosProductos, desde = 0, limite = 50): Promise<PaginaProductos> {
  const { data, error } = await supabase.rpc('productos_buscar', aParametrosRpc(f, desde, limite))
  if (error) throw error
  const filas = (data ?? []) as { fila: Producto; total: number }[]
  return { filas: filas.map((x) => x.fila), total: Number(filas[0]?.total ?? 0) }
}

export async function leerProducto(id: string): Promise<Producto> {
  const { data, error } = await supabase.from('productos').select('*').eq('id', id).single()
  if (error) throw error
  return data as Producto
}

export async function crearProducto(datos: DatosProducto): Promise<Producto> {
  const { data, error } = await supabase.from('productos').insert({ ...datos, precio_lista_moneda: null }).select('*')
  if (error) throw error
  const p = afectadas(data)[0] as Producto
  void logAction('productos.crear', `Creó el producto ${p.codigo}`, 'productos', p.id)
  return p
}

/**
 * Guarda solo los cambios, con la marca updated_at leída: si otra persona
 * guardó antes, no toca filas y es un conflicto.
 */
export async function editarProducto(p: Producto, cambios: Record<string, unknown>): Promise<Producto> {
  if (Object.keys(cambios).length === 0) return p
  const { data, error } = await supabase.from('productos').update(cambios).eq('id', p.id).eq('updated_at', p.updated_at).select('*')
  if (error) throw error
  if (!data || data.length === 0) throw new Conflicto()
  void logAction('productos.editar', `Editó el producto ${p.codigo}: ${Object.keys(cambios).join(', ')}`, 'productos', p.id)
  return data[0] as Producto
}

export async function archivarProducto(id: string, archivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('productos')
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
  if (error) throw error
  afectadas(data)
  void logAction(archivar ? 'productos.archivar' : 'productos.restaurar', archivar ? 'Archivó un producto' : 'Restauró un producto', 'productos', id)
}

export async function borrarProducto(id: string): Promise<void> {
  const { data, error } = await supabase.from('productos').delete().eq('id', id).select('id')
  if (error) throw error
  afectadas(data)
}

// ---------- Conversiones ----------

/** Por páginas de 1000: la API corta en silencio en max_rows (1000 en Supabase). */
export async function leerConversiones(ids: string[]): Promise<Conversion[]> {
  if (ids.length === 0) return []
  const salida: Conversion[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('productos_conversiones')
      .select('producto_id, unidad, factor')
      .in('producto_id', ids)
      .order('producto_id')
      .order('unidad')
      .range(desde, desde + 999)
    if (error) throw error
    salida.push(...((data ?? []) as Conversion[]))
    if (!data || data.length < 1000) return salida
  }
}

export async function guardarConversion(nueva: boolean, c: { producto_id: string; unidad: string; factor: string }): Promise<void> {
  const consulta = nueva
    ? supabase.from('productos_conversiones').insert(c)
    : supabase.from('productos_conversiones').update({ factor: c.factor }).eq('producto_id', c.producto_id).eq('unidad', c.unidad)
  const { data, error } = await consulta.select('unidad')
  if (error) throw error
  afectadas(data)
}

export async function quitarConversion(productoId: string, unidad: string): Promise<void> {
  const { data, error } = await supabase.from('productos_conversiones').delete().eq('producto_id', productoId).eq('unidad', unidad).select('unidad')
  if (error) throw error
  afectadas(data)
}

// ---------- Historial ----------

/** Los `limite` cambios más recientes y si quedan más. */
export async function leerHistorial(productoId: string, limite = 200): Promise<{ lista: Cambio[]; hayMas: boolean }> {
  const { data, error } = await supabase
    .from('productos_cambios')
    .select('id, entidad, entidad_id, operacion, campos, antes, despues, autor_id, created_at')
    .eq('entidad_id', productoId)
    .in('entidad', ['producto', 'conversion'])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limite + 1)
  if (error) throw error
  const filas = (data ?? []) as Cambio[]
  return { lista: filas.slice(0, limite), hayMas: filas.length > limite }
}

export type Persona = { id: string; nombre: string }

export async function leerPersonas(): Promise<Persona[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name')
  if (error) throw error
  return (data ?? []).map((p: { id: string; full_name: string | null }) => ({ id: p.id, nombre: p.full_name ?? p.id }))
}

// ---------- Importación y exportación ----------

/** Un lote en productos_importar; con simular, la base deshace todo. */
export async function importarLote(filas: FilaRpc[], simular: boolean): Promise<FilaResultado[]> {
  const { data, error } = await supabase.rpc('productos_importar', { p_filas: filas, p_simular: simular })
  if (error) throw error
  return leerRespuesta(data)
}

/** Más de TOPE_EXPORTAR productos con estos filtros. */
export class DemasiadosParaExportar extends Error {
  constructor() {
    super('demasiados')
    this.name = 'DemasiadosParaExportar'
  }
}

/**
 * Recorre productos_buscar de 200 en 200 con los filtros de la lista y lee
 * las conversiones de cada página. Si el total cambia entre páginas, se
 * detiene: la lista cambió mientras se exportaba.
 */
export async function productosParaExportar(f: FiltrosProductos): Promise<{ productos: Producto[]; conversiones: Conversion[] }> {
  const paginas: PaginaProductos[] = []
  const conversiones: Conversion[] = []
  for (let desde = 0; ; desde += PAGINA_EXPORTAR) {
    const pagina = await buscarProductos(f, desde, PAGINA_EXPORTAR)
    // Una página vacía no trae total (llega 0): la cuenta la cierra paginasCompletas
    if (desde > 0 && pagina.filas.length === 0) break
    if (pagina.total > TOPE_EXPORTAR) throw new DemasiadosParaExportar()
    paginas.push(pagina)
    if (paginas.length > 1 && pagina.total !== paginas[0].total) throw new ListaCambiada()
    conversiones.push(...(await leerConversiones(pagina.filas.map((p) => p.id))))
    if (pagina.filas.length < PAGINA_EXPORTAR || desde + PAGINA_EXPORTAR >= pagina.total) break
  }
  if (!paginasCompletas(paginas)) throw new ListaCambiada()
  return { productos: paginas.flatMap((p) => p.filas), conversiones }
}
