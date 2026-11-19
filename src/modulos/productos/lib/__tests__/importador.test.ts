import { describe, expect, it } from 'vitest'
import { escribirCsv, leerCsv } from '../../../crm/lib/csv'
import { exportarProductos, paginasCompletas, plantilla } from '../exportador'
import { combinar, contar, filasReporte, leerBooleano, leerRespuesta, lotesParaEnviar, mapear, TOPE_FILAS, type FilaResultado } from '../importador'
import type { Catalogos, Producto } from '../tipos'

const CAT: Catalogos = {
  categorias: [
    { id: '11111111-1111-1111-1111-111111111111', nombre: 'Herramientas', padre_id: null, orden: 0, archivado_en: null },
    { id: '22222222-2222-2222-2222-222222222222', nombre: 'Manuales', padre_id: '11111111-1111-1111-1111-111111111111', orden: 0, archivado_en: null },
  ],
  unidades: [
    { clave: 'und', nombre: 'Unidad', simbolo: null, decimales: 0, sistema: true, archivado_en: null },
    { clave: 'caja', nombre: 'Caja', simbolo: null, decimales: 0, sistema: false, archivado_en: null },
    { clave: 'kg', nombre: 'Kilogramo', simbolo: 'kg', decimales: 3, sistema: false, archivado_en: null },
    { clave: 'g', nombre: 'Gramo', simbolo: null, decimales: 0, sistema: false, archivado_en: null },
  ],
  impuestos: [
    { clave: 'iva_general', nombre: 'IVA general', tipo: 'iva', tratamiento: 'gravado', porcentaje: 19, predeterminado: true, archivado_en: null },
    { clave: 'iva_exento', nombre: 'Exento de IVA', tipo: 'iva', tratamiento: 'exento', porcentaje: 0, predeterminado: false, archivado_en: null },
  ],
}

const ENC = ['Código', 'Nombre', 'Tipo', 'Se vende', 'Se compra', 'Categoría', 'Unidad base', 'Unidades alternas', 'Impuesto', 'Precio de lista', 'Moneda', 'Descripción', 'Archivado']
const m = (filas: string[][], separador: ',' | '.' = ',') => mapear({ filas: [ENC, ...filas], catalogos: CAT, separador, moneda: 'COP' })

