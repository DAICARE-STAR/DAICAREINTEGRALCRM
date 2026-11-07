// Cuentas de prueba de una instalación para supabase/pruebas/rls-simulacion.sql
// y los recorridos: qa (miembro con el rol de funcion 'qa' y es_servicio),
// miembro (solo member) y admin. Lo corre quien instala, en una terminal, con
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_DB_URL en el entorno
// (nunca como argumentos; ninguna se imprime).
//
//   node tools/instalar/cuentas-prueba.mjs
//
// Pide el correo de cada cuenta. Si ya existe en Auth, la reutiliza sin tocar
// su contraseña; si no, pide la contraseña sin eco y la crea por la API Admin
// de Auth con el correo confirmado. La contraseña solo viaja en el cuerpo de
// esa llamada: nunca va a la salida, a argv ni al entorno. Después, con la
// cadena del instalador, asigna los roles, marca qa como cuenta de servicio y
// la registra en instalador.cuentas_prueba(rol, user_id), que la simulación
// lee. La cuenta qa nace con app_metadata.es_servicio, así que no cuenta para
// el límite de miembros.
//
// Salidas: 0 bien, 1 rechazo de Auth o de la base, 2 no se pudo (faltan
// variables, sin terminal, falta 04).

import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VARIABLE_URL, crearCliente as crearClienteReal, leerUrlBase, ocultarUrl } from './comun.mjs'

export const ROLES = ['qa', 'miembro', 'admin']
export const VARIABLES = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', VARIABLE_URL]

export const DDL_CUENTAS = `create table if not exists instalador.cuentas_prueba (
  rol text primary key check (rol in ('qa', 'miembro', 'admin')),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  registrado_at timestamptz not null default now()
);
revoke all on instalador.cuentas_prueba from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on instalador.cuentas_prueba from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on instalador.cuentas_prueba from authenticated';
  end if;
end $$;`

export const CONSULTA_REQUISITOS = `select to_regclass('public.modulos_instalacion') is not null and to_regnamespace('instalador') is not null as listo`
export const CONSULTA_USUARIO = 'select id from auth.users where lower(email) = lower($1)'
export const CONSULTA_ES_ADMIN = `select 1 as es from public.user_roles where user_id = $1 and role = 'admin'`
export const CONSULTA_ROL_QA = `select name from public.roles where funcion = 'qa'`
export const INSERT_ROL_QA = `insert into public.roles as r (name, description, permissions, position, funcion)
values ('qa', 'Cuenta de pruebas automáticas', '{}', 5, 'qa')
on conflict (name) do update set funcion = 'qa' where r.funcion is null
returning name`
export const INSERT_USER_ROL = 'insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing'
export const MARCAR_SERVICIO = 'update public.profiles set es_servicio = true where id = $1'
export const REGISTRAR = `insert into instalador.cuentas_prueba (rol, user_id) values ($1, $2)
on conflict (rol) do update set user_id = excluded.user_id, registrado_at = now()`

const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/
const INTENTOS = 3

// Pregunta en la terminal; con oculto no se ve lo que se escribe (patrón de
// tools/seguridad/sesion.mjs de team-portal)
function preguntarTerminal(texto, oculto = false) {
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

async function pedirValido(preguntar, texto, oculto, valido, motivo) {
  for (let i = 0; i < INTENTOS; i++) {
    const r = await preguntar(i ? `${texto.replace(/: $/, '')} (${motivo}): ` : texto, oculto)
    const v = oculto ? r : r.trim()
    if (valido(v)) return v
  }
  throw new Error(`${motivo} (${INTENTOS} intentos)`)
}

// Crea el usuario en Auth. Con una clave service_role JWT va también en
// Authorization; una clave secreta nueva (sb_secret_…) va solo en apikey.
export async function crearUsuario({ url, clave, correo, contrasena, servicio, fetch: f = fetch }) {
  const r = await f(`${url.replace(/\/+$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: clave,
      ...(clave.startsWith('eyJ') ? { Authorization: `Bearer ${clave}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: correo,
      password: contrasena,
      email_confirm: true,
      app_metadata: servicio ? { es_servicio: true } : {},
      user_metadata: { full_name: servicio ? 'Cuenta de pruebas' : 'Cuenta de prueba' },
    }),
  })
  const datos = await r.json().catch(() => ({}))
  if (!r.ok || !datos.id) {
    throw new Error(`Auth rechazó la cuenta (${r.status}${datos.error_code ? ` · ${datos.error_code}` : ''})`)
  }
  return datos.id
}

