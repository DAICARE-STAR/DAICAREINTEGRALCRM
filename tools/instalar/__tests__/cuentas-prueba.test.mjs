// Cuentas de prueba con cliente, terminal y fetch falsos: sin variables sale
// 2, la contraseña nunca va a la salida, a argv ni al entorno, y cada cuenta
// queda con sus roles y registrada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSULTA_ES_ADMIN,
  CONSULTA_REGISTRADA,
  CONSULTA_REQUISITOS,
  CONSULTA_ROL_QA,
  CONSULTA_USUARIO,
  DDL_CUENTAS,
  INSERT_ROL_QA,
  INSERT_USER_ROL,
  MARCAR_SERVICIO,
  REGISTRAR,
  crearUsuario,
  main,
} from '../cuentas-prueba.mjs'

// Valores armados al correr: este archivo no lleva ninguno literal
const CONTRASENA = ['Lr8', '#vQ', '2mT', 'x9Wk'].join('')
const CLAVE = ['sb', 'secret', 'Pz4', 'Hk1'].join('_')
const CADENA = `postgresql://postgres.ref:${['Ab3', 'Cd5'].join('')}@aws-0.pooler.supabase.com:5432/postgres`
const ENV = { SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SERVICE_ROLE_KEY: CLAVE, SUPABASE_DB_URL: CADENA }
const correoDe = (rol) => `${rol}@prueba.invalid`

function clienteFalso({ existentes = {}, admins = [], rolQa = null, listo = true, registradas = [] } = {}) {
  const ejecutadas = []
  const consultar = async (texto, params) => {
    ejecutadas.push({ texto, params })
    if (texto === CONSULTA_REQUISITOS) return [{ listo }]
    if (texto === CONSULTA_USUARIO) {
      const id = existentes[params[0]]
      return id ? [{ id }] : []
    }
    if (texto === CONSULTA_ES_ADMIN) return admins.includes(params[0]) ? [{ es: 1 }] : []
    if (texto === CONSULTA_REGISTRADA) return registradas.includes(`${params[0]}:${params[1]}`) ? [{ es: 1 }] : []
    if (texto === CONSULTA_ROL_QA) return rolQa ? [{ name: rolQa }] : []
    if (texto === INSERT_ROL_QA) return [{ name: 'qa' }]
    return []
  }
  return {
    ejecutadas,
    consultar,
    transaccion: async (fn) => {
      ejecutadas.push({ texto: 'BEGIN' })
      await fn({ consultar })
      ejecutadas.push({ texto: 'COMMIT' })
    },
    cerrar: async () => ejecutadas.push({ texto: 'END' }),
  }
}

function fetchFalso(respuesta = (cuerpo) => ({ ok: true, status: 200, json: async () => ({ id: `id-${cuerpo.email.split('@')[0]}` }) })) {
  const llamadas = []
  const f = async (url, init) => {
    const cuerpo = JSON.parse(init.body)
    llamadas.push({ url, init, cuerpo })
    return respuesta(cuerpo)
  }
  f.llamadas = llamadas
  return f
}

// Responde el correo de la cuenta que pide el texto, la contraseña si es
// oculta y la confirmación de reutilizar una cuenta existente
const terminal = (preguntas, confirmar = '') => async (texto, oculto) => {
  preguntas.push({ texto, oculto })
  if (oculto) return CONTRASENA
  if (/Escribe reutilizar/.test(texto)) return confirmar
  return correoDe(/cuenta (\w+)/.exec(texto)[1])
}

async function correr(config = {}) {
  const cliente = clienteFalso(config)
  const f = config.fetch ?? fetchFalso()
  const salida = []
  const errores = []
  const preguntas = []
  const codigo = await main(config.argv ?? [], {
    env: config.env ?? ENV,
    log: (s) => salida.push(String(s)),
    error: (s) => errores.push(String(s)),
    crearCliente: async () => cliente,
    preguntar: config.sinTerminal ? null : terminal(preguntas, config.confirmar),
    fetch: f,
  })
  const escritas = (texto) => cliente.ejecutadas.filter((e) => e.texto === texto).map((e) => e.params)
  return { codigo, salida, errores, texto: [...salida, ...errores].join('\n'), cliente, fetch: f, preguntas, escritas }
}

