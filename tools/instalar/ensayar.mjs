// Ensaya contra la base de SUPABASE_DB_URL los archivos de supabase/esquema
// que todavía no están aplicados: los ejecuta en orden dentro de una
// transacción y la deshace siempre. Sirve para que un error de SQL (sintaxis,
// un nombre que no existe, una verificación final que aborta) salga antes del
// commit, sin dejar nada escrito ni registrar la huella del archivo.
//
//   node --env-file=.env tools/instalar/ensayar.mjs
//
// Pensado para una base de pruebas. La cadena de conexión nunca se imprime.
// Un archivo ya aplicado cuyo contenido cambió se avisa: no se puede editar
// (PP-DEC-02). Salidas: 0 todo aplica, 1 algún archivo falla o cambió, 2 no
// se pudo (falta la variable, no conecta).
import { join } from 'node:path'
import { CARPETA_ESQUEMA, ESQUEMA_INSTALADOR, VARIABLE_URL, crearCliente, leerArchivo, leerUrlBase, listarArchivosEsquema, ocultarUrl } from './comun.mjs'

const DESHACER = 'ensayo: se deshace todo'
const url = leerUrlBase()
if (!url) {
  console.error(`Falta ${VARIABLE_URL} en el entorno`)
  process.exit(2)
}
let cliente
let salida = 0
try {
  cliente = await crearCliente(url)
  const filas = await cliente.consultar(`select archivo, sha256 from ${ESQUEMA_INSTALADOR}.esquema_aplicado`)
  const aplicados = new Map(filas.map((f) => [f.archivo, f.sha256]))
  const pendientes = []
  for (const nombre of listarArchivosEsquema()) {
    const archivo = leerArchivo(join(CARPETA_ESQUEMA, nombre))
    if (!aplicados.has(nombre)) pendientes.push(archivo)
    else if (aplicados.get(nombre) !== archivo.sha256) {
      console.log(`DIFIERE ${nombre} ya está aplicado y su contenido cambió: no se edita, va en un archivo nuevo`)
      salida = 1
    }
  }
  if (!pendientes.length) console.log('OK no hay archivos pendientes de aplicar')
  try {
    await cliente.transaccion(async (tx) => {
      for (const archivo of pendientes) {
        try {
          await tx.consultar(archivo.texto)
          console.log(`OK ${archivo.nombre} aplica`)
        } catch (e) {
          salida = 1
          console.log(`FALLA ${archivo.nombre}: ${ocultarUrl(String(e?.message ?? e), url)}`)
          if (e?.position) {
            const linea = archivo.texto.slice(0, Number(e.position)).split('\n').length
            console.log(`  cerca de la línea ${linea}`)
          }
          if (e?.where) console.log(`  ${String(e.where).split('\n')[0]}`)
          throw new Error(DESHACER)
        }
      }
      throw new Error(DESHACER)
    })
  } catch (e) {
    if (e?.message !== DESHACER) throw e
  }
} catch (e) {
  console.error(`No se pudo ensayar: ${ocultarUrl(String(e?.message ?? e), url ?? '')}`)
  salida = 2
} finally {
  await cliente?.cerrar()
}
process.exit(salida)
