// Contraste WCAG 2.x en código puro: fórmula, lectura de los tokens de
// src/estilos y la lista de pares que deben cumplir. La usan la prueba
// (contraste.test.ts), la pantalla de tema por instalación (no deja guardar
// una paleta que falle) y tools/tema. Sin DOM ni red.

export type Tema = 'claro' | 'calido' | 'oscuro'
export const TEMAS_PORTAL: readonly Tema[] = ['claro', 'calido', 'oscuro']

export const SUPERFICIES = ['--bg', '--bg2', '--card', '--card2'] as const

// [texto o elemento, fondos, mínimo]. 4,5:1 para texto (1.4.3) y 3:1 para
// componentes no textuales (1.4.11). Sin excepciones.
export const PARES: readonly [string, readonly string[], number][] = [
  ['--txt', SUPERFICIES, 4.5],
  ['--txt-strong', SUPERFICIES, 4.5],
  ['--muted', SUPERFICIES, 4.5],
  ['--acento', SUPERFICIES, 4.5],
  ['--acento-lite', SUPERFICIES, 4.5],
  ['--ok', ['--bg', '--card', '--bg2'], 4.5],
  ['--warn', ['--bg', '--card', '--bg2'], 4.5],
  ['--danger', ['--bg', '--card', '--bg2'], 4.5],
  ['--blue', ['--bg', '--card', '--bg2'], 4.5],
  ['--input-ph', ['--input-bg'], 4.5],
  ['--btn-txt', ['--btn-bg', '--btn-bg-hover'], 4.5],
  ['--acento-contraste', ['--acento'], 4.5],
  ['--line-control', ['--card', '--input-bg', '--bg'], 3],
  ['--focus', ['--bg', '--bg2', '--card'], 3],
  ['--acento-grafico', ['--bg', '--card'], 3],
]

export const HEX = /^#[0-9a-f]{6}$/i

export function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

export const sinComentarios = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

export function declaraciones(cuerpo: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const d of cuerpo.split(';')) {
    const i = d.indexOf(':')
    if (i < 0) continue
    const nombre = d.slice(0, i).trim()
    if (nombre.startsWith('--')) m.set(nombre, d.slice(i + 1).trim())
  }
  return m
}

// Primitivas de paleta.css: su único bloque :root
export function primitivasDe(css: string): Map<string, string> {
  const b = /:root\s*\{([^{}]*)\}/.exec(sinComentarios(css))
  return b ? declaraciones(b[1]) : new Map()
}

// Declaraciones efectivas por tema, como las resuelve el navegador: el bloque
// de :root vale para todos y el de :root[data-theme='x'] lo pisa.
export function semanticosDe(css: string, tema: string): Map<string, string> {
  const limpio = sinComentarios(css).replace(/@import[^;]*;/g, '')
  const base = new Map<string, string>()
  const propio = new Map<string, string>()
  for (const r of limpio.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectores = r[1].split(',').map((s) => s.trim().replace(/"/g, "'"))
    if (selectores.some((s) => s.startsWith('@'))) continue
    const decl = declaraciones(r[2])
    const destino = selectores.includes(`:root[data-theme='${tema}']`) ? propio : selectores.includes(':root') ? base : null
    if (destino) decl.forEach((v, k) => destino.set(k, v))
  }
  return new Map([...base, ...propio])
}

// Sigue var(--x) hasta un hex; null si no resuelve (color-mix, ciclo, falta)
export function resolver(valor: string, tema: ReadonlyMap<string, string>, primitivas: ReadonlyMap<string, string>, visto: string[] = []): string | null {
  const v = valor.trim()
  if (HEX.test(v)) return v.toLowerCase()
  const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v)
  if (!ref || visto.includes(ref[1])) return null
  const siguiente = tema.get(ref[1]) ?? primitivas.get(ref[1])
  return siguiente === undefined ? null : resolver(siguiente, tema, primitivas, [...visto, ref[1]])
}

export type Falla = { texto: string; fondo: string; ratio: number | null; minimo: number; motivo?: string }

// Evalúa todos los pares de un tema con unas primitivas (las de la hoja o las
// redefinidas por la instalación). ok solo si ningún par falla ni queda sin resolver.
export function validarPaleta(primitivas: ReadonlyMap<string, string>, tema: ReadonlyMap<string, string>): { ok: boolean; fallas: Falla[] } {
  const fallas: Falla[] = []
  for (const [texto, fondos, minimo] of PARES) {
    const colorTexto = resolver(tema.get(texto) ?? '', tema, primitivas)
    for (const fondo of fondos) {
      const colorFondo = resolver(tema.get(fondo) ?? '', tema, primitivas)
      if (!colorTexto || !colorFondo) {
        fallas.push({ texto, fondo, ratio: null, minimo, motivo: `${!colorTexto ? texto : fondo} no resuelve a un hex` })
        continue
      }
      const ratio = contraste(colorTexto, colorFondo)
      if (ratio < minimo) fallas.push({ texto, fondo, ratio, minimo })
    }
  }
  return { ok: fallas.length === 0, fallas }
}

// Primitivas redefinidas por una instalación: solo claves de la lista y hex en
// minúsculas, como tema_valido de la base (04), que rechaza '#FFFFFF'.
const HEX_BASE = /^#[0-9a-f]{6}$/
export function primitivasValidas(valores: unknown, permitidas: readonly string[]): valores is Record<string, string> {
  if (!valores || typeof valores !== 'object' || Array.isArray(valores)) return false
  return Object.entries(valores as Record<string, unknown>).every(([k, v]) => permitidas.includes(k) && typeof v === 'string' && HEX_BASE.test(v))
}

export type FallaTema = Falla & { tema: Tema }

// Paleta de una instalación (primitivas redefinidas sobre las de paleta.css)
// evaluada en los tres temas de temas.css. La usan Administración →
// Instalación y tools/tema/verificar.mjs: la misma función en los dos lados.
export function validarTemas(propias: Readonly<Record<string, string>>, paletaCss: string, temasCss: string): { ok: boolean; fallas: FallaTema[] } {
  const primitivas = new Map(primitivasDe(paletaCss))
  for (const [k, v] of Object.entries(propias)) primitivas.set(k, v.toLowerCase())
  const fallas = TEMAS_PORTAL.flatMap((tema) => validarPaleta(primitivas, semanticosDe(temasCss, tema)).fallas.map((f) => ({ ...f, tema })))
  return { ok: fallas.length === 0, fallas }
}

// «tema oscuro: --muted sobre --card 3,90:1 (mínimo 4,5:1)»
export function describirFalla(f: FallaTema): string {
  const medida = f.ratio === null ? (f.motivo ?? 'sin resolver') : `${f.ratio.toFixed(2).replace('.', ',')}:1`
  return `tema ${f.tema}: ${f.texto} sobre ${f.fondo} ${medida} (mínimo ${String(f.minimo).replace('.', ',')}:1)`
}

// Primitivas de color de la hoja: las únicas que una instalación redefine
export const primitivasDeColor = (paletaCss: string): string[] => [...primitivasDe(paletaCss)].filter(([, v]) => HEX.test(v)).map(([k]) => k)
