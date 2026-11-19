// Ensaya contra la base de SUPABASE_DB_URL los archivos de supabase/esquema
// que todavía no están aplicados: los ejecuta en orden dentro de una
// transacción y la deshace siempre. Sirve para que un error de SQL (sintaxis,
// un nombre que no existe, una verificación final que aborta) salga antes del
// commit, sin dejar nada escrito ni registrar la huella del archivo.
//
//   node --env-file=.env tools/instalar/ensayar.mjs
//   node --env-file=.env tools/instalar/ensayar.mjs --simular productos[,otro]
//
// Con --simular, en la MISMA transacción y después de los archivos
// pendientes, re-ejecuta aplicar_exigir_mfa() (como aplicar.mjs al final de
// cada corrida), deja activos esos módulos con las mismas escrituras de
// modulos.mjs --activar (sus límites por defecto si no tenían fila) y corre
// supabase/pruebas/rls-simulacion.sql por el protocolo simple. El resultado
// de la simulación es el mensaje del error con que termina (como
// simular.mjs): se muestran el resumen y cada línea FALLA u OMITIDO. Un
// módulo planeado se admite si su archivo de esquema existe: dentro del
// ensayo, que se deshace, nadie lo ve; modulos.mjs --activar lo sigue
// rechazando hasta que pase a disponible.
//
// Pensado para una base de pruebas. La cadena de conexión nunca se imprime.
// Un archivo ya aplicado cuyo contenido cambió se avisa: no se puede editar
// (PP-DEC-02). Salidas: 0 todo aplica (y la simulación sale entera en OK),
// 1 algún archivo falla o cambió, o la simulación tiene FALLA o un error de
// SQL, 2 no se pudo (falta la variable, no conecta, opción mala, la
// simulación tiene OMITIDO o no corrió).
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONSULTA_MFA, LLAMADA_MFA } from './aplicar.mjs'
import { CARPETA_ESQUEMA, ESQUEMA_INSTALADOR, RAIZ, VARIABLE_URL, crearCliente as crearClienteReal, leerArchivo, leerUrlBase, listarArchivosEsquema, ocultarUrl } from './comun.mjs'
import { ACTIVAR_MODULO, CONSULTA_FILAS, CONSULTA_HAY_TABLA, INSERT_MODULO, LIMITES_POR_DEFECTO } from './modulos.mjs'
import { NUCLEO, moduloPorSlug } from '../../src/lib/modulos.ts'

export const DESHACER = 'ensayo: se deshace todo'
export const RUTA_SIMULACION = join(RAIZ, 'supabase', 'pruebas', 'rls-simulacion.sql')
export const CONSULTA_APLICADOS = `select archivo, sha256 from ${ESQUEMA_INSTALADOR}.esquema_aplicado`
const RESUMEN = /(\d+) OK · (\d+) FALLA · (\d+) OMITIDO/

export function leerArgumentos(argv) {
  const o = { simular: null, ayuda: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--simular') {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error('--simular necesita los slugs separados por coma, por ejemplo --simular productos')
      const slugs = v.split(',').map((s) => s.trim()).filter(Boolean)
      if (!slugs.length) throw new Error('--simular necesita al menos un slug')
      o.simular = [...new Set(slugs)]
    } else if (a === '--help' || a === '-h') o.ayuda = true
    else throw new Error(`Opción desconocida: ${a}`)
  }
  return o
}

// Lo que el registro decide sin la base: módulo conocido, con archivo de
// esquema escrito. Las dependencias se miran con las filas de la base.
export function validarSimulados(slugs, carpeta = CARPETA_ESQUEMA) {
  const errores = []
  const avisos = []
  for (const s of slugs) {
    const m = moduloPorSlug(s)
    if (!m) errores.push(`módulo desconocido: ${s}`)
    else if (s === NUCLEO) errores.push('el núcleo siempre está activo: no se simula')
    else if (m.sql && !existsSync(join(carpeta, m.sql))) errores.push(`falta supabase/esquema/${m.sql}: el módulo ${s} todavía no tiene su archivo`)
    else if (m.estado === 'planeado') {
      if (!m.sql) errores.push(`módulo planeado sin archivo de esquema: ${s}`)
      else avisos.push(`${s} está planeado: solo queda activo dentro del ensayo, que se deshace`)
    }
  }
  return { errores, avisos }
}

// Dependencias duras: activas en la base o antes en la lista de --simular
export function dependenciasFaltantes(slugs, activos) {
  const faltan = []
  slugs.forEach((s, i) => {
    for (const d of moduloPorSlug(s)?.depende ?? []) {
      if (d !== NUCLEO && !activos.includes(d) && !slugs.slice(0, i).includes(d)) faltan.push(`${s} depende de ${d}, que no está activo ni va antes en --simular`)
    }
  })
  return faltan
}

// Resultado de la simulación: el mensaje del error con que termina
export function leerResultado(error, url, log) {
  const mensaje = ocultarUrl(String(error?.message ?? error), url)
  const resumen = RESUMEN.exec(mensaje)
  if (!resumen) {
    log(`FALLA la simulación no llegó a su resultado: ${mensaje.split('\n')[0]}`)
    if (error?.where) log(`  ${String(error.where).split('\n')[0]}`)
    if (error?.position) log(`  posición ${error.position}`)
    return 1
  }
  const lineas = mensaje.split('\n')
  log(lineas[0])
  for (const l of lineas.slice(1)) if (/^(FALLA|OMITIDO)\b/.test(l)) log(l)
  if (Number(resumen[2]) > 0) return 1
  if (Number(resumen[3]) > 0) return 2
  return 0
}

