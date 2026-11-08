import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cerrarSesion,
  clasificarFallo,
  esErrorAuthPasajero,
  esRutaDeFuncion,
  instalarObservadorFunciones,
  TOPE_CIERRE_MS,
  type Almacen,
  type DestinoFetch,
  type FalloSesion,
} from '../funciones'

const ORIGEN = 'https://portal.test'

// Respuesta como las de respuesta()/respuestaV1() del helper de autorización
function negativa(status: number, codigo: string) {
  return Response.json({ error: 'mensaje del helper', codigo }, { status })
}

function destinoFalso(responder: (url: string) => Response = () => negativa(401, 'mfa_requerida')) {
  const llamadas: string[] = []
  const destino: DestinoFetch = {
    location: { origin: ORIGEN },
    fetch: (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      llamadas.push(url)
      return responder(url)
    }) as typeof fetch,
  }
  return { destino, llamadas }
}

// Deja correr las lecturas de clone().json() y los avisos pendientes
const esperar = () => new Promise((r) => setTimeout(r, 20))

describe('clasificarFallo', () => {
  it('reconoce los códigos del helper que le importan al shell', () => {
    expect(clasificarFallo(401, 'mfa_requerida')).toBe('mfa')
    expect(clasificarFallo(401, 'sesion_invalida')).toBe('sesion')
    expect(clasificarFallo(503, 'auth_lento')).toBe('transitorio')
  })

  it('ignora el resto de negativas y los códigos con otro estado', () => {
    expect(clasificarFallo(401, 'no_autenticado')).toBeNull()
    expect(clasificarFallo(403, 'sin_permiso')).toBeNull()
    expect(clasificarFallo(429, 'tasa')).toBeNull()
    expect(clasificarFallo(500, 'error_base')).toBeNull()
    expect(clasificarFallo(403, 'mfa_requerida')).toBeNull()
    expect(clasificarFallo(401, undefined)).toBeNull()
  })
})

describe('esRutaDeFuncion', () => {
  it('acepta /api/* y /.netlify/functions/* del mismo origen', () => {
    expect(esRutaDeFuncion('/api/connector-proxy', ORIGEN)).toBe(true)
    expect(esRutaDeFuncion('/.netlify/functions/mail-inbox', ORIGEN)).toBe(true)
    expect(esRutaDeFuncion(`${ORIGEN}/api/notify-event`, ORIGEN)).toBe(true)
  })

  it('rechaza otros orígenes y otras rutas', () => {
    expect(esRutaDeFuncion('https://otro.test/api/connector-proxy', ORIGEN)).toBe(false)
    expect(esRutaDeFuncion('//otro.test/api/x', ORIGEN)).toBe(false)
    expect(esRutaDeFuncion('https://abc.supabase.co/functions/v1/x', ORIGEN)).toBe(false)
    expect(esRutaDeFuncion('/apps/proyectos', ORIGEN)).toBe(false)
    expect(esRutaDeFuncion('/apix', ORIGEN)).toBe(false)
    expect(esRutaDeFuncion('/api/../rest/v1/x', ORIGEN)).toBe(false)
  })
})

describe('esErrorAuthPasajero', () => {
  it('red, 5xx y 429 no prueban que la sesión sea inválida', () => {
    expect(esErrorAuthPasajero({ name: 'AuthRetryableFetchError', status: 0 })).toBe(true)
    expect(esErrorAuthPasajero({ status: 503 })).toBe(true)
    expect(esErrorAuthPasajero({ status: 429 })).toBe(true)
  })

  it('un 4xx de Auth o la sesión ausente sí', () => {
    expect(esErrorAuthPasajero({ name: 'AuthApiError', status: 401 })).toBe(false)
    expect(esErrorAuthPasajero({ name: 'AuthApiError', status: 403 })).toBe(false)
    expect(esErrorAuthPasajero({ name: 'AuthSessionMissingError', status: 400 })).toBe(false)
  })
})

