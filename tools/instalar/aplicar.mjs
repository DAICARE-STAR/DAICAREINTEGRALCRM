// Instalador del esquema consolidado (PP-DEC-02). Lo corre el usuario con
// SUPABASE_DB_URL en el entorno (nunca como argumento; nunca se imprime).
//
// Uso:
//   node tools/instalar/aplicar.mjs                      aplica el núcleo, supabase/esquema/0*.sql, en orden
//   node tools/instalar/aplicar.mjs --hasta 03           solo hasta el número 03 (del núcleo)
//   node tools/instalar/aplicar.mjs --archivo <ruta>     un archivo suelto (lo usa modulos.mjs); los
//                                                        archivos de módulo (10 en adelante) solo así
//   node tools/instalar/aplicar.mjs --verificar          corre supabase/esquema/verificar.sql
//   node tools/instalar/aplicar.mjs --solo-concatenar <salida.sql>
//                                                        respaldo para el SQL Editor: concatena
//                                                        y añade el registro tras cada archivo
//   --adoptar                                            reservado (base con tablas previas)
//
// Crea el esquema instalador y la tabla instalador.esquema_aplicado(archivo,
// sha256, aplicado_at, version_producto). Aplica cada archivo en su propia
// transacción; salta los ya aplicados con el mismo sha256 y se niega si cambió
// el sha256 de uno aplicado (un archivo aplicado no se edita). En una base con
// tablas en public y sin registro se detiene. Después de cada lote re-ejecuta
// public.aplicar_exigir_mfa() si existe.
//
// Salidas: 0 todo bien, 1 diferencias o fallos, 2 no se pudo (falta la
// variable, opción mala, comprobación omitida).

import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CARPETA_ESQUEMA,
  ESQUEMA_INSTALADOR,
  VARIABLE_URL,
  crearCliente as crearClienteReal,
  leerArchivo,
  leerUrlBase,
  listarArchivosEsquema,
  esNucleo,
  numeroDe,
  ocultarUrl,
  versionProducto,
} from './comun.mjs'

const TABLA = `${ESQUEMA_INSTALADOR}.esquema_aplicado`

// Fuera de la API: anon y authenticated no tienen USAGE sobre el esquema.
export const DDL_REGISTRO = `create schema if not exists ${ESQUEMA_INSTALADOR};
create table if not exists ${TABLA} (
  archivo text primary key,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  aplicado_at timestamptz not null default now(),
  version_producto text not null
);
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema ${ESQUEMA_INSTALADOR} from anon';
    execute 'revoke all on ${TABLA} from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema ${ESQUEMA_INSTALADOR} from authenticated';
    execute 'revoke all on ${TABLA} from authenticated';
  end if;
end $$;
revoke all on schema ${ESQUEMA_INSTALADOR} from public;
revoke all on ${TABLA} from public;`

export const CONSULTA_APLICADOS = `select archivo, sha256 from ${TABLA} order by archivo`
export const CONSULTA_TABLAS_PUBLIC = `select tablename from pg_tables where schemaname = 'public' order by tablename`
export const CONSULTA_MFA = `select 1 as existe from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'aplicar_exigir_mfa'`
export const LLAMADA_MFA = 'select public.aplicar_exigir_mfa()'
export const INSERT_REGISTRO = `insert into ${TABLA} (archivo, sha256, version_producto) values ($1, $2, $3)`

const literal = (s) => `'${String(s).replace(/'/g, "''")}'`

// Registro de un archivo para el modo --solo-concatenar: se niega si ya está
// con otro sha256 y no repite el insert si ya está con el mismo.
export function bloqueRegistro(archivo, sha, version) {
  return `do $$
begin
  if exists (select 1 from ${TABLA} where archivo = ${literal(archivo)} and sha256 <> ${literal(sha)}) then
    raise exception 'instalador: % ya aplicado con otro sha256', ${literal(archivo)};
  end if;
  insert into ${TABLA} (archivo, sha256, version_producto)
  values (${literal(archivo)}, ${literal(sha)}, ${literal(version)})
  on conflict (archivo) do nothing;
end $$;`
}

export function leerArgumentos(argv) {
  const o = { hasta: null, archivo: null, verificar: false, concatenar: null, adoptar: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valor = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('-')) throw new Error(`${a} necesita un valor`)
      return v
    }
    if (a === '--hasta') {
      const v = valor()
      if (!/^\d{2}$/.test(v)) throw new Error('--hasta espera dos cifras (por ejemplo 03)')
      o.hasta = Number(v)
    } else if (a === '--archivo') o.archivo = valor()
    else if (a === '--verificar') o.verificar = true
    else if (a === '--solo-concatenar') o.concatenar = valor()
    else if (a === '--adoptar') o.adoptar = true
    else if (a === '--help' || a === '-h') o.ayuda = true
    else throw new Error(`Opción desconocida: ${a}`)
  }
  if (o.archivo && o.hasta !== null) throw new Error('--archivo y --hasta no se combinan')
  return o
}