export async function main(argv = process.argv.slice(2), opciones = {}) {
  const {
    env = process.env,
    log = console.log,
    error = console.error,
    crearCliente = crearClienteReal,
    preguntar = process.stdin.isTTY ? preguntarTerminal : null,
    fetch: f = fetch,
  } = opciones
  if (argv.length) {
    error('cuentas-prueba.mjs no recibe argumentos: los datos se piden en la terminal')
    return 2
  }
  const faltan = VARIABLES.filter((k) => !(env[k] && env[k].trim()))
  if (faltan.length) {
    error(`Faltan en el entorno: ${faltan.join(', ')} (nunca como argumentos)`)
    return 2
  }
  if (!preguntar) {
    error('Correr en una terminal: las contraseñas se piden sin eco')
    return 2
  }
  const urlBase = leerUrlBase(env)
  const clave = env.SUPABASE_SERVICE_ROLE_KEY.trim()
  const ocultar = (t) => ocultarUrl(t, urlBase).split(clave).join('[clave de servicio]')

  let cliente
  try {
    cliente = await crearCliente(urlBase)
  } catch (e) {
    error(`No se pudo conectar: ${ocultar(e.message)}`)
    return 2
  }
  try {
    const [{ listo } = {}] = await cliente.consultar(CONSULTA_REQUISITOS)
    if (!listo) {
      error('OMITIDO falta el núcleo hasta 04: corre antes node tools/instalar/aplicar.mjs')
      return 2
    }
    await cliente.consultar(DDL_CUENTAS)

    for (const rol of ROLES) {
      const correo = await pedirValido(preguntar, `Correo de la cuenta ${rol}: `, false, (v) => CORREO.test(v), 'correo no válido')
      let [{ id } = {}] = await cliente.consultar(CONSULTA_USUARIO, [correo])
      if (id) {
        log(`OMITIDO cuenta ${rol}: ya existe en Auth, se reutiliza sin cambiar su contraseña`)
      } else {
        const contrasena = await pedirValido(preguntar, `Contraseña de la cuenta ${rol}: `, true, (v) => v.length >= 12, 'al menos 12 caracteres')
        id = await crearUsuario({ url: env.SUPABASE_URL.trim(), clave, correo, contrasena, servicio: rol === 'qa', fetch: f })
        log(`OK cuenta ${rol} creada en Auth`)
      }
      if (rol !== 'admin' && (await cliente.consultar(CONSULTA_ES_ADMIN, [id])).length) {
        error(`DIFIERE la cuenta ${rol} es administradora: la simulación necesita una cuenta sin admin`)
        return 1
      }
      await cliente.transaccion(async (tx) => {
        if (rol === 'qa') {
          let [{ name } = {}] = await tx.consultar(CONSULTA_ROL_QA)
          if (!name) [{ name } = {}] = await tx.consultar(INSERT_ROL_QA)
          if (!name) throw new Error('el rol qa existe sin funcion y no se pudo marcar')
          await tx.consultar(INSERT_USER_ROL, [id, name])
          await tx.consultar(MARCAR_SERVICIO, [id])
        }
        if (rol === 'admin') await tx.consultar(INSERT_USER_ROL, [id, 'admin'])
        await tx.consultar(REGISTRAR, [rol, id])
      })
      log(`OK cuenta ${rol} registrada en instalador.cuentas_prueba`)
    }
    return 0
  } catch (e) {
    error(`DIFIERE ${ocultar(e.message)}`)
    return 1
  } finally {
    try {
      await cliente.cerrar()
    } catch {
      // la conexión ya estaba cerrada
    }
  }
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (esPrincipal) main().then((codigo) => process.exit(codigo))
