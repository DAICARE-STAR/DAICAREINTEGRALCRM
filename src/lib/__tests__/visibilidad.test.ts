import { describe, expect, it } from 'vitest'
import { modulosVisibles, puedeVerModulo } from '../modulos'

describe('puedeVerModulo (PP-VIS)', () => {
  it('un módulo inactivo no lo ve nadie, ni el admin', () => {
    expect(puedeVerModulo('calendario', ['admin'], ['app_calendario'], [])).toBe(false)
    expect(puedeVerModulo('calendario', ['member'], ['app_calendario'], ['chat'])).toBe(false)
  })

  it('activo sin permiso no se ve; con app_<slug> o siendo admin, sí', () => {
    expect(puedeVerModulo('calendario', ['member'], [], ['calendario'])).toBe(false)
    expect(puedeVerModulo('calendario', ['member'], ['app_calendario'], ['calendario'])).toBe(true)
    expect(puedeVerModulo('calendario', ['admin'], null, ['calendario'])).toBe(true)
  })

  it('el núcleo siempre; un planeado o desconocido nunca, aunque figure activo', () => {
    expect(puedeVerModulo('nucleo', null, null, [])).toBe(true)
    expect(puedeVerModulo('inventario', ['admin'], ['app_inventario'], ['inventario'])).toBe(false)
    expect(puedeVerModulo('ejemplo', ['admin'], ['app_ejemplo'], ['ejemplo'])).toBe(false)
  })

  it('un módulo sin app_<slug> (capacidad) lo ve cualquiera si está activo', () => {
    expect(puedeVerModulo('ia', ['member'], [], ['ia'])).toBe(true)
    expect(puedeVerModulo('ia', ['member'], [], [])).toBe(false)
  })

  it('modulosVisibles deja fuera el núcleo y los módulos sin pantalla', () => {
    const slugs = modulosVisibles(['admin'], [], ['ia', 'chat', 'proyectos']).map((m) => m.slug)
    expect(slugs).toEqual(['chat', 'proyectos'])
  })
})
