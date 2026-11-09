// Genera docs/modulos.md desde el registro src/lib/modulos.ts (la fuente
// única, PP-DEC-04). Solo lectura del registro; escribe un archivo.
//
//   node tools/producto/documentar-modulos.mjs           reescribe docs/modulos.md
//   node tools/producto/documentar-modulos.mjs --check   compara sin escribir
//
// Salidas: 0 al día (o escrito), 1 difiere, 2 opción mala o no se pudo leer.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODULOS } from '../../src/lib/modulos.ts'

export const RUTA_DOC = fileURLToPath(new URL('../../docs/modulos.md', import.meta.url))

const lista = (xs) => (xs.length ? xs.join(', ') : '—')

export function generar(modulos = MODULOS) {
  const filas = modulos.map((m) =>
    [
      m.slug,
      m.nombre,
      m.estado,
      m.ruta ?? '—',
      lista(m.depende),
      lista(m.conectores),
      lista(Object.keys(m.limites)),
      lista(m.permisos.map((p) => p.clave)),
      m.sql ?? '—',
    ].join(' | ')
  )
  return [
    '# Módulos del producto',
    '',
    'Generado por `tools/producto/documentar-modulos.mjs` desde `src/lib/modulos.ts`. No se edita a mano: se cambia el registro y se vuelve a generar (`--check` comprueba que está al día).',
    '',
    '| Slug | Nombre | Estado | Ruta | Depende de | Conectores | Límites | Permisos | Esquema |',
    '|---|---|---|---|---|---|---|---|---|',
    ...filas.map((f) => `| ${f} |`),
    '',
  ].join('\n')
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  if (argv.some((a) => a !== '--check')) {
    console.error('Uso: node tools/producto/documentar-modulos.mjs [--check]')
    return 2
  }
  const esperado = generar()
  if (!check) {
    writeFileSync(RUTA_DOC, esperado, 'utf8')
    console.log('OK docs/modulos.md escrito')
    return 0
  }
  if (!existsSync(RUTA_DOC)) {
    console.log('OMITIDO falta docs/modulos.md')
    return 2
  }
  const actual = readFileSync(RUTA_DOC, 'utf8').replace(/\r\n/g, '\n')
  if (actual === esperado) {
    console.log('OK docs/modulos.md al día con el registro')
    return 0
  }
  console.log('DIFIERE docs/modulos.md: correr sin --check')
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
