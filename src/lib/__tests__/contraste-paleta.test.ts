import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { describirFalla, primitivasDeColor, validarTemas } from '../contraste'

// Paleta de una instalación evaluada en los tres temas (N-5) y la misma
// comprobación fuera del navegador con tools/tema/verificar.mjs.

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const PALETA = leer('../../estilos/paleta.css')
const TEMAS = leer('../../estilos/temas.css')
const SCRIPT = fileURLToPath(new URL('../../../tools/tema/verificar.mjs', import.meta.url))

// --pal-base-300 es el texto atenuado del tema oscuro: oscurecerlo rompe ese tema
const MALA = { '--pal-base-300': '#55524c' }

function correr(contenido: string | null) {
  const dir = mkdtempSync(join(tmpdir(), 'tema-'))
  const ruta = join(dir, 'tema.json')
  if (contenido !== null) writeFileSync(ruta, contenido)
  return spawnSync(process.execPath, [SCRIPT, ruta], { encoding: 'utf8' })
}

describe('validarTemas', () => {
  it('la paleta neutra pasa en los tres temas', () => {
    expect(validarTemas({}, PALETA, TEMAS)).toEqual({ ok: true, fallas: [] })
  })

  it('una paleta que falla en el tema oscuro se rechaza con el par exacto', () => {
    const r = validarTemas(MALA, PALETA, TEMAS)
    expect(r.ok).toBe(false)
    expect(new Set(r.fallas.map((f) => f.tema))).toEqual(new Set(['oscuro']))
    const muted = r.fallas.find((f) => f.texto === '--muted' && f.fondo === '--bg')
    expect(muted).toBeDefined()
    expect(describirFalla(muted!)).toMatch(/^tema oscuro: --muted sobre --bg \d+,\d\d:1 \(mínimo 4,5:1\)$/)
  })

  it('las primitivas editables son las de color de la hoja', () => {
    const lista = primitivasDeColor(PALETA)
    expect(lista).toContain('--pal-base-300')
    expect(lista).not.toContain('--pal-fuente-cuerpo')
  })
})

describe('tools/tema/verificar.mjs', () => {
  it('sale 0 con la neutra y 1 con la que falla', () => {
    const ok = correr('{}')
    expect(ok.status, ok.stdout + ok.stderr).toBe(0)
    expect(ok.stdout).toMatch(/^OK /m)
    const mala = correr(JSON.stringify(MALA))
    expect(mala.status).toBe(1)
    expect(mala.stdout).toMatch(/^DIFIERE tema oscuro: --muted sobre --bg/m)
  })

  it('sale 2 sin archivo, con JSON roto o con claves ajenas', () => {
    expect(correr(null).status).toBe(2)
    expect(correr('{no').status).toBe(2)
    expect(correr('{"--bg":"#ffffff"}').status).toBe(2)
    expect(correr('{"--pal-base-300":"red"}').status).toBe(2)
  })
})
