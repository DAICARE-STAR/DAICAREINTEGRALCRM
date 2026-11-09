import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO } from '../catalogos'
import { leerCsv } from '../csv'
import { TOPE_FILAS, importar, lotes, type CuentaActual } from '../importador'
import type { CampoDef } from '../tipos'

const defs: CampoDef[] = [
  { clave: 'eps', entidad: 'cuenta', etiqueta: 'EPS', tipo: 'texto', opciones: [], obligatorio: false, filtrable: true, orden: 1 },
  { clave: 'horas', entidad: 'cuenta', etiqueta: 'Horas semanales', tipo: 'numero', opciones: [], obligatorio: false, filtrable: false, orden: 2 },
]

const ana: CuentaActual = {
  id: 'c1', tipo: 'persona', nombre: 'Ana Gómez', documento: '1020304050', etapa: 'activo', origen: 'referido',
  tipo_empresa: null, responsable_id: 'u1', telefono: '3001234567', email: 'ana@x.co', direccion: null,
  ciudad: 'Bogotá', pais: 'CO', etiquetas: ['vip'], campos: { horas: 20 }, notas: null,
}

const base = { ajustes: AJUSTES_POR_DEFECTO, defs, responsables: { 'Laura@Empresa.co': 'u1' }, cuentas: [ana] }

describe('importador', () => {
  it('encabezados con tildes y mayúsculas, separador ;', () => {
    const csv = 'NOMBRE;Cédula;  Teléfono ;Correo;Etapa;Horas semanales\n' +
      'Ana Gómez;1.020.304.050;3001234567;ana@x.co;Activo;20\n' +
      'Pedro Ruiz;79-555;;;valoracion;1.234,5\n'
    const r = importar({ ...base, filas: leerCsv(csv) })
    expect(r.error).toBeNull()
    expect(r.filas[0]).toEqual({ fila: 2, accion: 'sin_cambio', id: 'c1' })
    expect(r.filas[1]).toMatchObject({ fila: 3, accion: 'crear', datos: { documento: '79555', etapa: 'valoracion', pais: 'CO', campos: { horas: 1234.5 } } })
  })

  it('actualiza solo lo que difiere; la celda vacía no borra', () => {
    const r = importar({ ...base, filas: [['Nombre', 'Documento', 'Ciudad', 'Email', 'Responsable', 'EPS'], ['Ana Gómez', '1020304050', 'Cali', '', 'laura@empresa.co', 'Sura']] })
    expect(r.filas[0]).toEqual({ fila: 2, accion: 'actualizar', id: 'c1', cambios: { ciudad: 'Cali', campos: { horas: 20, eps: 'Sura' } } })
  })

  it('cruce por nombre normalizado y tipo cuando no hay documento', () => {
    const r = importar({ ...base, filas: [['Nombre', 'Tipo'], ['  ana gomez ', 'Persona'], ['Ana Gómez', 'empresa']] })
    expect(r.filas[0]).toMatchObject({ accion: 'sin_cambio' })
    expect(r.filas[1]).toMatchObject({ accion: 'crear' })
  })

  it('errores por fila con número de fila del archivo', () => {
    const r = importar({ ...base, filas: [
      ['Nombre', 'Documento', 'Etapa', 'Origen', 'Tipo de empresa', 'Responsable', 'Horas semanales'],
      ['', '1', '', '', '', '', ''],
      ['X', '2', 'inventada', 'tv', '', 'nadie', 'muchas'],
      ['Y', '', '', '', 'eps', '', ''],
      ['Z', '9', '', '', '', '', ''],
      ['Z2', '9', '', '', '', '', ''],
    ] })
    const errores = r.filas.filter(f => f.accion === 'error')
    expect(errores.map(f => f.fila)).toEqual([2, 3, 4, 6])
    const e3 = errores[1]
    expect(e3.accion === 'error' && e3.errores.length).toBe(4)
    const e6 = errores[3]
    expect(e6.accion === 'error' && e6.errores[0]).toContain('fila 5')
  })

  it('omite filas de ejemplo y rechaza columnas desconocidas', () => {
    const r = importar({ ...base, filas: [['Nombre'], ['EJEMPLO-Ana'], ['Luis']] })
    expect(r.omitidas).toBe(1)
    expect(r.filas).toHaveLength(1)
    expect(importar({ ...base, filas: [['Nombre', 'Color']] }).error).toContain('Color')
    expect(importar({ ...base, filas: [['Ciudad']] }).error).toContain('Nombre')
  })

  it('tope de filas', () => {
    const filas = [['Nombre'], ...Array.from({ length: TOPE_FILAS + 1 }, (_, i) => ['n' + i])]
    expect(importar({ ...base, filas }).error).toContain(String(TOPE_FILAS))
  })

  it('1.000 filas en menos de 1 s', () => {
    const filas = [['Nombre', 'Documento', 'Etiquetas'], ...Array.from({ length: 1000 }, (_, i) => ['Persona ' + i, String(1000 + i), 'a|b'])]
    const t0 = performance.now()
    const r = importar({ ...base, filas })
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(r.filas.filter(f => f.accion === 'crear')).toHaveLength(1000)
  })

  it('lotes', () => {
    expect(lotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(lotes(Array.from({ length: 1001 }, (_, i) => i)).map(l => l.length)).toEqual([500, 500, 1])
  })
})