// Archivos a aplicar, ya leídos, en orden. Sin --archivo, solo el núcleo: el
// archivo de un módulo se aplica al activarlo, nunca en la corrida general.
export function seleccionarArchivos(o, carpeta) {
  if (o.archivo) return [leerArchivo(resolve(o.archivo))]
  return listarArchivosEsquema(carpeta)
    .filter(esNucleo)
    .filter((n) => o.hasta === null || numeroDe(n) <= o.hasta)
    .map((n) => leerArchivo(join(carpeta, n)))
}

export function concatenar(archivos, version) {
  const partes = ['-- Generado por tools/instalar/aplicar.mjs --solo-concatenar. Pegar entero en el SQL Editor.', DDL_REGISTRO]
  for (const a of archivos) {
    partes.push(`\n-- ===== ${a.nombre} (sha256 ${a.sha256}) =====`)
    partes.push(a.texto.trimEnd())
    partes.push(bloqueRegistro(a.nombre, a.sha256, version))
  }
  return partes.join('\n') + '\n'
}

// Resultado de --verificar: una línea por fila y la salida según los estados
export function resumirVerificacion(filas, log) {
  let salida = 0
  for (const f of filas) {
    log(`${f.estado} ${f.comprobacion}${f.detalle ? ` — ${f.detalle}` : ''}`)
    if (f.estado === 'DIFIERE') salida = 1
    else if (f.estado === 'OMITIDO' && salida === 0) salida = 2
  }
  return salida
}

export async function main(argv = process.argv.slice(2), opciones = {}) {
  const {
    env = process.env,
    log = console.log,
    error = console.error,
    carpeta = CARPETA_ESQUEMA,
    crearCliente = crearClienteReal,
    version = versionProducto(),
  } = opciones
  let o
  try {
    o = leerArgumentos(argv)
  } catch (e) {
    error(e.message)
    return 2
  }
  if (o.ayuda) {
    log('Uso: node tools/instalar/aplicar.mjs [--hasta NN | --archivo <ruta>] [--verificar] [--solo-concatenar <salida.sql>]')
    return 0
  }
  if (o.adoptar) {
    error('--adoptar está reservado: todavía no se implementa')
    return 2
  }

  let archivos
  try {
    archivos = seleccionarArchivos(o, carpeta)
  } catch (e) {
    error(`No se pudo leer el esquema: ${e.message}`)
    return 2
  }

  if (o.concatenar) {
    writeFileSync(resolve(o.concatenar), concatenar(archivos, version), 'utf8')
    log(`OK ${archivos.length} archivo(s) concatenados en ${o.concatenar}`)
    return 0
  }

  const url = leerUrlBase(env)
  if (!url) {
    error(`Falta ${VARIABLE_URL} en el entorno (solo en el .env del PC de quien instala; nunca como argumento)`)
    return 2
  }
  const ocultar = (t) => ocultarUrl(t, url)

  let cliente
  try {
    cliente = await crearCliente(url)
  } catch (e) {
    error(`No se pudo conectar: ${ocultar(e.message)}`)
    return 2
  }

  try {
    await cliente.consultar(DDL_REGISTRO)
    const aplicados = new Map((await cliente.consultar(CONSULTA_APLICADOS)).map((f) => [f.archivo, f.sha256]))

    if (aplicados.size === 0) {
      const tablas = (await cliente.consultar(CONSULTA_TABLAS_PUBLIC)).map((f) => f.tablename)
      if (tablas.length) {
        error(`DIFIERE la base tiene ${tablas.length} tabla(s) en public y ningún archivo registrado: no es una base vacía (${tablas.slice(0, 5).join(', ')}${tablas.length > 5 ? '…' : ''})`)
        return 1
      }
    }

    // Primero se revisa todo el lote; nada se aplica si algún archivo cambió
    const pendientes = []
    let cambiados = 0
    for (const a of archivos) {
      const previo = aplicados.get(a.nombre)
      if (previo === undefined) pendientes.push(a)
      else if (previo === a.sha256) log(`OMITIDO ${a.nombre} ya aplicado`)
      else {
        error(`DIFIERE ${a.nombre} ya aplicado con otro sha256: un archivo aplicado no se edita, el cambio va en un archivo nuevo`)
        cambiados++
      }
    }
    if (cambiados) return 1

    for (const a of pendientes) {
      try {
        await cliente.transaccion(async (tx) => {
          await tx.consultar(a.texto)
          await tx.consultar(INSERT_REGISTRO, [a.nombre, a.sha256, version])
        })
        log(`OK ${a.nombre} aplicado (${a.sha256.slice(0, 12)})`)
      } catch (e) {
        error(`DIFIERE ${a.nombre}: ${ocultar(e.message)}`)
        return 1
      }
    }

    if (pendientes.length && (await cliente.consultar(CONSULTA_MFA)).length) {
      await cliente.consultar(LLAMADA_MFA)
      log('OK aplicar_exigir_mfa() re-ejecutada')
    }

    if (o.verificar) {
      const verificar = leerArchivo(join(carpeta, 'verificar.sql'))
      const filas = await cliente.consultar(verificar.texto)
      return resumirVerificacion(filas, log)
    }
    return 0
  } catch (e) {
    error(`Error: ${ocultar(e.message)}`)
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
