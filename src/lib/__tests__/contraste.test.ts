import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PARES, SUPERFICIES, TEMAS_PORTAL, contraste, primitivasDe, resolver, semanticosDe, sinComentarios, validarPaleta } from '../contraste'

// Tokens del producto (src/estilos/paleta.css y temas.css): los tres temas
// cumplen 4,5:1 en texto y 3:1 en bordes, iconos y botón, sin excepciones
// (PP-DEC-09). Los color-mix del skeleton no se evalúan.

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const PALETA = leer('../../estilos/paleta.css')
const TEMAS = leer('../../estilos/temas.css')
const primitivas = primitivasDe(PALETA)

describe('paleta.css', () => {
  it('es un único bloque :root solo con propiedades --pal-*', () => {
    const css = sinComentarios(PALETA).trim()
    expect(css).toMatch(/^:root\s*\{[^{}]*\}$/)
    const decls = css.replace(/^:root\s*\{/, '').replace(/\}$/, '').split(';').map((d) => d.trim()).filter(Boolean)
    expect(decls.length).toBeGreaterThan(0)
    for (const d of decls) expect(d).toMatch(/^--pal-[a-z0-9-]+\s*:\s*\S/)
  })

  it('los colores son hex de seis cifras y la fuente por defecto es Roboto', () => {
    for (const [k, v] of primitivas) {
      if (v.startsWith('#')) expect(v, k).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
    expect(primitivas.get('--pal-fuente-cuerpo')).toMatch(/^'Roboto'/)
    expect(primitivas.get('--pal-fuente-display')).toMatch(/^'Roboto'/)
    expect(PALETA).not.toMatch(/Jost/)
  })

  it('temas.css solo usa primitivas que existen e importa paleta.css primero', () => {
    const usadas = [...sinComentarios(TEMAS).matchAll(/var\(\s*(--pal-[a-z0-9-]+)/g)].map((m) => m[1])
    expect(usadas.length).toBeGreaterThan(0)
    for (const n of new Set(usadas)) expect(primitivas.has(n), n).toBe(true)
    expect(sinComentarios(TEMAS).trim()).toMatch(/^@import url\('paleta\.css'\);/)
  })

  it('no queda ningún token de la marca de origen', () => {
    expect(PALETA + TEMAS).not.toMatch(/--ld-|--gold|marfil|hueso|enfasis/)
  })
})

describe.each(TEMAS_PORTAL)('tema %s', (nombre) => {
  const tema = semanticosDe(TEMAS, nombre)

  it.each(PARES)('%s sobre %j llega al mínimo', (texto, fondos, minimo) => {
    const t = tema.get(texto)
    expect(t, `${texto} sin definir`).toBeDefined()
    const colorTexto = resolver(t ?? '', tema, primitivas)
    expect(colorTexto, `${texto} no resuelve a un hex`).not.toBeNull()
    for (const f of fondos) {
      const colorFondo = resolver(tema.get(f) ?? '', tema, primitivas)
      expect(colorFondo, `${f} no resuelve a un hex`).not.toBeNull()
      const r = contraste(colorTexto ?? '', colorFondo ?? '')
      expect(r, `${texto} ${colorTexto} sobre ${f} ${colorFondo}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimo)
    }
  })

  it('validarPaleta da ok con las primitivas de la hoja', () => {
    expect(validarPaleta(primitivas, tema)).toEqual({ ok: true, fallas: [] })
  })

  it('define todos los semánticos que usan el shell', () => {
    const nombres = [
      ...SUPERFICIES, '--bg1', '--line', '--line-control', '--txt', '--txt-strong', '--muted',
      '--acento', '--acento-lite', '--acento-contraste', '--acento-grafico', '--btn-bg', '--btn-txt', '--btn-bg-hover',
      '--focus', '--ok', '--warn', '--danger', '--blue', '--input-bg', '--input-ph',
      '--skel', '--skel-shine', '--shadow-1', '--shadow-2', '--shadow-3', '--shadow-up', '--overlay',
    ]
    for (const n of nombres) expect(tema.has(n), n).toBe(true)
  })
})

describe('fórmula y validación', () => {
  it('reproduce los valores de referencia de WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contraste('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it('validarPaleta detecta una primitiva redefinida que rompe el contraste', () => {
    const tema = semanticosDe(TEMAS, 'claro')
    const rotas = new Map(primitivas)
    rotas.set('--pal-base-700', '#CCCCCC')
    const r = validarPaleta(rotas, tema)
    expect(r.ok).toBe(false)
    expect(r.fallas.some((f) => f.texto === '--txt' && f.fondo === '--bg' && (f.ratio ?? 9) < 4.5)).toBe(true)
  })

  it('validarPaleta marca como falla un token que no resuelve', () => {
    const tema = semanticosDe(TEMAS, 'claro')
    const sinFondo = new Map(tema)
    sinFondo.set('--bg', 'var(--no-existe)')
    const r = validarPaleta(primitivas, sinFondo)
    expect(r.ok).toBe(false)
    expect(r.fallas[0].motivo).toMatch(/--bg no resuelve/)
  })
})
