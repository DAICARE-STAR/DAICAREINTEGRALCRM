import { describe, expect, it } from 'vitest'
import { errorIdFicha, errorLecturaFicha, PRODUCTO_NO_EXISTE } from '../vistas'

describe('ficha de un producto inexistente', () => {
  it('un identificador sin forma de uuid no existe y no se lee', () => {
    for (const id of ['importar', 'abc', '', '123', '00000000-0000-0000-0000-00000000000g']) {
      expect(errorIdFicha(id)).toBe(PRODUCTO_NO_EXISTE)
    }
  })

  it('un uuid se lee de la base', () => {
    expect(errorIdFicha('3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d')).toBeNull()
    expect(errorIdFicha('3F2B8C1E-9A4D-4E7B-8C21-5D6F7A8B9C0D')).toBeNull()
  })

  it('sin fila en la base (PGRST116) es «no existe»; otro error conserva su mensaje', () => {
    expect(errorLecturaFicha({ code: 'PGRST116' })).toBe(PRODUCTO_NO_EXISTE)
    expect(errorLecturaFicha({ code: '42501' })).toBe('No tienes permiso para esta acción.')
    expect(errorLecturaFicha(new Error('red'))).toBe('No se pudo completar la operación.')
  })
})
