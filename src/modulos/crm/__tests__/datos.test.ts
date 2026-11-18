import { describe, expect, it } from 'vitest'
import { ExportacionIncompleta, filasExportadas, leerDatosSalud, nombreArchivoSeguro, SinFilas, traducirError } from '../lib/datos'

describe('traducirError', () => {
  it('23514 por hint de catálogo y de campo', () => {
    expect(traducirError({ code: '23514', hint: 'crm_etapa' })).toBe('La etapa no está en el catálogo.')
    expect(traducirError({ code: '23514', hint: 'crm_relacion' })).toMatch(/relación/)
    expect(traducirError({ code: '23514', hint: 'crm_contacto_cuenta' })).toMatch(/no pertenece/)
    expect(traducirError({ code: '23514', hint: 'crm_salud_persona' })).toMatch(/persona/)
    expect(traducirError({ code: '23514', hint: 'crm_campo:talla' }, { etiquetas: { talla: 'Talla' } })).toBe('El campo «Talla» falta o no es válido.')
    expect(traducirError({ code: '23514', hint: 'crm_campo:otro' })).toMatch(/«otro»/)
    expect(traducirError({ code: '23514' })).toBe('Algún dato no cumple el formato esperado.')
  })

  it('42501 de salud y genérico', () => {
    expect(traducirError({ code: '42501', hint: 'salud_mfa' })).toMatch(/segundo factor/)
    expect(traducirError({ code: '42501', hint: 'salud_permiso' })).toMatch(/permiso/)
    expect(traducirError({ code: '42501', hint: 'salud_sin_consentimiento' })).toMatch(/consentimiento/)
    expect(traducirError({ code: '42501', hint: 'salud_sin_clave' })).toMatch(/clave/)
    expect(traducirError({ code: 'P0001', hint: 'salud_sin_clave' })).toMatch(/clave/)
    expect(traducirError({ code: '42501', hint: 'crm_exportar' })).toBe('No tienes permiso para exportar.')
    expect(traducirError({ code: '42501' })).toBe('No tienes permiso para esta acción.')
  })

  it('exportar: tope, lista cambiada y llegada incompleta', () => {
    expect(traducirError({ code: '54000', hint: 'crm_exportar_tope' })).toMatch(/más de 10 000 cuentas/)
    expect(traducirError({ code: '40001', hint: 'crm_exportar_cambio' })).toMatch(/cambió/)
    expect(traducirError({ code: '54000' })).toBe('No se pudo completar la operación.')
    expect(traducirError(new ExportacionIncompleta())).toMatch(/incompleta/)
  })

  it('23505 según la entidad', () => {
    expect(traducirError({ code: '23505' }, { entidad: 'cuenta' })).toMatch(/documento/)
    expect(traducirError({ code: '23505' }, { entidad: 'contacto' })).toMatch(/principal/)
    expect(traducirError({ code: '23505' })).toBe('El registro ya existe.')
  })

  it('nunca usa el texto del error', () => {
    expect(traducirError({ code: 'XX000', message: 'crm: etapa fuera del catálogo' })).toBe('No se pudo completar la operación.')
    expect(traducirError(new Error('cualquier cosa'))).toBe('No se pudo completar la operación.')
    expect(traducirError(null)).toBe('No se pudo completar la operación.')
    expect(traducirError(new SinFilas())).toMatch(/No se guardó nada/)
  })
})

describe('filasExportadas', () => {
  it('devuelve las filas solo si están todas', () => {
    const filas = [{ id: 'a' }, { id: 'b' }]
    expect(filasExportadas({ total: 2, filas })).toEqual(filas)
    expect(filasExportadas({ total: 0, filas: [] })).toEqual([])
  })

  // Una respuesta cortada (como la de una función que devuelve filas, por
  // el «Max rows» de la API) o sin total no se descarga
  it('falla si faltan filas, sobran o la forma no es la esperada', () => {
    const mil = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }))
    expect(() => filasExportadas({ total: 3500, filas: mil })).toThrow(ExportacionIncompleta)
    expect(() => filasExportadas({ total: 1, filas: [{ id: 'a' }, { id: 'b' }] })).toThrow(ExportacionIncompleta)
    expect(() => filasExportadas(mil)).toThrow(ExportacionIncompleta)
    expect(() => filasExportadas({ filas: [] })).toThrow(ExportacionIncompleta)
    expect(() => filasExportadas(null)).toThrow(ExportacionIncompleta)
  })
})

describe('salud y archivos', () => {
  it('leerDatosSalud normaliza texto y listas, ignora claves ajenas', () => {
    const d = leerDatosSalud({ alergias: ['polen', 'maní', 3], diagnosticos: 'X', otra: 'y' })
    expect(d.alergias).toBe('polen\nmaní')
    expect(d.diagnosticos).toBe('X')
    expect(d.medicamentos).toBe('')
    expect(Object.keys(d)).not.toContain('otra')
    expect(leerDatosSalud(null).observaciones).toBe('')
  })

  it('nombreArchivoSeguro cumple el CHECK de archivo_ruta', () => {
    const n = nombreArchivoSeguro('Consentimiento firmado (Pérez).PDF', 1)
    expect(n).toBe('1-Consentimiento-firmado-Perez.pdf')
    expect(`${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}/${n}`).toMatch(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/)
    expect(nombreArchivoSeguro('###', 2)).toBe('2-archivo')
  })
})
