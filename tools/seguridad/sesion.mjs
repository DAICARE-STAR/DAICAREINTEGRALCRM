// Sesión de los scripts locales contra el Supabase del portal. Único módulo
// de login para las herramientas de verificación de la fase 1.10. Solo
// contraseña: la MFA es opcional y las cuentas de servicio no llevan TOTP
// (10-mantenimiento-y-mfa-opcional, PARTE 2). Sin dependencias.
//
// Variables (del entorno o de team-portal/.env; nunca se imprimen valores):
//   VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY · CLAUDE_DEV_EMAIL · CLAUDE_DEV_PASSWORD
//
// Uso:
//   import { iniciarSesion, rest } from '../seguridad/sesion.mjs'
//   const sesion = await iniciarSesion()
//   const perfiles = await rest(sesion, 'profiles?select=id,full_name')

import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const RUTA_ENV = new URL('../../.env', import.meta.url)

// Pregunta en la terminal; con oculto no se ve lo que se escribe
function preguntar(texto, oculto = false) {
  return new Promise((resolver) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (oculto) rl._writeToOutput = (s) => { if (s.startsWith(texto)) rl.output.write(texto) }
    rl.question(texto, (respuesta) => {
      rl.close()
      if (oculto) process.stdout.write('\n')
      resolver(respuesta)
    })
  })
}

// Correo y contraseña en el modo interactivo: un Enter sin escribir vuelve a
// preguntar y a la tercera vez se sale. Nunca cae a la cuenta de servicio.
const INTENTOS = 3
async function pedirNoVacio(pedir, [texto, otraVez], oculto, vacio) {
  for (let i = 0; i < INTENTOS; i++) {
    const respuesta = await pedir(i ? otraVez : texto, oculto)
    if (respuesta.trim()) return oculto ? respuesta : respuesta.trim()
  }
  throw new Error(`${vacio} (${INTENTOS} intentos): no se inició sesión`)
}

// .env plano (KEY=VALUE, comillas opcionales). En un valor sin comillas, un #
// con un espacio o un tabulador justo antes empieza un comentario (también
// «KEY= # nota»); pegado al = o al valor es del valor («KEY=#abc» da «#abc»,
// por las contraseñas que empiezan o llevan un #). Entre comillas el # es del
// valor. No pisa lo que ya venga del entorno. Se llama al iniciar sesión, no
// al importar: los modos sin red de otros scripts no abren el archivo.
export function cargarEntorno(ruta = RUTA_ENV) {
  let texto
  try {
    texto = readFileSync(ruta, 'utf8')
  } catch {
    return false // sin .env: se usan las variables del entorno
  }
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (!m || m[1] in process.env) continue
    const entre = m[2].trim().match(/^(['"])(.*?)\1(?:[ \t]+#.*)?$/)
    process.env[m[1]] = entre ? entre[2] : m[2].replace(/[ \t]#.*$/, '').trim()
  }
  return true
}

// Login por contraseña (grant_type=password). Devuelve lo que necesita rest().
// Los mensajes de error nunca llevan el correo, la contraseña ni el token.
// rutaEnv: otro .env (las pruebas pasan uno inexistente para no leer el real).
// interactivo: en una terminal pide correo y contraseña (oculta) en vez de usar
// la cuenta de servicio del .env; así una persona corre el script con su cuenta
// sin guardar la contraseña en ningún archivo. preguntar: las pruebas pasan
// una simulada.
export async function iniciarSesion({ email, password, rutaEnv, interactivo = false, preguntar: pedir = preguntar } = {}) {
  cargarEntorno(rutaEnv)
  const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (interactivo && process.stdin.isTTY) {
    email ??= await pedirNoVacio(pedir, ['Correo del portal: ', 'Correo del portal (no puede ir vacío): '], false, 'Correo vacío')
    password ??= await pedirNoVacio(pedir, ['Contraseña: ', 'Contraseña (no puede ir vacía): '], true, 'Contraseña vacía')
  }
  email ??= process.env.CLAUDE_DEV_EMAIL
  password ??= process.env.CLAUDE_DEV_PASSWORD

  const faltan = [
    ['VITE_SUPABASE_URL', url],
    ['VITE_SUPABASE_ANON_KEY', anon],
    ['CLAUDE_DEV_EMAIL', email],
    ['CLAUDE_DEV_PASSWORD', password],
  ].filter(([, v]) => !v).map(([k]) => k)
  if (faltan.length) throw new Error(`Faltan variables: ${faltan.join(', ')} (entorno o team-portal/.env)`)

  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const datos = await r.json().catch(() => ({}))
  if (!r.ok || !datos.access_token) {
    throw new Error(`Inicio de sesión rechazado (${r.status}${datos.error_code ? ` · ${datos.error_code}` : ''})`)
  }
  // Con un factor TOTP verificado la sesión por contraseña queda en aal1:
  // exigir_mfa devuelve tablas vacías sin error y las funciones responden
  // 401 mfa_requerida. Mejor fallar aquí que verificar contra vacío.
  if ((datos.user?.factors ?? []).some((f) => f.status === 'verified')) {
    throw new Error('La cuenta tiene un factor TOTP verificado: con solo contraseña la sesión queda en aal1. Usar una cuenta de servicio sin TOTP.')
  }
  return { token: datos.access_token, userId: datos.user?.id ?? null, url, anon }
}

// Llamada a PostgREST con la sesión (RLS de la cuenta, nunca service role).
// ruta: 'tabla?filtros' o 'rpc/funcion'. Devuelve el JSON, o null si viene vacío.
export async function rest(sesion, ruta, { method = 'GET', body, prefer, headers = {} } = {}) {
  const r = await fetch(`${sesion.url}/rest/v1/${ruta.replace(/^\/+/, '')}`, {
    method,
    headers: {
      apikey: sesion.anon,
      Authorization: `Bearer ${sesion.token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const texto = await r.text()
  let datos = null
  if (texto) {
    try {
      datos = JSON.parse(texto)
    } catch {
      datos = texto
    }
  }
  if (!r.ok) {
    const detalle = datos && typeof datos === 'object' ? [datos.code, datos.message].filter(Boolean).join(' · ') : ''
    const error = new Error(`${method} ${ruta.split('?')[0]} → ${r.status}${detalle ? ` · ${detalle}` : ''}`)
    error.status = r.status
    throw error
  }
  return datos
}
