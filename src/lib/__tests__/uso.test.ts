import { describe, expect, it } from 'vitest'
import {
  MAX_MINUTOS_POR_ENVIO,
  UMBRAL_ACTIVIDAD_MS,
  acumular,
  claveDeRuta,
  cuerpoLatido,
  debeContar,
  fmtDuracion,
  hayAlgo,
  listoParaEnviar,
  nombreApp,
  rangoPeriodo,
  resumirUso,
} from '../uso'

// Lo que el latido del shell decide sin red: qué ruta cuenta, cuándo cuenta
// un minuto, cuánto se manda por llamada y cómo se resume para Administración.

describe('claveDeRuta', () => {
  it('reconoce el inicio, las secciones del núcleo y las rutas de módulo', () => {
    expect(claveDeRuta('/')).toBe('inicio')
    expect(claveDeRuta('')).toBe('inicio')
    expect(claveDeRuta('/admin')).toBe('admin')
    expect(claveDeRuta('/equipo')).toBe('equipo')
    expect(claveDeRuta('/chat')).toBe('modulo:chat')
    expect(claveDeRuta('/sitio-web/')).toBe('modulo:sitio-web')
    expect(claveDeRuta('/proyectos/123')).toBe('modulo:proyectos')
    expect(claveDeRuta('/Disenos/')).toBe('modulo:disenos')
  })

  it('no mide el login ni rutas desconocidas', () => {
    expect(claveDeRuta('/login')).toBeNull()
    expect(claveDeRuta('/loquesea')).toBeNull()
    expect(claveDeRuta('/apps/proyectos')).toBeNull()
  })
})

describe('debeContar', () => {
  const ahora = 1_000_000
  it('cuenta con la pestaña visible y actividad reciente', () => {
    expect(debeContar({ visible: true, ultimaActividad: ahora - 60_000, ahora })).toBe(true)
  })
  it('no cuenta con la pestaña oculta ni sin actividad en 5 minutos', () => {
    expect(debeContar({ visible: false, ultimaActividad: ahora, ahora })).toBe(false)
    expect(debeContar({ visible: true, ultimaActividad: ahora - UMBRAL_ACTIVIDAD_MS, ahora })).toBe(false)
    expect(debeContar({ visible: true, ultimaActividad: ahora - UMBRAL_ACTIVIDAD_MS + 1, ahora })).toBe(true)
  })
  it('un reloj que retrocede cuenta como actividad reciente', () => {
    expect(debeContar({ visible: true, ultimaActividad: ahora + 10_000, ahora })).toBe(true)
  })
})

describe('acumular, listoParaEnviar y cuerpoLatido', () => {
  it('suma minutos y aperturas de la misma app y reinicia al cambiar de app', () => {
    let p = acumular(null, 'modulo:proyectos', { apertura: true })
    p = acumular(p, 'modulo:proyectos', { minuto: true })
    p = acumular(p, 'modulo:proyectos', { minuto: true })
    expect(p).toEqual({ app: 'modulo:proyectos', minutos: 2, aperturas: 1 })
    expect(acumular(p, 'chat', { minuto: true })).toEqual({ app: 'chat', minutos: 1, aperturas: 0 })
  })

  it('se envía a los 5 minutos y el cuerpo respeta los topes de la base', () => {
    let p = acumular(null, 'inicio', {})
    expect(hayAlgo(p)).toBe(false)
    for (let i = 0; i < 4; i++) p = acumular(p, 'inicio', { minuto: true })
    expect(listoParaEnviar(p)).toBe(false)
    p = acumular(p, 'inicio', { minuto: true })
    expect(listoParaEnviar(p)).toBe(true)
    for (let i = 0; i < 30; i++) p = acumular(p, 'inicio', { minuto: true, apertura: true })
    expect(cuerpoLatido(p)).toEqual({ p_app: 'inicio', p_minutos: MAX_MINUTOS_POR_ENVIO, p_aperturas: 20 })
  })
})

