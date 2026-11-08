import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MODULOS, NUCLEO } from '../modulos'

// El shell no consulta tablas de un módulo sin comprobar que está activo:
// en una instalación sin ese módulo la tabla no existe (cada consulta deja
// un error y un canal realtime con ella puede caer entero). Un archivo de
// src que hace .from('<tabla de módulo>') debe llamar a
// tieneModulo('<slug>') o puedeVerModulo('<slug>'); lo de
// src/modulos/<slug>/ ya se monta solo con su módulo. Se revisan las capas
// que se montan siempre (components, context, pages); src/lib solo define
// funciones y la comprobación es de quien las llama.

const SRC = fileURLToPath(new URL('../../', import.meta.url))

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n)
    if (statSync(ruta).isDirectory()) return n === '__tests__' ? [] : archivos(ruta)
    return /\.(ts|tsx|mts)$/.test(n) ? [ruta] : []
  })
}

const DUENO = new Map<string, string>()
for (const m of MODULOS) if (m.slug !== NUCLEO) for (const t of m.tablas) DUENO.set(t, m.slug)

describe('tablas de módulo en el shell', () => {
  it('cada consulta a una tabla de módulo comprueba su módulo', () => {
    const fallos: string[] = []
    for (const ruta of ['components', 'context', 'pages'].flatMap((d) => archivos(join(SRC, d)))) {
      const rel = relative(SRC, ruta).split(sep).join('/')
      const texto = readFileSync(ruta, 'utf8')
      for (const [, tabla] of texto.matchAll(/(?<!storage)\.from\(\s*'([a-z_]+)'/g)) {
        const slug = DUENO.get(tabla)
        if (!slug || rel.startsWith(`modulos/${slug}/`)) continue
        const comprueba = texto.includes(`tieneModulo('${slug}')`) || texto.includes(`puedeVerModulo('${slug}'`)
        if (!comprueba) fallos.push(`${rel}: ${tabla} (${slug})`)
      }
    }
    expect(fallos).toEqual([])
  })

  // El producto monta cada módulo en /<ruta>/* (N-3); /apps/<slug> cae en el 404
  it('ningún enlace del shell ni de las funciones apunta a /apps/<slug>', () => {
    const NETLIFY = fileURLToPath(new URL('../../../netlify/', import.meta.url))
    const fallos: string[] = []
    for (const ruta of [...['components', 'context', 'pages'].flatMap((d) => archivos(join(SRC, d))), ...archivos(NETLIFY)]) {
      const texto = readFileSync(ruta, 'utf8')
      if (/['`}]\/apps\/[a-z]/.test(texto)) fallos.push(relative(SRC, ruta))
    }
    expect(fallos).toEqual([])
  })

  it('member_status y tender_notifications son de chat y licitaciones', () => {
    expect(DUENO.get('member_status')).toBe('chat')
    expect(DUENO.get('tender_notifications')).toBe('licitaciones')
  })
})
