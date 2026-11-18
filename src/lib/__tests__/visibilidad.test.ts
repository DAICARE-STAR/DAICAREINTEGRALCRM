import { describe, expect, it } from 'vitest'
import { modulosVisibles, puedeVerModulo } from '../modulos'

describe('puedeVerModulo (PP-VIS)', () => {
  it('un módulo inactivo no lo ve nadie, ni el admin', () => {
    expect(puedeVerModulo('crm', ['admin'], ['app_crm'], [])).toBe(false)
    expect(puedeVerModulo('crm', ['member'], ['app_crm'], ['chat'])).toBe(false)
  })

  it('activo sin permiso no se ve; con app_<slug> o siendo admin, sí', () => {
    expect(puedeVerModulo('crm', ['member'], [], ['crm'])).toBe(false)
    expect(puedeVerModulo('crm', ['member'], ['app_crm'], ['crm'])).toBe(true)
    expect(puedeVerModulo('crm', ['admin'], null, ['crm'])).toBe(true)
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

  it('modulosVisibles deja fuera el núcleo, los módulos sin pantalla y los planeados', () => {
    // chat y proyectos son planeados (PP-DEC-21): fuera aunque figuren activos
    const slugs = modulosVisibles(['admin'], [], ['ia', 'crm', 'chat', 'proyectos']).map((m) => m.slug)
    expect(slugs).toEqual(['crm'])
  })
})
