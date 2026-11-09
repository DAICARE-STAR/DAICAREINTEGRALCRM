import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO } from '../catalogos'
import { escribirCsv, leerCsv } from '../csv'
import { exportarCuentas, plantilla } from '../exportador'
import { importar, type CuentaActual } from '../importador'
import type { CampoDef } from '../tipos'

const defs: CampoDef[] = [
  { clave: 'eps', entidad: 'cuenta', etiqueta: 'EPS', tipo: 'texto', opciones: [], obligatorio: false, filtrable: true, orden: 2 },
  { clave: 'horas', entidad: 'cuenta', etiqueta: 'Horas', tipo: 'numero', opciones: [], obligatorio: false, filtrable: false, orden: 1 },
  { clave: 'nocturno', entidad: 'cuenta', etiqueta: 'Nocturno', tipo: 'booleano', opciones: [], obligatorio: false, filtrable: false, orden: 3 },
  { clave: 'cargo', entidad: 'contacto', etiqueta: 'Cargo', tipo: 'texto', opciones: [], obligatorio: false, filtrable: false, orden: 1 },
]

const cuentas: CuentaActual[] = [
  {
    id: 'c1', tipo: 'persona', nombre: 'Ana Gómez', documento: '1.020.304.050', etapa: 'no_continuo', origen: 'referido',
    tipo_empresa: null, responsable_id: 'u1', telefono: '+57 300 123 4567', email: 'ana@x.co', direccion: 'Cra 7; #45-10',
    ciudad: 'Bogotá', pais: 'CO', etiquetas: ['vip', 'nocturno'], campos: { horas: 1234.5, nocturno: true, eps: '=Sura' },
    notas: 'Primera línea\n"segunda"',
  },
  {
    id: 'c2', tipo: 'empresa', nombre: 'Clínica Norte', documento: null, etapa: null, origen: null, tipo_empresa: 'clinica',
    responsable_id: null, telefono: null, email: null, direccion: null, ciudad: null, pais: 'CO', etiquetas: [], campos: {}, notas: null,
  },
]

describe('exportador', () => {
  it('encabezados fijos y campos de cuenta por orden', () => {
    const [enc] = exportarCuentas([], AJUSTES_POR_DEFECTO, defs, {})
    expect(enc.slice(0, 3)).toEqual(['Nombre', 'Tipo', 'Documento'])
    expect(enc.slice(-3)).toEqual(['Horas', 'EPS', 'Nocturno'])
  })

  it('ida y vuelta por CSV: todo sin_cambio', () => {
    const filas = exportarCuentas(cuentas, AJUSTES_POR_DEFECTO, defs, { u1: 'laura@empresa.co' })
    const texto = escribirCsv(filas)
    expect(texto).toContain("'=Sura")
    const r = importar({ filas: leerCsv(texto), ajustes: AJUSTES_POR_DEFECTO, defs, responsables: { 'laura@empresa.co': 'u1' }, cuentas })
    expect(r.error).toBeNull()
    expect(r.filas.map(f => f.accion)).toEqual(['sin_cambio', 'sin_cambio'])
  })

  it('la plantilla se importa sin filas', () => {
    const p = plantilla(AJUSTES_POR_DEFECTO, defs)
    expect(p[1][0].startsWith('EJEMPLO-')).toBe(true)
    const r = importar({ filas: leerCsv(escribirCsv(p)), ajustes: AJUSTES_POR_DEFECTO, defs, responsables: {}, cuentas: [] })
    expect(r).toEqual({ error: null, filas: [], omitidas: 1 })
  })
})
