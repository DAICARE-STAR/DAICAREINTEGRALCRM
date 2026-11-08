import { describe, expect, it } from 'vitest'
import { categoriaError, ErrorUsuario, resumenError } from '../errores.mts'

describe('resumenError', () => {
  it('toma nombre, código y mensaje recortado a 200 caracteres', () => {
    const e = Object.assign(new Error('x'.repeat(500)), { code: '23505' })
    const r = resumenError(e)
    expect(r).toEqual({ nombre: 'Error', codigo: '23505', mensaje: 'x'.repeat(200) })
  })

  it('no incluye el stack ni los cuerpos de terceros', () => {
    const e = Object.assign(new Error('HubSpot 400'), {
      responseText: 'Contacto ana@cliente.test con teléfono 3001234567',
      response: { body: 'secreto' },
      body: 'otro cuerpo',
    })
    const texto = JSON.stringify(resumenError(e))
    expect(texto).not.toContain('ana@cliente.test')
    expect(texto).not.toContain('secreto')
    expect(texto).not.toContain('otro cuerpo')
    expect(texto).not.toContain('at ')
    expect(Object.keys(resumenError(e)).sort()).toEqual(['codigo', 'mensaje', 'nombre'])
  })

  it('acepta errores de PostgREST (objetos simples), textos y vacíos', () => {
    expect(resumenError({ code: 'PGRST116', message: 'no rows' })).toEqual({
      nombre: 'Error',
      codigo: 'PGRST116',
      mensaje: 'no rows',
    })
    expect(resumenError('falló')).toEqual({ nombre: 'Error', codigo: null, mensaje: 'falló' })
    expect(resumenError(null)).toEqual({ nombre: 'Error', codigo: null, mensaje: '' })
    expect(resumenError(undefined).mensaje).toBe('')
  })

  it('conserva el nombre propio del error', () => {
    const e = new Error('m')
    e.name = 'GeminiAuth'
    expect(resumenError(e).nombre).toBe('GeminiAuth')
  })

  it('100 000 caracteres en menos de 1 s', () => {
    const t0 = Date.now()
    expect(resumenError(new Error('a'.repeat(100_000))).mensaje).toHaveLength(200)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})

describe('ErrorUsuario', () => {
  it('conserva el mensaje y se marca como apto para el usuario', () => {
    const e = new ErrorUsuario('Solo se permiten direcciones https')
    expect(e.message).toBe('Solo se permiten direcciones https')
    expect(e.usuario).toBe(true)
    expect(e.name).toBe('ErrorUsuario')
    expect(e).toBeInstanceOf(Error)
  })
})

describe('categoriaError', () => {
  it('HubSpot: solo category', () => {
    expect(categoriaError(JSON.stringify({ category: 'VALIDATION_ERROR', message: 'ana@cliente.test no vale' }))).toBe(
      'VALIDATION_ERROR',
    )
  })

  it('Google OAuth y las API de Google: el código, no la descripción', () => {
    expect(categoriaError(JSON.stringify({ error: 'invalid_grant', error_description: 'cuenta x' }))).toBe('invalid_grant')
    expect(categoriaError(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'detalle' } }))).toBe(
      'PERMISSION_DENIED',
    )
  })

  it('un cuerpo que no es JSON o sin categoría da null', () => {
    expect(categoriaError('<html>ana@cliente.test</html>')).toBeNull()
    expect(categoriaError('{"message":"ana@cliente.test"}')).toBeNull()
    expect(categoriaError('null')).toBeNull()
  })
})
