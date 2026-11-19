// Cambia la contraseña de una CUENTA DE PRUEBA (las registradas en
// instalador.cuentas_prueba por cuentas-prueba.mjs) de la base de SUPABASE_DB_URL.
// Existe porque el panel de Supabase no ofrece cambiar la contraseña de un
// usuario a mano y porque pegar la contraseña en una consulta SQL se rompe con
// comillas o símbolos. La contraseña se escribe aquí sin eco, viaja como
// parámetro (nunca en el texto del SQL) y no se imprime ni se guarda.
//
//   node --env-file=.env tools/instalar/cambiar-contrasena.mjs [correo]
//
// Fallar cerrado: una cuenta que no esté registrada como de prueba no se toca.
// Al terminar comprueba que el ingreso funciona con la clave pública (la misma
// que usa la app) y dice solo si entró o no.
// Salidas: 0 cambiada y comprobada, 1 rechazada o el ingreso no entra, 2 no se
// pudo (faltan variables, sin terminal).
import { createInterface } from 'node:readline'
import { VARIABLE_URL, crearCliente, leerUrlBase, ocultarUrl } from './comun.mjs'

const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/
const MINIMO = 12

export const CAMBIAR = `update auth.users
   set encrypted_password = extensions.crypt($1, extensions.gen_salt('bf')), updated_at = now()
 where lower(email) = lower($2)
   and id in (select user_id from instalador.cuentas_prueba)
returning id`

function preguntar(texto, oculto = false) {
  return new Promise((resolver) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (oculto) rl._writeToOutput = (s) => { if (s.startsWith(texto)) rl.output.write(texto) }
    rl.question(texto, (r) => {
      rl.close()
      if (oculto) process.stdout.write('\n')
      resolver(r)
    })
  })
}

async function ingresa(urlApi, clave, correo, contrasena) {
  const r = await fetch(`${urlApi.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: clave, 'content-type': 'application/json' },
    body: JSON.stringify({ email: correo, password: contrasena }),
  })
  return r.ok
}

async function main() {
  const baseUrl = leerUrlBase()
  if (!baseUrl) {
    console.error(`Falta ${VARIABLE_URL} en el entorno`)
    return 2
  }
  if (!process.stdin.isTTY) {
    console.error('Hace falta una terminal interactiva para escribir la contraseña')
    return 2
  }
  const correo = (process.argv[2] ?? (await preguntar('Correo de la cuenta de prueba: '))).trim()
  if (!CORREO.test(correo)) {
    console.error('Ese correo no tiene forma de correo')
    return 1
  }
  const a = await preguntar(`Contraseña nueva (al menos ${MINIMO} caracteres): `, true)
  if (a.length < MINIMO) {
    console.error(`Tiene ${a.length} caracteres: hacen falta ${MINIMO} o más`)
    return 1
  }
  const b = await preguntar('Repítela: ', true)
  if (a !== b) {
    console.error('No coinciden')
    return 1
  }
  const cliente = await crearCliente(baseUrl)
  try {
    const filas = await cliente.consultar(CAMBIAR, [a, correo])
    if (filas.length !== 1) {
      console.error('No se cambió nada: ese correo no está registrado como cuenta de prueba')
      return 1
    }
    console.log('OK contraseña cambiada')
  } finally {
    await cliente.cerrar()
  }
  const urlApi = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const clave = process.env.VITE_SUPABASE_ANON_KEY
  if (!urlApi || !clave) {
    console.log('OMITIDO no se comprobó el ingreso: faltan SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
    return 0
  }
  if (await ingresa(urlApi, clave, correo, a)) {
    console.log('OK el ingreso funciona con esa contraseña')
    return 0
  }
  console.log('FALLA la contraseña se cambió pero el ingreso no entra: revisa la clave pública de VITE_SUPABASE_ANON_KEY')
  return 1
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`No se pudo: ${ocultarUrl(String(e?.message ?? e), process.env.SUPABASE_DB_URL ?? '')}`)
    process.exit(2)
  },
)
