// Valida la paleta de una instalación fuera del navegador, con la misma
// función que Administración → Instalación (validarTemas de
// src/lib/contraste.ts). Solo lectura.
//
//   node tools/tema/verificar.mjs <tema.json>
//
// tema.json: { "--pal-…": "#rrggbb", … }, el mismo objeto de instalacion.tema.
// Salidas: 0 todos los pares cumplen; 1 algún par falla; 2 no se pudo
// comprobar (falta el archivo, no es JSON o tiene claves o valores no válidos).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describirFalla, primitivasDeColor, primitivasValidas, validarTemas } from '../../src/lib/contraste.ts'

const leer = (ruta) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')

export function main(args) {
  const ruta = args[0]
  if (!ruta) {
    console.log('OMITIDO uso: node tools/tema/verificar.mjs <tema.json>')
    return 2
  }
  let tema
  try {
    tema = JSON.parse(readFileSync(ruta, 'utf8'))
  } catch {
    console.log(`OMITIDO no se pudo leer ${ruta} como JSON`)
    return 2
  }
  const paleta = leer('../../src/estilos/paleta.css')
  if (!primitivasValidas(tema, primitivasDeColor(paleta))) {
    console.log('OMITIDO el tema solo admite primitivas de color de paleta.css con valores #rrggbb')
    return 2
  }
  const { ok, fallas } = validarTemas(tema, paleta, leer('../../src/estilos/temas.css'))
  for (const f of fallas) console.log(`DIFIERE ${describirFalla(f)}`)
  if (ok) console.log('OK todos los pares cumplen en los tres temas')
  return ok ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2))
