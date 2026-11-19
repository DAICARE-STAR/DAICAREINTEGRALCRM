import { describe, expect, it } from 'vitest'
import { campoDeError, Conflicto, errorDeFila, ListaCambiada, SinFilas, traducirError } from '../errores'
import { aParametros, aParametrosRpc, desdeParametros, FILTROS_VACIOS, filtrosActivos } from '../filtros'
import type { Cambio, Catalogos, Producto } from '../tipos'
import { cambiosProducto, leerPrecio, mismoImporte, validarClase, validarNombreCategoria, validarProducto, validarUnidad, type FormProducto } from '../validacion'
import { describirCambio, fmtPrecio, textoClase } from '../vistas'

const FORM: FormProducto = {
  codigo: '', nombre: ' Llave ', tipo: 'bien', vendible: true, comprable: true, categoria_id: '',
  unidad_base: 'und', impuesto: 'iva_general', precio: '', descripcion: '',
}

const PRODUCTO: Producto = {
  id: 'p1', codigo: 'AB-12', nombre: 'Llave', descripcion: null, tipo: 'bien', vendible: true, comprable: true,
  categoria_id: null, unidad_base: 'und', impuesto: 'iva_general', precio_lista: 10000, precio_lista_moneda: 'COP',
  archivado_en: null, created_by: null, updated_by: null, created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z',
}