describe('fmtDuracion y rangoPeriodo', () => {
  it('formatea minutos como el resto del portal', () => {
    expect(fmtDuracion(0)).toBe('0 min')
    expect(fmtDuracion(45)).toBe('45 min')
    expect(fmtDuracion(120)).toBe('2 h')
    expect(fmtDuracion(200)).toBe('3 h 20 min')
    expect(fmtDuracion(-3)).toBe('0 min')
  })
  it('el periodo incluye hoy y los N−1 días anteriores, en fechas locales', () => {
    expect(rangoPeriodo(7, new Date(2026, 9, 9))).toEqual({ desde: '2026-10-03', hasta: '2026-10-09' })
    expect(rangoPeriodo(30, new Date(2026, 0, 15))).toEqual({ desde: '2025-12-17', hasta: '2026-01-15' })
  })
})

describe('resumirUso', () => {
  const apps = [{ slug: 'proyectos', name: 'Proyectos' }, { slug: 'cotizador', name: 'Cotizador' }, { slug: 'chat', name: 'Chat' }]
  const filas = [
    { user_id: 'ana', app: 'modulo:proyectos', minutos: 250, aperturas: 4, dias: 3, ultima: '2026-10-09T15:00:00Z' },
    { user_id: 'ana', app: 'modulo:chat', minutos: 50, aperturas: 9, dias: 3, ultima: '2026-10-09T15:00:00Z' },
    { user_id: 'ana', app: 'inicio', minutos: 20, aperturas: 3, dias: 3, ultima: '2026-10-09T15:00:00Z' },
    { user_id: 'ana', app: 'modulo:cotizador', minutos: 10, aperturas: 1, dias: 3, ultima: '2026-10-09T15:00:00Z' },
    { user_id: 'bot', app: 'modulo:proyectos', minutos: 900, aperturas: 1, dias: 1, ultima: '2026-10-08T01:00:00Z' },
    { user_id: 'jorge', app: 'modulo:proyectos', minutos: 40, aperturas: 2, dias: 1, ultima: '2026-10-07T12:00:00Z' },
  ]
  const acciones = [
    { user_id: 'ana', action: 'cotizador.borrador', n: 6 },
    { user_id: 'ana', action: 'subtarea.completar', n: 2 },
    { user_id: 'bot', action: 'proyecto.estado', n: 50 },
    { user_id: 'luisa', action: 'cuenta.perfil', n: 1 },
  ]

  it('ordena por tiempo, nombra las apps y arma el agregado del equipo sin las cuentas de servicio', () => {
    const r = resumirUso(filas, acciones, apps, { excluir: ['bot'] })
    expect(r.miembros.map((m) => m.userId)).toEqual(['ana', 'jorge', 'luisa'])
    const ana = r.miembros[0]
    expect(ana.minutos).toBe(330)
    expect(ana.dias).toBe(3)
    expect(ana.acciones).toBe(8)
    expect(ana.apps.map((a) => a.nombre)).toEqual(['Proyectos', 'Chat', 'Inicio', 'Cotizador'])
    expect(r.miembros[2]).toMatchObject({ userId: 'luisa', minutos: 0, acciones: 1, ultima: null })
    expect(r.minutosEquipo).toBe(370)
    expect(r.activos).toBe(2)
    expect(r.accionesEquipo).toBe(9)
    expect(r.appMasUsada).toEqual({ nombre: 'Proyectos', minutos: 290 })
  })

  it('con las cuentas de servicio incluidas, el bot manda en tiempo', () => {
    const r = resumirUso(filas, acciones, apps)
    expect(r.miembros[0].userId).toBe('bot')
    expect(r.appMasUsada).toEqual({ nombre: 'Proyectos', minutos: 1190 })
  })

  it('un módulo fuera de la lista se muestra por su slug', () => {
    expect(nombreApp('modulo:gerencia', apps)).toBe('gerencia')
    expect(nombreApp('equipo', apps)).toBe('Equipo')
  })
})
