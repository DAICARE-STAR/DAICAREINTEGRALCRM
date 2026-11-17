// Corre supabase/pruebas/rls-simulacion.sql contra la base de SUPABASE_DB_URL y
// muestra su resultado, que es el mensaje del error con el que termina a
// propósito (todo va en BEGIN … ROLLBACK: no deja rastro). Es lo mismo que
// pegar el archivo en el SQL Editor, desde una terminal.
//
//   node --env-file=.env tools/instalar/simular.mjs
//
// Pensado para una base de pruebas. La cadena de conexión nunca se imprime.
// Salidas: 0 todo OK, 1 hay FALLA o un error que no es el resultado, 2 no se
// pudo (falta la variable, no conecta, hay OMITIDO).
import { join } from 'node:path'
import { RAIZ, VARIABLE_URL, leerArchivo, leerUrlBase, ocultarUrl, opcionSsl } from './comun.mjs'

const url = leerUrlBase()
if (!url) {
  console.error(`Falta ${VARIABLE_URL} en el entorno`)
  process.exit(2)
}
const { texto } = leerArchivo(join(RAIZ, 'supabase', 'pruebas', 'rls-simulacion.sql'))
const { default: postgres } = await import('postgres')
const sql = postgres(url, { max: 1, prepare: false, ssl: opcionSsl(url), onnotice: () => {} })
let salida = 2
try {
  // Protocolo simple: el archivo trae muchas sentencias y bloques do.
  await sql.unsafe(texto).simple()
  console.error('La simulación terminó sin su error final: no hay resultado que mostrar')
} catch (e) {
  const mensaje = ocultarUrl(String(e?.message ?? e), url)
  console.log(mensaje)
  const resumen = /(\d+) OK · (\d+) FALLA · (\d+) OMITIDO/.exec(mensaje)
  if (!resumen) {
    if (e?.where) console.log(String(e.where).split('\n')[0])
    if (e?.position) console.log(`posición ${e.position}`)
    salida = 1
  } else if (Number(resumen[2]) > 0) salida = 1
  else if (Number(resumen[3]) > 0) salida = 2
  else salida = 0
} finally {
  await sql.end({ timeout: 5 })
}
process.exit(salida)
