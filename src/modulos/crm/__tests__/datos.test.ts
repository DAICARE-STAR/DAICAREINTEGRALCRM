import { describe, expect, it } from 'vitest'
import { leerDatosSalud, nombreArchivoSeguro, SinFilas, traducirError } from '../lib/datos'

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
