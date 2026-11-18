// Módulos de la instalación (PP-DEC-04). Lo corre quien instala con
// SUPABASE_DB_URL en el entorno (nunca como argumento; nunca se imprime):
// escribe public.modulos_instalacion con la cadena del instalador, que es lo
// único que puede escribirla (la API no tiene escritura sobre esa tabla).
//
// Uso:
//   node tools/instalar/modulos.mjs --listar
//   node tools/instalar/modulos.mjs --activar <slug> [--limites '<json>']
//   node tools/instalar/modulos.mjs --desactivar <slug> [--cascada]
//   node tools/instalar/modulos.mjs --limites <slug> '<json>'
//
// El registro src/lib/modulos.ts manda: un módulo desconocido o planeado no
// se activa, una dependencia dura inactiva lo impide (y la salida dice en qué
// orden activar lo que falta; «integra» no bloquea) y un dependiente activo
// impide desactivar (salvo --cascada, que desactiva del más lejano al
// propio). Al activar se aplican con aplicar.mjs --archivo, en orden, los
// archivos del módulo (el de su Modulo.sql y las correcciones con letra del
// mismo número: 21-crm.sql, 21b-…) que no figuren en
// instalador.esquema_aplicado; también si el módulo ya estaba activo, así
// --activar sobre una instalación hecha aplica las correcciones pendientes.
// --listar las avisa por módulo activo. Sin --limites, un módulo nuevo
// recibe los límites por defecto (PP-LIM). --limites fusiona con los
// vigentes: una clave con null queda sin límite.
//
// Salidas: 0 bien, 1 rechazado por el registro o fallo de SQL, 2 no se pudo
// (falta la variable, opción mala, falta 04 o el archivo del módulo).

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { main as aplicarMain } from './aplicar.mjs'
import { CARPETA_ESQUEMA, VARIABLE_URL, crearCliente as crearClienteReal, leerUrlBase, listarArchivosEsquema, numeroDe, ocultarUrl } from './comun.mjs'
import { MODULOS, NUCLEO, moduloPorSlug, ordenDeActivacion, validarActivacion, validarDesactivacion, validarLimites } from '../../src/lib/modulos.ts'

// PP-LIM: lo que no figura aquí queda sin límite
export const LIMITES_POR_DEFECTO = {
  nucleo: { miembros: 10 },
  ia: { ia_hora_miembro: 20, ia_dia_equipo: 300 },
}

export const CONSULTA_HAY_TABLA = `select to_regclass('public.modulos_instalacion') is not null as existe`
export const CONSULTA_FILAS = 'select slug, activo, limites from public.modulos_instalacion order by slug'
export const CONSULTA_APLICADO = `select 1 as aplicado from instalador.esquema_aplicado where archivo = $1`
export const INSERT_MODULO = 'insert into public.modulos_instalacion (slug, activo, limites) values ($1, true, $2::text::jsonb)'
export const ACTIVAR_MODULO = 'update public.modulos_instalacion set activo = true, limites = limites || $2::text::jsonb where slug = $1'
export const DESACTIVAR_MODULO = 'update public.modulos_instalacion set activo = false where slug = $1'
export const FUSIONAR_LIMITES = 'update public.modulos_instalacion set limites = limites || $2::text::jsonb where slug = $1'

