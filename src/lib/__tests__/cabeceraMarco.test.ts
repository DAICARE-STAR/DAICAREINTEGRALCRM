import { describe, expect, it } from 'vitest'
import { cabeceraActiva, quitar, registrar, rutaDeCabecera, type Registro } from '../cabeceraMarco'

// Cabecera fija del marco del shell (GUIA-UI, «Cabeceras»): qué cabecera
// manda cuando las páginas registran y quitan la suya.

type R = Registro<string>[]
const vacia: R = []

describe('registro de cabeceras', () => {
  it('sin registros no hay cabecera activa', () => {
    expect(cabeceraActiva(vacia)).toBeNull()
  })

  it('manda la última registrada', () => {
    const l = registrar(registrar(vacia, 'a', 'Equipo'), 'b', 'Calendario')
    expect(cabeceraActiva(l)).toBe('Calendario')
  })

  it('al navegar en el mismo tick manda la página que entra, en cualquier orden', () => {
    const conEquipo = registrar(vacia, 'equipo', 'Equipo')
    // La que sale quita antes de que registre la que entra
    expect(cabeceraActiva(registrar(quitar(conEquipo, 'equipo'), 'cal', 'Calendario'))).toBe('Calendario')
    // La que entra registra antes de que quite la que sale
    expect(cabeceraActiva(quitar(registrar(conEquipo, 'cal', 'Calendario'), 'equipo'))).toBe('Calendario')
  })

  it('actualizar una cabecera la cambia en su sitio sin quitarle el turno a la más reciente', () => {
    let l = registrar(registrar(vacia, 'a', 'Equipo'), 'b', 'Correo')
    l = registrar(l, 'a', 'Equipo (2)')
    expect(cabeceraActiva(l)).toBe('Correo')
    expect(l.map((r) => r.id)).toEqual(['a', 'b'])
    l = registrar(l, 'b', 'Correo — Equipo')
    expect(cabeceraActiva(l)).toBe('Correo — Equipo')
  })

  it('se limpia al salir: sin páginas no queda el título de la anterior', () => {
    const l = registrar(vacia, 'a', 'Equipo')
    expect(cabeceraActiva(quitar(l, 'a'))).toBeNull()
  })

  it('quitar una que no está devuelve la misma lista (sin repintar)', () => {
    const l = registrar(vacia, 'a', 'Equipo')
    expect(quitar(l, 'z')).toBe(l)
  })

  it('no muta la lista recibida', () => {
    const l = registrar(vacia, 'a', 'Equipo')
    registrar(l, 'a', 'Otro')
    registrar(l, 'b', 'Otro')
    quitar(l, 'a')
    expect(l).toEqual([{ id: 'a', datos: 'Equipo' }])
  })
})

describe('cabecera de respaldo por ruta (rutaDeCabecera)', () => {
  it('conoce las rutas del shell', () => {
    expect(rutaDeCabecera('/')).toEqual({ modulo: 'inicio', titulo: 'Inicio' })
    expect(rutaDeCabecera('/equipo')).toEqual({ modulo: 'equipo', titulo: 'Equipo' })
    expect(rutaDeCabecera('/calendario/')).toEqual({ modulo: 'calendario', titulo: 'Calendario' })
    expect(rutaDeCabecera('/correo')).toEqual({ modulo: 'correo', titulo: 'Correo' })
    expect(rutaDeCabecera('/chat')).toEqual({ modulo: 'chat', titulo: 'Chat' })
    expect(rutaDeCabecera('/herramientas')).toEqual({ modulo: 'herramientas', titulo: 'Herramientas' })
    expect(rutaDeCabecera('/sitio-web')).toEqual({ modulo: 'sitio-web', titulo: 'Sitio web' })
  })

  it('Administración con o sin sección', () => {
    expect(rutaDeCabecera('/admin')).toEqual({ modulo: 'admin', titulo: 'Administración' })
    expect(rutaDeCabecera('/admin/miembros')).toEqual({ modulo: 'admin', titulo: 'Administración' })
    expect(rutaDeCabecera('/admin/miembros/x')).toBeNull()
  })

  it('las apps devuelven su slug para resolverlo en el shell', () => {
    expect(rutaDeCabecera('/apps/proyectos')).toEqual({ app: 'proyectos' })
    expect(rutaDeCabecera('/app/proyectos')).toEqual({ app: 'proyectos' })
    expect(rutaDeCabecera('/apps')).toBeNull()
    expect(rutaDeCabecera('/apps/a/b')).toBeNull()
  })

  it('una ruta desconocida no tiene respaldo (esqueleto)', () => {
    expect(rutaDeCabecera('/no-existe')).toBeNull()
    expect(rutaDeCabecera('/equipo/123')).toBeNull()
    expect(rutaDeCabecera('/constructor')).toBeNull()
    expect(rutaDeCabecera('/toString')).toBeNull()
  })
})
