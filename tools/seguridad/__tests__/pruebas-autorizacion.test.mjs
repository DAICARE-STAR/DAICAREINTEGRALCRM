// pruebas-autorizacion.mjs contra un portal simulado en memoria: sin red, sin
// .env y sin producción. Comprueba que los casos esperan lo que pide
// SEG-U12/13, que una respuesta indebida sale como FALLA, que con una cuenta
// admin no se llama a nada que pudiera ejecutarse y que no imprime valores.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ejecutar, esperaRechazo, leerArgumentos } from '../pruebas-autorizacion.mjs'

const SB = 'https://proyecto.supabase.test'
const PORTAL = 'https://portal.test'
const QA = 'claude-qa@empresa.test'
const UID = '11111111-2222-4333-8444-555555555555'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const TOKEN = [b64({ alg: 'HS256' }), b64({ sub: UID, email: QA, role: 'authenticated' }), 'firma'].join('.')
const SESION = { token: TOKEN, userId: UID, url: SB, anon: 'anon-de-prueba' }

const json = (status, datos) => new Response(datos === undefined ? '' : JSON.stringify(datos), { status })
const r42501 = (status, hint) => json(status, { code: '42501', message: 'permission denied', ...(hint ? { hint } : {}) })

// Portal que se comporta como pide el contrato. cambios: { 'ruta': fn } pisa una respuesta.
function portalSimulado({ admin = false, apps = {}, cambios = {} } = {}) {
  return vi.fn(async (url, init = {}) => {
    const u = new URL(url)
    const auth = init.headers?.Authorization
    const conSesion = auth === `Bearer ${TOKEN}`
    const clave = u.pathname.replace(/^\/(rest\/v1|api)\//, '')
    if (cambios[clave]) return cambios[clave](u, init)
    if (u.origin === SB) {
      if (!auth) return r42501(401)
      if (clave === 'rpc/is_admin') return json(200, admin)
      if (clave === 'rpc/has_perm') return json(200, false)
      if (clave === 'rpc/puede_ver_app') return json(200, apps[JSON.parse(init.body).p_slug] ?? false)
      if (['rpc/bot_acceso', 'rpc/bot_apps_equipo', 'rpc/bot_cuentas_servicio'].includes(clave)) return json(200, null)
      if (['rpc/credencial_revelar', 'rpc/credencial_guardar_secreto'].includes(clave)) return r42501(403, 'sin_permiso')
      if (clave.startsWith('rpc/')) return r42501(403)
      if (clave === 'portal_credentials' && init.method === 'PATCH') return r42501(403)
      if (clave === 'facturas' && init.method === 'POST') return r42501(403)
      if (clave === 'connector_runs') return json(200, [{ started_at: '2026-10-04T10:30:00Z' }])
      return json(200, [])
    }
    if (u.origin === PORTAL) {
      if (clave === 'sync-connectors-background') return json(202)
      if (clave === 'calendar-ics') return new Response('Token inválido', { status: 401 })
      if (!auth) return json(401, { error: 'No autenticado', codigo: 'no_autenticado' })
      if (!conSesion) return json(401, { error: 'Sesión inválida', codigo: 'sesion_invalida' })
      if (clave === 'connector-proxy' || clave === 'push-notify') return json(403, { error: 'Sin permiso', codigo: 'sin_permiso' })
      if (clave === 'scan-alertas-correo') {
        const buzon = u.searchParams.get('buzon')
        if (buzon !== null && !buzon.includes('@')) return json(400, { error: 'Parámetros inválidos', codigo: 'parametros' })
        return buzon === QA ? json(200, { buzonRevisado: QA, configurado: false, mensaje: 'Falta la contraseña' }) : json(403, { error: 'Sin permiso', codigo: 'sin_permiso' })
      }
      if (clave === 'mail-inbox') return json(403, { error: 'Tu rol no puede ver el correo del equipo.' })
      if (clave === 'notify-event') return json(404, { error: 'Evento no encontrado' })
    }
    return json(500, { error: 'ruta no simulada' })
  })
}

async function correr(argv, fetch, sesion = SESION) {
  vi.stubGlobal('fetch', fetch)
  const lineas = []
  const codigo = await ejecutar(leerArgumentos(argv), { sesion, portal: PORTAL, log: (s) => lineas.push(s), esperar: async () => {} })
  return { codigo, lineas, texto: lineas.join('\n') }
}

afterEach(() => vi.unstubAllGlobals())

describe('pruebas-autorizacion: portal que cumple el contrato', () => {
  it('--base --funciones: todo OK u OMITIDO, sale con 0', async () => {
    const { codigo, lineas, texto } = await correr(['--base', '--funciones'], portalSimulado())
    expect(texto).not.toMatch(/^FALLA/m)
    expect(codigo).toBe(0)
    expect(texto).toMatch(/Sesión con claude-qa@: sin admin ni permisos sensibles/)
    for (const id of ['B1.1', 'B1.6', 'B2.1', 'B5.1', 'B5.6', 'B7.1', 'B8.1', 'B8.2', 'F1.1', 'F1.5', 'F1.6', 'F2.1', 'F3.2', 'F3.5', 'F4.1', 'F4.4']) {
      expect(lineas.find((l) => l.includes(` ${id} `) || l.startsWith(`OK      ${id}`))).toMatch(/^OK/)
    }
    // Lo que no se puede probar sin escribir o sin la service role queda OMITIDO con el motivo
    expect(lineas.find((l) => l.includes('B5.7'))).toMatch(/^OMITIDO.*--tras-cierre/)
    expect(lineas.find((l) => l.includes('F3.8'))).toMatch(/^OMITIDO.*--con-escritura/)
    // Sin corrida nueva no se prueba nada: la fila llega al terminar cada conector
    expect(lineas.find((l) => l.includes('F4.3'))).toMatch(/^OMITIDO.*no concluyente/)
  })

  it('una migración sin aplicar (404 PGRST202) es OMITIDO, no FALLA', async () => {
    const noExiste = () => json(404, { code: 'PGRST202', message: 'Could not find the function' })
    const { codigo, lineas } = await correr(['--base', '--solo', 'B1.1'], portalSimulado({ cambios: { 'rpc/bot_acceso': noExiste } }))
    expect(lineas.find((l) => l.includes('B1.1'))).toMatch(/^OMITIDO.*la 67 no está aplicada/)
    expect(codigo).toBe(0)
  })

  it('sin la 75 (404 PGRST205) los casos de facturas son OMITIDO', async () => {
    const noExiste = () => json(404, { code: 'PGRST205', message: 'Could not find the table' })
    const { codigo, lineas } = await correr(['--base', '--solo', 'B8'], portalSimulado({ cambios: { facturas: noExiste } }))
    expect(lineas.filter((l) => /B8\.[12]/.test(l)).every((l) => /^OMITIDO.*la 75 no está aplicada/.test(l))).toBe(true)
    expect(codigo).toBe(0)
  })
})

describe('pruebas-autorizacion: detecta lo indebido', () => {
  it.each([
    ['bot_acceso devuelve la ficha', 'B1.1', { 'rpc/bot_acceso': () => json(200, { uid: UID, apps: ['proyectos'] }) }],
    ['claude-qa ve vínculos ajenos', 'B1.4', { bot_telegram_vinculos: () => json(200, [{ chat_id: -1 }]) }],
    ['el anónimo ejecuta credencial_revelar', 'B2.12', { 'rpc/credencial_revelar': (u, init) => (init.headers.Authorization ? r42501(403, 'sin_permiso') : json(200, '')) }],
    ['revelar sin permiso con otro hint', 'B5.1', { 'rpc/credencial_revelar': () => r42501(403, 'mfa_requerida') }],
    ['delete-event ajeno con 502', 'F1.6', { 'connector-proxy': () => json(502, { error: 'Error del conector de calendario' }) }],
    ['el buzón propio trae el panorama de cuentas', 'F3.2', { 'scan-alertas-correo': () => json(200, { cuentas: [], parExplicito: false, configurado: false }) }],
    ['un 429 sin codigo tasa', 'F1.2', { 'connector-proxy': () => json(429, { error: 'Demasiadas' }) }],
    ['claude-qa lee facturas sin view_billing', 'B8.1', { facturas: () => json(200, [{ pf_id: 1 }]) }],
    ['claude-qa da de alta una factura', 'B8.2', { facturas: (u, init) => (init.method === 'POST' ? json(201) : json(200, [])) }],
  ])('%s → FALLA y sale con 1', async (_, id, cambios) => {
    const { codigo, lineas } = await correr(['--base', '--funciones', '--solo', id], portalSimulado({ cambios }))
    expect(lineas.find((l) => l.includes(` ${id} `) || l.includes(`${id}  `))).toMatch(/^FALLA/)
    expect(codigo).toBe(1)
  })

  it('una corrida nueva en connector_runs tras los 202 → FALLA', async () => {
    const corridas = ['2026-10-04T10:30:00Z', '2026-10-04T15:02:00Z']
    const fetch = portalSimulado({ cambios: { connector_runs: () => json(200, [{ started_at: corridas.shift() ?? '2026-10-04T15:02:00Z' }]) } })
    const { codigo, lineas } = await correr(['--funciones', '--solo', 'F4'], fetch)
    expect(lineas.find((l) => l.includes('F4.3'))).toMatch(/^FALLA.*corrida nueva/)
    expect(codigo).toBe(1)
  })

  it('un 429 con codigo tasa es OMITIDO (repetir más tarde)', () => {
    expect(esperaRechazo({ status: 429, datos: { codigo: 'tasa' } }, { status: 403 }).estado).toBe('OMITIDO')
  })
})

describe('pruebas-autorizacion: cuenta que no sirve para los negativos', () => {
  it('admin: omite los negativos sin llamarlos y sale con 2', async () => {
    const fetch = portalSimulado({ admin: true })
    const { codigo, texto } = await correr(['--base', '--funciones'], fetch)
    expect(codigo).toBe(2)
    expect(texto).toMatch(/es admin/)
    const llamadas = fetch.mock.calls.map(([url, init]) => ({ ruta: new URL(url).pathname, auth: init?.headers?.Authorization === `Bearer ${TOKEN}` }))
    // Con la sesión solo se leyó el perfil (y connector_runs); nada del proxy, la bóveda ni notify-event
    const conSesion = llamadas.filter((c) => c.auth).map((c) => c.ruta)
    expect(conSesion.every((r) => /rpc\/(is_admin|has_perm|puede_ver_app)$|connector_runs$/.test(r))).toBe(true)
  })

  it('con un permiso sensible también se omiten', async () => {
    const fetch = portalSimulado({ cambios: { 'rpc/has_perm': (u, init) => json(200, JSON.parse(init.body).perm === 'view_credentials') } })
    const { codigo, texto } = await correr(['--base', '--solo', 'B5'], fetch)
    expect(texto).toMatch(/tiene view_credentials/)
    expect(texto).not.toMatch(/^OK/m)
    expect(codigo).toBe(2)
  })

  it('si Licitaciones no tiene roles, push-notify solo se llama sin novedades', async () => {
    const novedades = vi.fn(() => json(200, [{ id: 'n1' }]))
    const fetch = portalSimulado({ apps: { licitaciones: true }, cambios: { tender_notifications: novedades } })
    const { lineas } = await correr(['--funciones', '--solo', 'F4.4'], fetch)
    expect(lineas[1]).toMatch(/^OMITIDO.*enviaría avisos reales/)
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/api/push-notify'))).toBe(false)
  })
})

describe('pruebas-autorizacion: --revelar y --con-escritura', () => {
  it('--revelar: el valor nunca se imprime', async () => {
    const ACCESO = '99999999-8888-4777-8666-555555555555'
    const VALOR = ['valor', 'revelado', '31415'].join('-')
    const fetch = portalSimulado({
      cambios: {
        'rpc/credencial_revelar': () => json(200, VALOR),
        audit_log: () => json(200, [{ action: 'credencial.revelar', origen: 'base' }]),
      },
    })
    const { codigo, texto } = await correr(['--base', '--revelar', ACCESO], fetch)
    expect(texto).toMatch(/^OK {6}B5\.8 .*origen base/m)
    expect(texto).not.toContain(VALOR)
    expect(codigo).toBe(0)
  })

  // borrar: respuesta al DELETE; alNotificar: se llama mientras se espera a notify-event
  const conEscritura = ({ borrar = () => json(200, [{ id: 'evento-1' }]), alNotificar = () => {} } = {}) => {
    const pedidos = []
    const fetch = portalSimulado({
      cambios: {
        calendar_events: (u, init) => {
          pedidos.push(init.method)
          if (init.method === 'POST') {
            expect(JSON.parse(init.body).title).toMatch(/^MANT · /)
            return json(201, [{ id: 'evento-1' }])
          }
          // Se pide la fila borrada: un DELETE filtrado por la RLS responde 204 sin filas
          expect(init.headers.Prefer).toBe('return=representation')
          return borrar()
        },
        'notify-event': () => {
          alNotificar()
          return json(200, { recipients: 0, push: { sent: 0, removed: 0 }, email: { sent: 0 }, sinAviso: 'mantenimiento_sin_invitados' })
        },
      },
    })
    return { fetch, pedidos }
  }

  it('--con-escritura: crea el «MANT ·» propio, espera sinAviso y lo borra', async () => {
    const antes = process.listenerCount('SIGINT')
    const { fetch, pedidos } = conEscritura()
    const { lineas } = await correr(['--funciones', '--con-escritura', '--solo', 'F3.8'], fetch)
    expect(lineas[1]).toMatch(/^OK.*mantenimiento_sin_invitados/)
    expect(lineas.join('\n')).not.toMatch(/AVISO|NO se borró/)
    expect(pedidos).toEqual(['POST', 'DELETE'])
    expect(process.listenerCount('SIGINT')).toBe(antes)
  })

  it('--con-escritura: si la RLS no deja borrar (204 sin filas), avisa con el id', async () => {
    const { fetch } = conEscritura({ borrar: () => json(204) })
    const { lineas } = await correr(['--funciones', '--con-escritura', '--solo', 'F3.8'], fetch)
    expect(lineas.find((l) => l.startsWith('AVISO'))).toMatch(/evento-1.*bórralo a mano/)
    expect(lineas.find((l) => l.includes('F3.8'))).toMatch(/evento-1 NO se borró/)
  })

  it('--con-escritura: con Ctrl+C a mitad borra el evento antes de salir', async () => {
    const salir = vi.spyOn(process, 'exit').mockImplementation(() => {})
    try {
      // Solo el manejador del script, no los de vitest
      const { fetch, pedidos } = conEscritura({ alNotificar: () => process.listeners('SIGINT').at(-1)() })
      const { lineas } = await correr(['--funciones', '--con-escritura', '--solo', 'F3.8'], fetch)
      expect(lineas.join('\n')).toMatch(/Interrumpido: se borra el evento de prueba evento-1[^]*Evento de prueba borrado/)
      expect(salir).toHaveBeenCalledWith(130)
      expect(pedidos).toEqual(['POST', 'DELETE'])
    } finally {
      salir.mockRestore()
    }
  })
})

describe('pruebas-autorizacion: argumentos', () => {
  it('exige un modo y valida las combinaciones', () => {
    expect(() => leerArgumentos([])).toThrow(/--base/)
    expect(() => leerArgumentos(['--funciones', '--tras-cierre'])).toThrow(/--base/)
    expect(() => leerArgumentos(['--base', '--revelar', 'no-es-uuid'])).toThrow(/uuid/)
    expect(() => leerArgumentos(['--base', '--con-escritura'])).toThrow(/--funciones/)
    expect(() => leerArgumentos(['--funciones', '--portal', 'http://inseguro.test'])).toThrow(/https/)
    expect(leerArgumentos(['--funciones', '--portal', 'https://portal.test/'])).toMatchObject({ funciones: true, portal: 'https://portal.test' })
  })
})