describe('instalarObservadorFunciones', () => {
  it('avisa del código y entrega al llamador el cuerpo sin consumir', async () => {
    const { destino } = destinoFalso()
    const alFallar = vi.fn()
    const quitar = instalarObservadorFunciones(alFallar, destino)

    const res = await destino.fetch('/api/connector-proxy', { method: 'POST' })
    expect(res.status).toBe(401)
    expect(res.bodyUsed).toBe(false)
    expect(await res.json()).toEqual({ error: 'mensaje del helper', codigo: 'mfa_requerida' })

    await esperar()
    expect(alFallar).toHaveBeenCalledTimes(1)
    expect(alFallar).toHaveBeenCalledWith('mfa')
    quitar()
  })

  it('distingue sesión inválida de Auth lento', async () => {
    const vistos: FalloSesion[] = []
    const { destino } = destinoFalso((url) =>
      url.endsWith('lento') ? negativa(503, 'auth_lento') : negativa(401, 'sesion_invalida'),
    )
    const quitar = instalarObservadorFunciones((t) => {
      vistos.push(t)
    }, destino)

    await destino.fetch('/api/mail-inbox-lento')
    await esperar()
    await destino.fetch('/.netlify/functions/mail-inbox')
    await esperar()
    expect(vistos).toEqual(['transitorio', 'sesion'])
    quitar()
  })

  it('no reacciona a otros orígenes ni a otras negativas', async () => {
    const { destino } = destinoFalso((url) =>
      url.includes('permiso') ? negativa(403, 'sin_permiso') : negativa(401, 'mfa_requerida'),
    )
    const alFallar = vi.fn()
    const quitar = instalarObservadorFunciones(alFallar, destino)

    await destino.fetch('https://otro.test/api/connector-proxy')
    await destino.fetch(new URL('https://abc.supabase.co/auth/v1/user'))
    await destino.fetch('/api/sin-permiso')
    await destino.fetch('/apps/proyectos')
    await esperar()
    expect(alFallar).not.toHaveBeenCalled()
    quitar()
  })

  it('no lee cuerpos que no son JSON', async () => {
    const { destino } = destinoFalso(
      () => new Response('<html>401</html>', { status: 401, headers: { 'content-type': 'text/html' } }),
    )
    const alFallar = vi.fn()
    const quitar = instalarObservadorFunciones(alFallar, destino)

    const res = await destino.fetch('/api/connector-proxy')
    expect(await res.text()).toBe('<html>401</html>')
    await esperar()
    expect(alFallar).not.toHaveBeenCalled()
    quitar()
  })

  it('no hace bucles: el manejador que vuelve a llamar a una función no se re-dispara', async () => {
    const { destino, llamadas } = destinoFalso(() => negativa(401, 'sesion_invalida'))
    let veces = 0
    const quitar = instalarObservadorFunciones(async () => {
      veces += 1
      // Tope solo para que un bucle haga fallar la prueba en vez de colgarla
      if (veces < 5) await destino.fetch('/api/connector-proxy')
    }, destino)

    await destino.fetch('/api/connector-proxy')
    await esperar()
    await esperar()
    expect(veces).toBe(1)
    expect(llamadas).toHaveLength(2)
    quitar()
  })

  it('las llamadas en paralelo con el mismo fallo dan un solo aviso mientras está en curso', async () => {
    const { destino } = destinoFalso(() => negativa(401, 'sesion_invalida'))
    let liberar: () => void = () => {}
    const alFallar = vi.fn(() => new Promise<void>((r) => (liberar = r)))
    const quitar = instalarObservadorFunciones(alFallar, destino)

    await Promise.all([
      destino.fetch('/api/a'),
      destino.fetch('/api/b'),
      destino.fetch('/api/c'),
    ])
    await esperar()
    expect(alFallar).toHaveBeenCalledTimes(1)
    liberar()
    quitar()
  })

  it('instalar dos veces no envuelve dos veces y quitar devuelve el fetch original', async () => {
    const { destino } = destinoFalso()
    const original = destino.fetch
    const alFallar = vi.fn()
    const quitar = instalarObservadorFunciones(alFallar, destino)
    const envuelto = destino.fetch
    const quitarSegunda = instalarObservadorFunciones(alFallar, destino)
    expect(destino.fetch).toBe(envuelto)

    await destino.fetch('/api/connector-proxy')
    await esperar()
    expect(alFallar).toHaveBeenCalledTimes(1)

    quitarSegunda()
    expect(destino.fetch).toBe(envuelto)
    quitar()
    expect(destino.fetch).toBe(original)

    await destino.fetch('/api/connector-proxy')
    await esperar()
    expect(alFallar).toHaveBeenCalledTimes(1)
  })

  it('un error de red llega intacto al llamador', async () => {
    const destino: DestinoFetch = {
      location: { origin: ORIGEN },
      fetch: (async () => {
        throw new TypeError('Failed to fetch')
      }) as typeof fetch,
    }
    const alFallar = vi.fn()
    const quitar = instalarObservadorFunciones(alFallar, destino)
    await expect(destino.fetch('/api/connector-proxy')).rejects.toThrow('Failed to fetch')
    expect(alFallar).not.toHaveBeenCalled()
    quitar()
  })
})

