// Observador central de las respuestas de las Netlify Functions del portal.
//
// El helper netlify/lib/autorizacion.mts contesta sus negativas con
// { error, codigo }. Las llamadas a /api/* están repartidas (api.ts,
// calendar.ts, mail.ts, search.ts, Mail, BlogTab, LeadsTab…) y cada una
// trata su error a su manera; en vez de tocarlas, AuthContext instala este
// envoltorio de fetch, que lee el `codigo` de una copia (clone()) de cada
// 401/503 de /api/* o /.netlify/functions/* del mismo origen y avisa al
// shell. El llamador recibe la misma respuesta, con el cuerpo sin leer.
// Al final, cerrarSesion(): el cierre de sesión que falla cerrado.

// mfa: factor verificado y sesión aal1 → pedir el código TOTP (no cerrar).
// sesion: token rechazado por Auth → cerrar la sesión.
// transitorio: Auth caído o lento (503) → no forzar un nuevo inicio.
export type FalloSesion = 'mfa' | 'sesion' | 'transitorio'

export function clasificarFallo(status: number, codigo: unknown): FalloSesion | null {
  if (status === 401 && codigo === 'mfa_requerida') return 'mfa'
  if (status === 401 && codigo === 'sesion_invalida') return 'sesion'
  if (status === 503 && codigo === 'auth_lento') return 'transitorio'
  return null
}

// Solo las funciones del propio portal: mismo origen y ruta /api/ o
// /.netlify/functions/ (Supabase, la TRM o cualquier otro host no cuentan).
export function esRutaDeFuncion(url: string, origen: string): boolean {
  let u: URL
  try {
    u = new URL(url, origen)
  } catch {
    return false
  }
  if (u.origin !== origen) return false
  return u.pathname.startsWith('/api/') || u.pathname.startsWith('/.netlify/functions/')
}

// Error de supabase.auth que no prueba que la sesión sea inválida: red
// caída (AuthRetryableFetchError, estado 0), 5xx o límite de Auth (429).
export function esErrorAuthPasajero(error: { name?: string; status?: number }): boolean {
  if (error.name === 'AuthRetryableFetchError') return true
  const status = error.status ?? 0
  return status === 0 || status === 429 || status >= 500
}

type Fetch = typeof fetch

export interface DestinoFetch {
  fetch: Fetch
  location: { origin: string }
}

const MARCA = '__observadorFuncionesPortal'

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

// Envuelve destino.fetch (window por defecto) y devuelve la función que lo
// retira. Una segunda instalación sobre un fetch ya envuelto no vuelve a
// envolverlo. Sin bucles: mientras un aviso está en curso, los fallos del
// mismo tipo (varias llamadas en paralelo) se descartan y las llamadas que
// empiezan durante el aviso (las del propio manejador) no se observan.
export function instalarObservadorFunciones(
  alFallar: (tipo: FalloSesion) => void | Promise<void>,
  destino: DestinoFetch = globalThis as unknown as DestinoFetch,
): () => void {
  const actual = destino.fetch as Fetch & { [MARCA]?: true }
  if (typeof actual !== 'function' || actual[MARCA]) return () => {}

  const original = actual
  const enCurso = new Set<FalloSesion>()
  let activo = true

  function avisar(tipo: FalloSesion) {
    if (enCurso.has(tipo)) return
    enCurso.add(tipo)
    Promise.resolve()
      .then(() => alFallar(tipo))
      .catch((err: unknown) => console.error('Aviso de sesión falló:', err))
      .finally(() => enCurso.delete(tipo))
  }

  function observar(input: RequestInfo | URL, res: Response) {
    if (res.status !== 401 && res.status !== 503) return
    if (!esRutaDeFuncion(urlDe(input), destino.location.origin)) return
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return
    let copia: Response
    try {
      copia = res.clone()
    } catch {
      return
    }
    copia
      .json()
      .then((cuerpo: unknown) => {
        const codigo =
          cuerpo && typeof cuerpo === 'object' ? (cuerpo as { codigo?: unknown }).codigo : undefined
        const tipo = clasificarFallo(res.status, codigo)
        if (tipo && activo) avisar(tipo)
      })
      .catch(() => {})
  }

  const envuelto = async function (input: RequestInfo | URL, init?: RequestInit) {
    const observable = activo && enCurso.size === 0
    const res = await original.call(destino, input, init)
    if (observable && activo) {
      try {
        observar(input, res)
      } catch {
        /* el observador nunca rompe la llamada */
      }
    }
    return res
  } as Fetch & { [MARCA]?: true }
  envuelto[MARCA] = true
  destino.fetch = envuelto

  return () => {
    activo = false
    // Si otro código envolvió fetch después, se queda; este envoltorio ya
    // solo pasa las llamadas.
    if (destino.fetch === envuelto) destino.fetch = original
  }
}

// Cierre de sesión que falla cerrado. supabase.auth.signOut() solo borra la
// sesión guardada si Auth contesta bien al POST /logout (o con 401, 403 o
// 404): con la red caída, un 5xx o un 429 devuelve { error } y la sesión
// sigue en localStorage. cerrarSesion() espera la revocación con un tope y,
// si Auth falla, tarda o deja la clave, la borra como portal-kit.js
// (sb-*-auth-token). 'local' significa que el refresh token puede seguir
// vivo en el servidor hasta vencer y que quien llama debe recargar la página
// para que el shell arranque sin la sesión que aún tiene en memoria.
export const TOPE_CIERRE_MS = 4000

const CLAVE_SESION = /^sb-.+-auth-token$/

export type Almacen = Pick<Storage, 'length' | 'key' | 'removeItem'>

function almacenDelNavegador(): Almacen | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// Claves de sesión de Supabase en el almacén; nunca lanza.
function clavesDeSesion(almacen: Almacen | null): string[] {
  const claves: string[] = []
  try {
    if (!almacen) return claves
    for (let i = 0; i < almacen.length; i++) {
      const clave = almacen.key(i)
      if (clave && CLAVE_SESION.test(clave)) claves.push(clave)
    }
  } catch {
    /* almacenamiento bloqueado */
  }
  return claves
}

export async function cerrarSesion(
  revocar: () => Promise<{ error: unknown }>,
  { almacen = almacenDelNavegador(), topeMs = TOPE_CIERRE_MS }: { almacen?: Almacen | null; topeMs?: number } = {},
): Promise<'auth' | 'local'> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  const agotado = new Promise<'agotado'>((r) => {
    reloj = setTimeout(() => r('agotado'), topeMs)
  })
  let cerroAuth = false
  try {
    const r = await Promise.race([revocar(), agotado])
    cerroAuth = r !== 'agotado' && !r.error
  } catch {
    /* signOut lanzó: queda el cierre local */
  } finally {
    clearTimeout(reloj)
  }
  if (cerroAuth && clavesDeSesion(almacen).length === 0) return 'auth'
  for (const clave of clavesDeSesion(almacen)) {
    try {
      almacen?.removeItem(clave)
    } catch {
      /* almacenamiento bloqueado */
    }
  }
  return 'local'
}