describe('mapeo del CSV al formato de productos_importar', () => {
  it('una fila completa: código normalizado, catálogos por clave o nombre, precio y factores con coma', () => {
    const r = m([[' ab 12 ', 'Llave', 'Bien', 'sí', 'no', 'herramientas / manuales', 'Kilogramo', 'g=0,001', 'IVA general', '1.250,5', 'COP', 'Texto', 'no']])
    expect(r.error).toBeNull()
    expect(r.filas[0].errores).toEqual([])
    expect(r.filas[0].datos).toEqual({
      fila: 2, codigo: 'AB12', nombre: 'Llave', tipo: 'bien', vendible: true, comprable: false,
      categoria_id: '22222222-2222-2222-2222-222222222222', unidad_base: 'kg', conversiones: [{ unidad: 'g', factor: '0.001' }],
      impuesto: 'iva_general', precio_lista: '1250.5', descripcion: 'Texto', archivado: false,
    })
    expect(r.filas[0].codigoOriginal).toBe(' ab 12 '.trim())
  })

  it('una celda vacía no se manda (no cambia el valor guardado); sin código va sin la clave', () => {
    const r = m([['', 'Arandela', '', '', '', '', '', '', '', '', '', '', '']])
    expect(r.filas[0].datos).toEqual({ fila: 2, nombre: 'Arandela' })
  })

  it('con punto decimal el precio se lee al revés', () => {
    expect(m([['A1', 'X', '', '', '', '', '', '', '', '1,250.5', '', '', '']], '.').filas[0].datos.precio_lista).toBe('1250.5')
    expect(m([['A1', 'X', '', '', '', '', '', '', '', '1.250,5', '', '', '']], '.').filas[0].errores).toEqual(['Precio no válido: 1.250,5'])
  })

  it('errores de forma por fila', () => {
    const r = m([['ñ-1', '', 'otro', 'quizá', '', 'Nada / Más', 'bolsa', 'caja=0,3', 'iva_x', '-5', 'USD', '', '']])
    expect(r.filas[0].errores).toEqual([
      'El código solo admite letras sin tilde, cifras y . _ / -, y empieza por letra o cifra: ñ-1',
      'Tipo no válido (bien o servicio): otro',
      'Se vende: escribe sí o no (quizá)',
      'Categoría que no existe: Nada / Más',
      'Unidad desconocida: bolsa',
      'caja: Ese factor no es exacto: usa como unidad base la unidad menor.',
      'Clase de impuesto desconocida: iva_x',
      'Precio no válido: -5',
      'El precio va en COP, la moneda de la instalación (USD)',
    ])
    expect(r.categoriasNuevas).toEqual(['Nada / Más'])
    expect(m([['', '', 'bien', '', '', '', '', '', '', '', '', '', '']]).filas[0].errores).toEqual(['Falta el código o el nombre'])
    expect(m([['A1', 'X', '', '', '', '', 'caja', 'caja=2', '', '', '', '', '']]).filas[0].errores).toEqual(['La unidad base no lleva conversión'])
  })

  it('repetidos sobre el archivo entero (caso 19.19): mismo código, códigos que normalizan igual y nombres sin código', () => {
    const r = m([
      ['X1', 'a', '', '', '', '', '', '', '', '', '', '', ''],
      ['x1', 'b', '', '', '', '', '', '', '', '', '', '', ''],
      ['AB 12', 'c', '', '', '', '', '', '', '', '', '', '', ''],
      ['AB12', 'd', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Tornillo  largo', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'tornillo largo', '', '', '', '', '', '', '', '', '', '', ''],
      ['Z9', 'tornillo largo', '', '', '', '', '', '', '', '', '', '', ''],
    ])
    expect(r.filas.map((f) => f.errores.length)).toEqual([1, 1, 1, 1, 1, 1, 0])
    expect(r.filas[0].errores[0]).toMatch(/quedan iguales al guardarse \(«X1», «x1»\) en las filas 2, 3/)
    expect(r.filas[2].errores[0]).toMatch(/«AB 12», «AB12»/)
    expect(r.filas[4].errores[0]).toBe('Nombre repetido sin código en las filas 6, 7')
    expect(lotesParaEnviar(r.filas).flat().map((f) => f.fila)).toEqual([8])
  })

  it('omite la fila de ejemplo y las vacías; valida encabezados y tope', () => {
    const r = m([['EJEMPLO-A100', 'x', '', '', '', '', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', '', '', '', '', '', '']])
    expect(r.omitidas).toBe(1)
    expect(r.filas).toEqual([])
    expect(mapear({ filas: [['Código', 'Color']], catalogos: CAT, separador: ',', moneda: 'COP' }).error).toBe('Columna desconocida: Color')
    expect(mapear({ filas: [['Tipo']], catalogos: CAT, separador: ',', moneda: 'COP' }).error).toMatch(/Falta la columna Código o la columna Nombre/)
    expect(mapear({ filas: [], catalogos: CAT, separador: ',', moneda: 'COP' }).error).toBe('El archivo está vacío')
    const muchas = [ENC, ...Array.from({ length: TOPE_FILAS + 1 }, () => ['A'])]
    expect(mapear({ filas: muchas, catalogos: CAT, separador: ',', moneda: 'COP' }).error).toMatch(/supera/)
  })

  it('lotes del tamaño pedido, solo con las filas sin error', () => {
    const filas = Array.from({ length: 5 }, (_, i) => [`C${i}`, 'n', '', '', '', '', '', '', '', '', '', '', ''])
    expect(lotesParaEnviar(m(filas).filas, 2).map((l) => l.length)).toEqual([2, 2, 1])
  })

  it('booleanos', () => {
    expect([leerBooleano('Sí'), leerBooleano('x'), leerBooleano('NO'), leerBooleano('tal vez')]).toEqual([true, true, false, null])
  })
})

describe('resultado de la base', () => {
  const respuesta = {
    crear: 1, actualizar: 0, sin_cambio: 0, error: 1,
    filas: [
      { fila: 2, accion: 'crear', id: null, codigo: null, errores: [] },
      { fila: 3, accion: 'error', id: null, codigo: 'B1', errores: [{ pista: 'productos_unidad_archivada', mensaje: 'x' }] },
    ],
  }

  it('lee la respuesta y traduce las pistas', () => {
    expect(leerRespuesta(respuesta)).toEqual([
      { fila: 2, accion: 'crear', codigo: null, errores: [] },
      { fila: 3, accion: 'error', codigo: 'B1', errores: ['La unidad está archivada.'] },
    ])
    expect(leerRespuesta({ filas: [{ fila: 4, accion: 'error', errores: [{ pista: '23505' }] }] })[0].errores[0]).toMatch(/código/)
    expect(() => leerRespuesta(null)).toThrow()
  })

  it('combina los errores del navegador con lo que dijo la base, cuenta y arma el reporte', () => {
    const mapeo = m([
      ['', 'Nuevo', '', '', '', '', '', '', '', '', '', '', ''],
      ['B1', 'Otro', '', '', '', '', '', '', '', '', '', '', ''],
      ['c 3', 'Malo', 'x', '', '', '', '', '', '', '', '', '', ''],
    ])
    const previa = combinar(mapeo.filas, leerRespuesta(respuesta))
    expect(contar(previa)).toEqual({ crear: 1, actualizar: 0, sin_cambio: 0, error: 2 })
    const final: FilaResultado[] = [{ fila: 2, accion: 'crear', codigo: 'P-00007', errores: [] }]
    expect(filasReporte(mapeo.filas, previa, final)).toEqual([
      ['Fila', 'Código en el archivo', 'Código', 'Acción', 'Resultado'],
      ['2', '', 'P-00007', 'crear', 'escrita'],
      ['3', 'B1', 'B1', 'error', 'La unidad está archivada.'],
      ['4', 'c 3', 'C3', 'error', 'Tipo no válido (bien o servicio): x'],
    ])
    expect(filasReporte(mapeo.filas, previa, null)[1]).toEqual(['2', '', 'automático', 'crear', 'no escrita'])
  })
})

describe('exportador', () => {
  const p: Producto = {
    id: 'p1', codigo: 'AB-12', nombre: 'Llave', descripcion: null, tipo: 'bien', vendible: true, comprable: false,
    categoria_id: '22222222-2222-2222-2222-222222222222', unidad_base: 'kg', impuesto: 'iva_general',
    precio_lista: 1250.5, precio_lista_moneda: 'COP', archivado_en: null, created_by: null, updated_by: null,
    created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z',
  }

  it('escribe las columnas de la plantilla y la exportación se reimporta sin errores ni cambios de forma', () => {
    const filas = exportarProductos([p], [{ producto_id: 'p1', unidad: 'g', factor: '0.001000' }, { producto_id: 'otro', unidad: 'caja', factor: 2 }], CAT)
    expect(filas[0]).toEqual(ENC)
    expect(filas[1]).toEqual(['AB-12', 'Llave', 'bien', 'sí', 'no', 'Herramientas / Manuales', 'kg', 'g=0,001', 'iva_general', '1250,5', 'COP', '', 'no'])
    // Ida y vuelta por el archivo de verdad: BOM, separador ';', comillas y fórmulas neutralizadas
    const otro: Producto = { ...p, id: 'p2', codigo: 'AB-13', descripcion: '-Corte; "fino"\ny pulido', precio_lista: null, precio_lista_moneda: null }
    const leidas = leerCsv(escribirCsv(exportarProductos([p, otro], [{ producto_id: 'p1', unidad: 'g', factor: '0.001000' }, { producto_id: 'p1', unidad: 'caja', factor: 2 }], CAT)))
    const r = mapear({ filas: leidas, catalogos: CAT, separador: ',', moneda: 'COP' })
    expect(r.error).toBeNull()
    expect(r.filas.map((f) => f.errores)).toEqual([[], []])
    expect(r.filas[0].datos).toMatchObject({ codigo: 'AB-12', precio_lista: '1250.5', unidad_base: 'kg', conversiones: [{ unidad: 'caja', factor: '2' }, { unidad: 'g', factor: '0.001' }] })
    expect(r.filas[1].datos.descripcion).toBe('-Corte; "fino"\ny pulido')
    expect(r.filas[1].datos.precio_lista).toBeUndefined()
  })

  it('la plantilla lleva la fila de ejemplo que el importador omite', () => {
    const t = plantilla(CAT, 'COP')
    expect(t[0]).toEqual(ENC)
    const r = mapear({ filas: t, catalogos: CAT, separador: ',', moneda: 'COP' })
    expect(r.omitidas).toBe(1)
    expect(r.filas).toEqual([])
  })

  it('páginas completas: el total no cambia, llegan todas y ninguna se repite', () => {
    const f = (...ids: string[]) => ids.map((id) => ({ id }))
    expect(paginasCompletas([{ filas: f('1', '2'), total: 3 }, { filas: f('3'), total: 3 }])).toBe(true)
    expect(paginasCompletas([{ filas: f('1', '2'), total: 3 }, { filas: f('3'), total: 4 }])).toBe(false)
    expect(paginasCompletas([{ filas: f('1', '2'), total: 3 }])).toBe(false)
    expect(paginasCompletas([{ filas: [], total: 0 }])).toBe(true)
    // Entre páginas se creó uno antes y se borró otro después: el total no cambia, pero una fila sale dos veces
    expect(paginasCompletas([{ filas: f('1', '2'), total: 3 }, { filas: f('2'), total: 3 }])).toBe(false)
  })
})