// localStorage mínimo: la sesión de Supabase y claves ajenas que no se tocan
const CLAVE = 'sb-placeholder-auth-token'
function almacenFalso() {
  const datos = new Map<string, string>([
    ['tema', 'calido'],
    [CLAVE, '{"access_token":"a","refresh_token":"r"}'],
    [`${CLAVE}-code-verifier`, 'v'],
  ])
  const almacen: Almacen = {
    get length() {
      return datos.size
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
    removeItem: (k: string) => {
      datos.delete(k)
    },
  }
  return { almacen, datos }
}

describe('cerrarSesion', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('si Auth la cierra no toca nada más', async () => {
    const { almacen, datos } = almacenFalso()
    // supabase.auth.signOut() correcto: _removeSession borra la clave
    const revocar = vi.fn(async () => {
      datos.delete(CLAVE)
      return { error: null }
    })
    expect(await cerrarSesion(revocar, { almacen })).toBe('auth')
    expect(revocar).toHaveBeenCalledTimes(1)
    expect([...datos.keys()]).toEqual(['tema', `${CLAVE}-code-verifier`])
  })

  it('con Auth caído, 5xx o 429 falla cerrado: borra la sesión local', async () => {
    const errores = [
      new AuthRetryableFetchError('Failed to fetch', 0),
      new AuthRetryableFetchError('Service Unavailable', 503),
      new AuthApiError('Too Many Requests', 429, 'over_request_rate_limit'),
    ]
    for (const error of errores) {
      const { almacen, datos } = almacenFalso()
      expect(await cerrarSesion(async () => ({ error }), { almacen })).toBe('local')
      expect(datos.has(CLAVE)).toBe(false)
      expect(datos.get('tema')).toBe('calido')
    }
  })

  it('sin respuesta de Auth en 4 s falla cerrado', async () => {
    vi.useFakeTimers()
    const { almacen, datos } = almacenFalso()
    let resultado: string | null = null
    void cerrarSesion(() => new Promise<{ error: unknown }>(() => {}), { almacen }).then(
      (r) => (resultado = r),
    )
    await vi.advanceTimersByTimeAsync(TOPE_CIERRE_MS - 1)
    expect(resultado).toBeNull()
    expect(datos.has(CLAVE)).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(resultado).toBe('local')
    expect(datos.has(CLAVE)).toBe(false)
  })

  it('si signOut lanza o deja la clave, también falla cerrado', async () => {
    const a = almacenFalso()
    const lanza = async (): Promise<{ error: unknown }> => {
      throw new TypeError('Failed to fetch')
    }
    expect(await cerrarSesion(lanza, { almacen: a.almacen })).toBe('local')
    expect(a.datos.has(CLAVE)).toBe(false)

    const b = almacenFalso()
    expect(await cerrarSesion(async () => ({ error: null }), { almacen: b.almacen })).toBe('local')
    expect(b.datos.has(CLAVE)).toBe(false)
  })

  it('sin almacenamiento o con el almacenamiento bloqueado no lanza', async () => {
    const fallo = async () => ({ error: new AuthRetryableFetchError('Failed to fetch', 0) })
    expect(await cerrarSesion(fallo, { almacen: null })).toBe('local')
    const bloqueado: Almacen = {
      get length(): number {
        throw new DOMException('bloqueado', 'SecurityError')
      },
      key: () => null,
      removeItem: () => {},
    }
    expect(await cerrarSesion(fallo, { almacen: bloqueado })).toBe('local')
  })
})