export function leerArgumentos(argv) {
  const o = { accion: null, slug: null, limites: null, cascada: false }
  const fijar = (accion) => {
    if (o.accion) throw new Error('Una sola acción por corrida: --listar, --activar, --desactivar o --limites')
    o.accion = accion
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valor = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} necesita un valor`)
      return v
    }
    if (a === '--listar') fijar('listar')
    else if (a === '--activar') {
      fijar('activar')
      o.slug = valor()
    } else if (a === '--desactivar') {
      fijar('desactivar')
      o.slug = valor()
    } else if (a === '--cascada') o.cascada = true
    else if (a === '--limites') {
      // --limites <slug> '<json>' es acción; tras --activar, solo '<json>'
      const v = valor()
      if (o.accion === 'activar' || v.trim().startsWith('{')) o.limites = v
      else {
        fijar('limites')
        o.slug = v
        o.limites = valor()
      }
    } else if (a === '--help' || a === '-h') o.ayuda = true
    else throw new Error(`Opción desconocida: ${a}`)
  }
  if (!o.ayuda && !o.accion) throw new Error('Falta la acción: --listar, --activar, --desactivar o --limites')
  if (o.cascada && o.accion !== 'desactivar') throw new Error('--cascada solo va con --desactivar')
  if (o.limites !== null && o.accion !== 'activar' && o.accion !== 'limites') throw new Error('--limites con valor solo va con --activar')
  if (o.limites !== null) {
    let v
    try {
      v = JSON.parse(o.limites)
    } catch {
      throw new Error('--limites espera un objeto JSON, por ejemplo {"miembros": 25}')
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('--limites espera un objeto JSON, por ejemplo {"miembros": 25}')
    o.limites = v
  }
  return o
}

const texto = (v) => JSON.stringify(v ?? {})

// Archivos de un módulo en orden de aplicación: el de Modulo.sql y las
// correcciones con letra de su mismo número
export function archivosDeModulo(modulo, carpeta = CARPETA_ESQUEMA) {
  if (!modulo?.sql) return []
  const numero = numeroDe(modulo.sql)
  return listarArchivosEsquema(carpeta).filter((n) => numeroDe(n) === numero)
}

export async function main(argv = process.argv.slice(2), opciones = {}) {
  const {
    env = process.env,
    log = console.log,
    error = console.error,
    carpeta = CARPETA_ESQUEMA,
    crearCliente = crearClienteReal,
    aplicarArchivo = (ruta) => aplicarMain(['--archivo', ruta], { env, log, error, carpeta }),
  } = opciones
  let o
  try {
    o = leerArgumentos(argv)
  } catch (e) {
    error(e.message)
    return 2
  }
  if (o.ayuda) {
    log("Uso: node tools/instalar/modulos.mjs --listar | --activar <slug> [--limites '<json>'] | --desactivar <slug> [--cascada] | --limites <slug> '<json>'")
    return 0
  }

  // Lo que el registro decide sin la base va primero
  if (o.slug && !moduloPorSlug(o.slug)) {
    error(`DIFIERE módulo desconocido: ${o.slug}`)
    return 1
  }
  if (o.limites) {
    const v = validarLimites(o.slug, o.limites)
    if (!v.ok) {
      for (const e of v.errores) error(`DIFIERE ${e}`)
      return 1
    }
  }
  const modulo = o.slug ? moduloPorSlug(o.slug) : null
  const rutaSql = modulo?.sql ? join(carpeta, modulo.sql) : null
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
    const [{ existe } = {}] = await cliente.consultar(CONSULTA_HAY_TABLA)
    if (!existe) {
      error('OMITIDO no existe public.modulos_instalacion: aplica el núcleo con node tools/instalar/aplicar.mjs antes')
      return 2
    }
    const filas = await cliente.consultar(CONSULTA_FILAS)
    const porSlug = new Map(filas.map((f) => [f.slug, f]))
    const activos = filas.filter((f) => f.activo).map((f) => f.slug)
    const pendientesDe = async (m) => {
      const pendientes = []
      for (const n of archivosDeModulo(m, carpeta)) {
        if (!(await cliente.consultar(CONSULTA_APLICADO, [n])).length) pendientes.push(n)
      }
      return pendientes
    }

    if (o.accion === 'listar') {
      for (const m of MODULOS) {
        const f = porSlug.get(m.slug)
        const estado = m.estado === 'planeado' ? 'planeado' : f?.activo || m.slug === NUCLEO ? 'activo' : 'inactivo'
        const pendientes = estado === 'activo' ? await pendientesDe(m) : []
        log(`${m.slug} · ${estado}${f ? ` · límites ${texto(f.limites)}` : ''}${pendientes.length ? ` · correcciones pendientes: ${pendientes.join(', ')}` : ''}`)
      }
      for (const f of filas) if (!moduloPorSlug(f.slug)) log(`${f.slug} · fuera del registro · ${f.activo ? 'activo' : 'inactivo'}`)
      return 0
    }

    if (o.accion === 'activar') {
      const v = validarActivacion(activos, o.slug)
      if (!v.ok) {
        for (const e of v.errores) error(`DIFIERE ${e}`)
        const orden = ordenDeActivacion(activos, o.slug)
        if (orden.length > 1) {
          const marca = (s) => (moduloPorSlug(s)?.estado === 'planeado' ? `${s} (planeado)` : s)
          error(`AVISO orden de activación: ${orden.map(marca).join(', ')}`)
        }
        return 1
      }
      if (rutaSql && !existsSync(rutaSql)) {
        error(`OMITIDO falta supabase/esquema/${modulo.sql}: el módulo ${o.slug} todavía no tiene su archivo`)
        return 2
      }
      for (const n of await pendientesDe(modulo)) {
        const codigo = await aplicarArchivo(resolve(join(carpeta, n)))
        if (codigo !== 0) {
          error(`DIFIERE no se aplicó ${n}: el módulo ${o.slug} ${activos.includes(o.slug) ? 'queda con esa corrección pendiente' : 'sigue inactivo'}`)
          return 1
        }
      }
      if (porSlug.has(o.slug)) await cliente.consultar(ACTIVAR_MODULO, [o.slug, texto(o.limites)])
      else await cliente.consultar(INSERT_MODULO, [o.slug, texto(o.limites ?? LIMITES_POR_DEFECTO[o.slug])])
      log(`OK ${o.slug} activo`)
      return 0
    }

    if (o.accion === 'desactivar') {
      const v = validarDesactivacion(activos, o.slug, o.cascada)
      if (!v.ok) {
        for (const e of v.errores) error(`DIFIERE ${e}`)
        return 1
      }
      if (!v.orden.length) {
        log(`OMITIDO ${o.slug} ya estaba inactivo`)
        return 0
      }
      await cliente.transaccion(async (tx) => {
        for (const s of v.orden) await tx.consultar(DESACTIVAR_MODULO, [s])
      })
      for (const s of v.orden) log(`OK ${s} inactivo`)
      log('AVISO las funciones del servidor lo ven hasta un minuto después (caché de 60 s); la base lo cierra ya')
      return 0
    }

    // --limites
    if (!porSlug.has(o.slug)) {
      error(`DIFIERE ${o.slug} no tiene fila en modulos_instalacion: actívalo con --activar ${o.slug} --limites '<json>'`)
      return 1
    }
    await cliente.consultar(FUSIONAR_LIMITES, [o.slug, texto(o.limites)])
    log(`OK límites de ${o.slug} actualizados`)
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