describe('formulario de producto', () => {
  it('alta sin código: lo pone la serie (no se manda); precio vacío es sin precio', () => {
    const r = validarProducto(FORM, { nuevo: true, moneda: 'COP' })
    expect(r).toEqual({
      ok: true,
      datos: { nombre: 'Llave', descripcion: null, tipo: 'bien', vendible: true, comprable: true, categoria_id: null, unidad_base: 'und', impuesto: 'iva_general', precio_lista: null },
    })
  })

  it('normaliza el código y lee el precio con coma decimal', () => {
    const r = validarProducto({ ...FORM, codigo: ' ab 12 ', precio: '1.250,5' }, { nuevo: true, moneda: 'COP' })
    expect(r.ok && r.datos.codigo).toBe('AB12')
    expect(r.ok && r.datos.precio_lista).toBe('1250.5')
  })

  it('errores junto a cada campo', () => {
    const r = validarProducto({ ...FORM, codigo: 'ñ', nombre: ' ', precio: '-3', unidad_base: '', impuesto: '' }, { nuevo: true, moneda: 'COP' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(['codigo', 'impuesto', 'nombre', 'precio', 'unidad_base'])
    const edicion = validarProducto({ ...FORM, codigo: '' }, { nuevo: false, moneda: 'COP' })
    expect(!edicion.ok && edicion.errores.codigo).toMatch(/vacío/)
  })

  it('precio: decimales y tamaño como public.importe', () => {
    expect(leerPrecio('1,23456', 'COP')).toEqual({ ok: false, error: 'El importe admite hasta 4 decimales.' })
    expect(leerPrecio('123.456.789.012.345', 'COP')).toEqual({ ok: false, error: 'El importe es demasiado grande.' })
    expect(leerPrecio('1.250', 'COP')).toEqual({ ok: true, valor: '1250' })
    expect(leerPrecio('12', '')).toEqual({ ok: true, valor: '12' })
  })

  it('en la edición solo van los cambios; el precio con moneda nula si cambia', () => {
    const datos = { ...validarProducto({ ...FORM, codigo: 'AB-12', precio: '10.000' }, { nuevo: false, moneda: 'COP' }) }
    if (!datos.ok) throw new Error('debería validar')
    expect(cambiosProducto(PRODUCTO, datos.datos)).toEqual({})
    expect(cambiosProducto(PRODUCTO, { ...datos.datos, nombre: 'Llave fija', precio_lista: '12000' })).toEqual({
      nombre: 'Llave fija', precio_lista: '12000', precio_lista_moneda: null,
    })
    expect(mismoImporte('10000.0000', 10000)).toBe(true)
    expect(mismoImporte(null, '')).toBe(true)
    expect(mismoImporte(null, '0')).toBe(false)
  })

  it('catálogos: unidad, categoría y clase de impuesto', () => {
    expect(validarUnidad({ clave: 'caja', nombre: 'Caja', simbolo: '', decimales: '0' })).toEqual([])
    expect(validarUnidad({ clave: 'Caja', nombre: '', simbolo: 'x'.repeat(11), decimales: '7' })).toHaveLength(4)
    expect(validarNombreCategoria('A / B')).toMatch(/«\/»/)
    expect(validarNombreCategoria('Herramientas')).toBeNull()
    expect(validarClase({ clave: 'iva_general', nombre: 'IVA', tipo: 'iva', tratamiento: 'gravado', porcentaje: '19' })).toEqual([])
    expect(validarClase({ clave: 'iva_x', nombre: 'X', tipo: 'iva', tratamiento: 'exento', porcentaje: '5' })).toEqual(['Una clase exenta o excluida lleva porcentaje 0.'])
    expect(validarClase({ clave: 'iva_x', nombre: 'X', tipo: 'iva', tratamiento: 'gravado', porcentaje: '101' })).toHaveLength(1)
  })
})

describe('filtros de la lista', () => {
  it('ida y vuelta por la URL, solo lo no neutro', () => {
    const f = { q: ' llave ', categoria: '11111111-1111-1111-1111-111111111111', tipo: 'servicio' as const, uso: 'venta' as const, archivados: true }
    const p = aParametros(f)
    expect(p.toString()).toBe('q=llave&categoria=11111111-1111-1111-1111-111111111111&tipo=servicio&uso=venta&archivados=1')
    expect(desdeParametros(p)).toEqual({ ...f, q: 'llave' })
    expect(aParametros(FILTROS_VACIOS).toString()).toBe('')
    expect(desdeParametros(new URLSearchParams('tipo=x&uso=y&categoria=no-uuid'))).toEqual(FILTROS_VACIOS)
    expect(filtrosActivos(f)).toBe(5)
  })

  it('parámetros de productos_buscar: vacíos en null y límites', () => {
    expect(aParametrosRpc(FILTROS_VACIOS, -3, 999)).toEqual({
      p_q: null, p_categoria: null, p_subcategorias: true, p_tipo: null, p_uso: null, p_archivados: false, p_limite: 200, p_desde: 0,
    })
    expect(aParametrosRpc({ ...FILTROS_VACIOS, uso: 'compra' }, 50, 0).p_uso).toBe('compra')
  })
})

describe('errores de la base', () => {
  it('por pista, nunca por el texto', () => {
    expect(traducirError({ code: '23514', hint: 'productos_unidad_con_precio', message: 'otro texto' })).toMatch(/quita el precio/)
    expect(traducirError({ code: '23514', hint: 'productos_categoria_profundidad' })).toBe('Las categorías llegan hasta tres niveles.')
    expect(traducirError({ code: '42501', hint: 'productos_sin_permiso' })).toBe('No tienes permiso para editar productos.')
    expect(traducirError({ code: '23505' }, { entidad: 'producto' })).toMatch(/archivados/)
    expect(traducirError({ code: '23503' }, { borrando: true })).toMatch(/archívalo/)
    expect(traducirError({ code: 'XX000' })).toBe('No se pudo completar la operación.')
    expect(traducirError(new Conflicto())).toBe('Otra persona cambió este producto. Recarga para ver sus cambios.')
    expect(traducirError(new ListaCambiada())).toMatch(/cambió mientras se exportaba/)
    expect(traducirError(new SinFilas())).toMatch(/No se guardó nada/)
  })

  it('el campo del formulario al que se refiere', () => {
    expect(campoDeError({ hint: 'productos_unidad_en_uso' })).toBe('unidad_base')
    expect(campoDeError({ hint: 'productos_codigo_archivado' })).toBe('codigo')
    expect(campoDeError({ code: '23505' })).toBe('codigo')
    expect(campoDeError({ hint: 'productos_moneda' })).toBe('precio')
    expect(campoDeError({ hint: 'otra' })).toBeNull()
  })

  it('errores de fila de la importación', () => {
    expect(errorDeFila({ pista: 'productos_importar_repetido', mensaje: 'repetido en las filas 2, 5' })).toBe('Repetido en las filas 2, 5')
    expect(errorDeFila({ pista: 'productos_importar_nombre' })).toMatch(/pon su código/)
    expect(errorDeFila({ pista: '22P02' })).toBe('Algún dato no es válido.')
  })
})

describe('vistas', () => {
  const C: Catalogos = {
    categorias: [{ id: 'c1', nombre: 'Herramientas', padre_id: null, orden: 0, archivado_en: null }],
    unidades: [{ clave: 'caja', nombre: 'Caja', simbolo: null, decimales: 0, sistema: false, archivado_en: null }],
    impuestos: [{ clave: 'iva_general', nombre: 'IVA general', tipo: 'iva', tratamiento: 'gravado', porcentaje: '19.0000', predeterminado: true, archivado_en: null }],
  }
  const cambio = (x: Partial<Cambio>): Cambio => ({
    id: 1, entidad: 'producto', entidad_id: 'p1', operacion: 'update', campos: [], antes: null, despues: null, autor_id: null, created_at: '2026-11-19T00:00:00Z', ...x,
  })

  it('precio y clase', () => {
    expect(fmtPrecio(10000, 'COP')).toBe('COP $ 10.000')
    expect(fmtPrecio('1250.5000', 'COP')).toBe('COP $ 1.250,5')
    expect(fmtPrecio(null, null)).toBe('—')
    expect(textoClase(C.impuestos[0], 'iva_general')).toBe('IVA general · 19 %')
  })

  it('historial legible del producto y sus conversiones', () => {
    expect(describirCambio(cambio({ campos: ['precio_lista'], antes: { precio_lista: 10000 }, despues: { precio_lista: 12000 } }), C, 'COP')).toEqual([
      'Precio de lista: COP $ 10.000 → COP $ 12.000',
    ])
    expect(describirCambio(cambio({ campos: ['categoria_id', 'vendible'], antes: { categoria_id: null, vendible: true }, despues: { categoria_id: 'c1', vendible: false } }), C, 'COP')).toEqual([
      'Categoría: — → Herramientas',
      'Se vende: Sí → No',
    ])
    expect(describirCambio(cambio({ campos: ['archivado_en'], antes: { archivado_en: null }, despues: { archivado_en: '2026-11-19' } }), C, null)).toEqual(['Archivado'])
    expect(describirCambio(cambio({ entidad: 'conversion', campos: ['factor', 'unidad'], antes: { factor: 10, unidad: 'caja' }, despues: { factor: 12, unidad: 'caja' } }), C, null)).toEqual([
      'Unidad alterna Caja: factor 10 → 12',
    ])
    expect(describirCambio(cambio({ entidad: 'conversion', operacion: 'delete', antes: { unidad: 'caja', factor: 12 } }), C, null)).toEqual(['Unidad alterna Caja quitada'])
    expect(describirCambio(cambio({ operacion: 'insert' }), C, null)).toEqual(['Producto creado'])
  })
})