let espias
beforeEach(() => {
  espias = ['log', 'error', 'warn', 'info'].map((m) => vi.spyOn(console, m))
})
afterEach(() => vi.restoreAllMocks())

const nadaEnConsola = (valor) => {
  for (const e of espias) for (const llamada of e.mock.calls) expect(llamada.join(' ')).not.toContain(valor)
}

describe('cuentas-prueba.mjs', () => {
  it('sin variables sale con 2 sin conectar ni preguntar', async () => {
    for (const falta of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
      const env = { ...ENV }
      delete env[falta]
      const r = await correr({ env })
      expect(r.codigo).toBe(2)
      expect(r.errores[0]).toContain(falta)
      expect(r.cliente.ejecutadas).toEqual([])
      expect(r.preguntas).toEqual([])
    }
  })

  it('con argumentos o sin terminal sale con 2', async () => {
    expect((await correr({ argv: ['--contrasena', 'x'] })).codigo).toBe(2)
    expect((await correr({ sinTerminal: true })).codigo).toBe(2)
  })

  it('sin el núcleo hasta 04 sale con 2', async () => {
    const r = await correr({ listo: false })
    expect(r.codigo).toBe(2)
    expect(r.fetch.llamadas).toEqual([])
  })

  it('crea las tres cuentas, pide la contraseña sin eco y deja roles, es_servicio y registro', async () => {
    const r = await correr()
    expect(r.codigo).toBe(0)
    expect(r.cliente.ejecutadas[1].texto).toBe(DDL_CUENTAS)
    expect(r.preguntas.filter((p) => p.oculto).length).toBe(3)
    expect(r.preguntas.filter((p) => p.oculto).every((p) => /Contraseña/.test(p.texto))).toBe(true)
    expect(r.fetch.llamadas.map((l) => l.cuerpo.email)).toEqual(['qa', 'miembro', 'admin'].map(correoDe))
    // Solo qa nace como cuenta de servicio (exenta del límite de miembros)
    expect(r.fetch.llamadas.map((l) => l.cuerpo.app_metadata)).toEqual([{ es_servicio: true }, {}, {}])
    expect(r.fetch.llamadas.every((l) => l.cuerpo.email_confirm === true)).toBe(true)
    expect(r.escritas(INSERT_USER_ROL)).toEqual([['id-qa', 'qa'], ['id-admin', 'admin']])
    expect(r.escritas(MARCAR_SERVICIO)).toEqual([['id-qa']])
    expect(r.escritas(REGISTRAR)).toEqual([['qa', 'id-qa'], ['miembro', 'id-miembro'], ['admin', 'id-admin']])
  })

  it('la contraseña nunca va a la salida, a la consola, a argv ni al entorno; solo al cuerpo de Auth', async () => {
    const r = await correr()
    expect(r.texto).not.toContain(CONTRASENA)
    expect(r.texto).not.toContain(CLAVE)
    nadaEnConsola(CONTRASENA)
    expect(process.argv.join(' ')).not.toContain(CONTRASENA)
    expect(Object.values(process.env).some((v) => typeof v === 'string' && v.includes(CONTRASENA))).toBe(false)
    expect(r.cliente.ejecutadas.some((e) => JSON.stringify(e).includes(CONTRASENA))).toBe(false)
    expect(r.fetch.llamadas.every((l) => l.cuerpo.password === CONTRASENA && !l.url.includes(CONTRASENA))).toBe(true)
  })

  it('un rechazo de Auth sale con 1 sin la contraseña ni la clave en el mensaje', async () => {
    const f = fetchFalso(() => ({ ok: false, status: 422, json: async () => ({ error_code: 'weak_password', msg: `mala ${CONTRASENA}` }) }))
    const r = await correr({ fetch: f })
    expect(r.codigo).toBe(1)
    expect(r.errores.join('\n')).toMatch(/422 · weak_password/)
    expect(r.texto).not.toContain(CONTRASENA)
    expect(r.texto).not.toContain(CLAVE)
    expect(r.escritas(REGISTRAR)).toEqual([])
  })

  it('reutiliza una cuenta existente confirmada sin pedir su contraseña y reusa el rol con funcion qa', async () => {
    const r = await correr({ existentes: { [correoDe('qa')]: 'id-viejo' }, rolQa: 'pruebas', confirmar: 'reutilizar' })
    expect(r.codigo).toBe(0)
    expect(r.preguntas.filter((p) => p.oculto).length).toBe(2)
    expect(r.preguntas.filter((p) => /Escribe reutilizar/.test(p.texto)).length).toBe(1)
    expect(r.escritas(INSERT_ROL_QA)).toEqual([])
    expect(r.escritas(INSERT_USER_ROL)[0]).toEqual(['id-viejo', 'pruebas'])
  })

  it('una cuenta existente sin confirmar queda sin roles, sin es_servicio y sin registro', async () => {
    for (const confirmar of ['', 'si', 's']) {
      const r = await correr({ existentes: { [correoDe('qa')]: 'id-empleado', [correoDe('admin')]: 'id-otro' }, confirmar })
      expect(r.codigo).toBe(0)
      expect(r.salida).toContain('OMITIDO cuenta qa: ya existe en Auth y no se confirmó; queda sin cambios')
      expect(r.salida).toContain('OMITIDO cuenta admin: ya existe en Auth y no se confirmó; queda sin cambios')
      const tocadas = [...r.escritas(INSERT_USER_ROL), ...r.escritas(MARCAR_SERVICIO), ...r.escritas(REGISTRAR)].flat()
      expect(tocadas).not.toContain('id-empleado')
      expect(tocadas).not.toContain('id-otro')
      expect(r.escritas(REGISTRAR)).toEqual([['miembro', 'id-miembro']])
    }
  })

  it('una cuenta ya registrada con ese rol se reutiliza sin preguntar', async () => {
    const r = await correr({ existentes: { [correoDe('admin')]: 'id-admin-prueba' }, registradas: ['admin:id-admin-prueba'] })
    expect(r.codigo).toBe(0)
    expect(r.preguntas.some((p) => /Escribe reutilizar/.test(p.texto))).toBe(false)
    expect(r.escritas(REGISTRAR)).toContainEqual(['admin', 'id-admin-prueba'])
  })

  it('una cuenta qa o miembro que ya es administradora sale con 1', async () => {
    const r = await correr({ existentes: { [correoDe('qa')]: 'id-admin-viejo' }, admins: ['id-admin-viejo'], confirmar: 'reutilizar' })
    expect(r.codigo).toBe(1)
    expect(r.errores.join('\n')).toMatch(/administradora/)
    expect(r.escritas(REGISTRAR)).toEqual([])
  })

  it('una clave service_role JWT va también en Authorization; una sb_secret solo en apikey', async () => {
    const f = fetchFalso()
    const jwt = ['eyJ', 'abc', '.', 'def'].join('')
    await crearUsuario({ url: 'https://ref.supabase.co/', clave: jwt, correo: correoDe('a'), contrasena: CONTRASENA, servicio: false, fetch: f })
    await crearUsuario({ url: 'https://ref.supabase.co', clave: CLAVE, correo: correoDe('b'), contrasena: CONTRASENA, servicio: false, fetch: f })
    expect(f.llamadas[0].url).toBe('https://ref.supabase.co/auth/v1/admin/users')
    expect(f.llamadas[0].init.headers.Authorization).toBe(`Bearer ${jwt}`)
    expect(f.llamadas[1].init.headers.Authorization).toBeUndefined()
    expect(f.llamadas[1].init.headers.apikey).toBe(CLAVE)
  })
})