// 1 manda sobre 2, y 2 sobre 0 (como resumirVerificacion de aplicar.mjs)
const peor = (a, b) => (a === 1 || b === 1 ? 1 : a === 2 || b === 2 ? 2 : 0)

export async function main(argv = process.argv.slice(2), opciones = {}) {
  const {
    env = process.env,
    log = console.log,
    error = console.error,
    carpeta = CARPETA_ESQUEMA,
    rutaSimulacion = RUTA_SIMULACION,
    crearCliente = crearClienteReal,
  } = opciones
  let o
  try {
    o = leerArgumentos(argv)
  } catch (e) {
    error(e.message)
    return 2
  }
  if (o.ayuda) {
    log('Uso: node --env-file=.env tools/instalar/ensayar.mjs [--simular <slug>[,<slug>…]]')
    return 0
  }
  let simulacion = null
  if (o.simular) {
    const v = validarSimulados(o.simular, carpeta)
    if (v.errores.length) {
      for (const e of v.errores) error(`OMITIDO ${e}`)
      return 2
    }
    for (const a of v.avisos) log(`AVISO ${a}`)
    try {
      simulacion = leerArchivo(rutaSimulacion)
    } catch (e) {
      error(`No se pudo leer la simulación: ${e.message}`)
      return 2
    }
  }
  const url = leerUrlBase(env)
  if (!url) {
    error(`Falta ${VARIABLE_URL} en el entorno`)
    return 2
  }

  let cliente
  let salida = 0
  try {
    cliente = await crearCliente(url)
    const filas = await cliente.consultar(CONSULTA_APLICADOS)
    const aplicados = new Map(filas.map((f) => [f.archivo, f.sha256]))
    const pendientes = []
    for (const nombre of listarArchivosEsquema(carpeta)) {
      const archivo = leerArchivo(join(carpeta, nombre))
      if (!aplicados.has(nombre)) pendientes.push(archivo)
      else if (aplicados.get(nombre) !== archivo.sha256) {
        log(`DIFIERE ${nombre} ya está aplicado y su contenido cambió: no se edita, va en un archivo nuevo`)
        salida = 1
      }
    }
    if (!pendientes.length) log('OK no hay archivos pendientes de aplicar')
    try {
      await cliente.transaccion(async (tx) => {
        for (const archivo of pendientes) {
          try {
            await tx.consultar(archivo.texto)
            log(`OK ${archivo.nombre} aplica`)
          } catch (e) {
            salida = 1
            log(`FALLA ${archivo.nombre}: ${ocultarUrl(String(e?.message ?? e), url)}`)
            if (e?.position) {
              const linea = archivo.texto.slice(0, Number(e.position)).split('\n').length
              log(`  cerca de la línea ${linea}`)
            }
            if (e?.where) log(`  ${String(e.where).split('\n')[0]}`)
            if (simulacion) log('OMITIDO la simulación no corre: un archivo pendiente no aplica')
            throw new Error(DESHACER)
          }
        }
        if (simulacion) {
          if ((await tx.consultar(CONSULTA_MFA)).length) {
            await tx.consultar(LLAMADA_MFA)
            log('OK aplicar_exigir_mfa() re-ejecutada dentro del ensayo')
          }
          const [{ existe } = {}] = await tx.consultar(CONSULTA_HAY_TABLA)
          if (!existe) {
            log('OMITIDO no existe public.modulos_instalacion: falta el núcleo')
            salida = peor(salida, 2)
            throw new Error(DESHACER)
          }
          const modulos = await tx.consultar(CONSULTA_FILAS)
          const faltan = dependenciasFaltantes(o.simular, modulos.filter((f) => f.activo).map((f) => f.slug))
          if (faltan.length) {
            for (const f of faltan) log(`OMITIDO ${f}`)
            salida = peor(salida, 2)
            throw new Error(DESHACER)
          }
          const conFila = new Set(modulos.map((f) => f.slug))
          for (const s of o.simular) {
            if (conFila.has(s)) await tx.consultar(ACTIVAR_MODULO, [s, '{}'])
            else await tx.consultar(INSERT_MODULO, [s, JSON.stringify(LIMITES_POR_DEFECTO[s] ?? {})])
            log(`OK ${s} activo dentro del ensayo`)
          }
          // Sin parámetros: postgres.js lo manda por el protocolo simple
          // (muchas sentencias y bloques do). Su begin es solo un aviso
          // dentro de esta transacción y su error final la deja abortada.
          let resultado = null
          try {
            await tx.consultar(simulacion.texto)
          } catch (e) {
            resultado = e
          }
          if (resultado) salida = peor(salida, leerResultado(resultado, url, log))
          else {
            log('FALLA la simulación terminó sin su error final: no hay resultado que mostrar')
            salida = 1
          }
        }
        throw new Error(DESHACER)
      })
    } catch (e) {
      if (e?.message !== DESHACER) throw e
    }
  } catch (e) {
    error(`No se pudo ensayar: ${ocultarUrl(String(e?.message ?? e), url ?? '')}`)
    salida = 2
  } finally {
    try {
      await cliente?.cerrar()
    } catch {
      // la conexión ya estaba cerrada
    }
  }
  return salida
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (esPrincipal) main().then((codigo) => process.exit(codigo))
