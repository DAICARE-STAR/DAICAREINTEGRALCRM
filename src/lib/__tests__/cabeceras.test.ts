import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Cabeceras unificadas (GUIA-UI.md, «Cabeceras»; ui.md, enmienda del
// 2026-11-07): icono, título, acciones como botones y pestañas debajo, sin
// línea de dato. Vigila que las reglas de la cabecera del shell usen solo
// tokens y que las páginas y apps adoptadas no conserven su cabecera vieja.
// Las listas crecen paso a paso, para que cada commit quede en verde.

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

// Mismo lector de reglas que contraste.test.ts: también encuentra las reglas
// de dentro de un @media, con su selector limpio
function reglas(css: string) {
  return [...sinComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((r) => ({
    selectores: r[1].split(',').map((s) => s.trim()),
    cuerpo: r[2],
  }))
}

const ESTILOS = leer('../../styles.css')
const REGLAS = reglas(ESTILOS)

// Selectores que declara styles.css (para comprobar ausencias)
const declara = (selector: string) => REGLAS.some((r) => r.selectores.includes(selector))

// Primitivas --pal-* que una regla puede usar directo (GUIA-UI, «Tokens de
// marca»): ninguna de color
const PRIMITIVA_PERMITIDA = /^--pal-(texto|esp|radio|dur|curva|fuente|peso|interlinea|tracking|foco)(-|$)/

function revisarReglas(rs: { selectores: string[]; cuerpo: string }[]) {
  for (const r of rs) {
    const sel = r.selectores.join(', ')
    for (const m of r.cuerpo.matchAll(/font-size\s*:\s*([^;]+)/g)) {
      expect(m[1].trim(), `${sel}: font-size`).toMatch(/^var\(--pal-texto-[a-z0-9]+\)$/)
    }
    expect(r.cuerpo, `${sel}: hex suelto`).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const m of r.cuerpo.matchAll(/var\(\s*(--pal-[a-z0-9-]+)/g)) {
      expect(m[1], `${sel}: primitiva de color`).toMatch(PRIMITIVA_PERMITIDA)
    }
    // Solo el filete de 1 px de los bordes; el resto, en tokens o rem
    for (const m of r.cuerpo.matchAll(/(\d*\.?\d+)px/g)) {
      expect(m[1], `${sel}: ${m[0]} fuera de la escala`).toBe('1')
    }
    // El color de un tinte siempre es un var(), así que la búsqueda del
    // porcentaje cruza sus paréntesis y solo se detiene en el «;»
    for (const m of r.cuerpo.matchAll(/color-mix\([^;]*?(\d+(?:\.\d+)?)%/g)) {
      expect(Number(m[1]), `${sel}: tinte al ${m[1]} %`).toBeLessThanOrEqual(10)
    }
  }
}

describe('revisión de reglas (revisarReglas)', () => {
  const regla = (cuerpo: string) => [{ selectores: ['.cabecera-prueba'], cuerpo }]

  it('rechaza un tinte de más del 10 % hecho con var()', () => {
    for (const cuerpo of [
      'background: color-mix(in srgb, var(--acento) 55%, var(--card));',
      'background: color-mix(in srgb, var(--accent) 30%, transparent)',
      'border-color: color-mix(in srgb, var(--acento) 10.5%, var(--card));',
    ]) {
      expect(() => revisarReglas(regla(cuerpo)), cuerpo).toThrow(/tinte al/)
    }
  })

  it('admite un tinte al 10 % o menos', () => {
    revisarReglas(regla('background: color-mix(in srgb, var(--acento) 10%, var(--card)); color: var(--text);'))
    revisarReglas(regla('background: color-mix(in srgb, var(--accent) 8%, transparent)'))
  })
})

describe('cabecera del shell (styles.css)', () => {
  const deCabecera = REGLAS.filter((r) => r.selectores.some((s) => s.includes('.cabecera')))

  it('declara las reglas de la cabecera', () => {
    for (const s of ['.cabecera', '.cabecera-fila', '.cabecera-icono', '.cabecera-sufijo', '.cabecera-acciones']) {
      expect(declara(s), s).toBe(true)
    }
  })

  it('usa solo tokens: tamaños de la escala, sin hex ni primitivas de color, tintes al 10 %', () => {
    expect(deCabecera.length).toBeGreaterThan(0)
    revisarReglas(deCabecera)
  })

  it('no tiene línea de dato bajo el título (decisión del usuario, 2026-11-07)', () => {
    expect(declara('.cabecera-dato')).toBe(false)
    expect(leer('../../components/CabeceraPagina.tsx')).not.toMatch(/\bdato\??\s*:/)
  })
})

// Cabecera fija del marco (decisión del usuario, 2026-11-07): una sola, en
// Layout, que no se desmonta al navegar y queda arriba con el scroll
describe('cabecera fija del marco (Layout)', () => {
  const marco = REGLAS.filter((r) => r.selectores.includes('.cabecera-marco'))
  const decl = (cuerpo: string, prop: string) =>
    new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(cuerpo)?.[1].trim()

  it('es sticky arriba, con el fondo y el filete de las barras', () => {
    const base = marco[0]
    expect(base, '.cabecera-marco').toBeDefined()
    expect(decl(base.cuerpo, 'position')).toBe('sticky')
    expect(decl(base.cuerpo, 'top')).toBe('0')
    expect(decl(base.cuerpo, 'background')).toBe('var(--bg-soft)')
    expect(decl(base.cuerpo, 'border-bottom')).toBe('1px solid var(--border)')
  })

  it('va bajo el topbar móvil (40) en la escala de capas', () => {
    const z = Number(decl(marco[0].cuerpo, 'z-index'))
    expect(z).toBeGreaterThan(30)
    expect(z).toBeLessThan(40)
  })

  it('a 760 px o menos se coloca debajo del topbar móvil', () => {
    expect(marco.some((r) => decl(r.cuerpo, 'top') === 'var(--alto-topbar-movil)')).toBe(true)
    const topbar = REGLAS.filter((r) => r.selectores.includes('.mobile-topbar'))
    expect(topbar.some((r) => decl(r.cuerpo, 'height') === 'var(--alto-topbar-movil)')).toBe(true)
  })

  it('en /chat (escritorio) .content no deja el respiro que desplazaría la página bajo la cabecera', () => {
    const sinRespiro = REGLAS.filter((r) => r.selectores.includes('.content:has(> .chat-page)'))
    expect(sinRespiro.some((r) => decl(r.cuerpo, 'padding-bottom') === '0')).toBe(true)
  })

  it('el menú de secciones de Administración se pega debajo de la cabecera, no bajo ella', () => {
    const menu = REGLAS.filter((r) => r.selectores.includes('.admin-menu'))
    const pegado = menu.filter((r) => decl(r.cuerpo, 'position') === 'sticky')
    expect(pegado.length).toBeGreaterThan(0)
    for (const r of pegado) expect(decl(r.cuerpo, 'top')).toMatch(/^calc\(var\(--alto-cabecera-marco\) \+ /)
  })

  it('el foco que el navegador lleva a la vista no queda bajo la cabecera ni el topbar (ui.md)', () => {
    const html = REGLAS.filter((r) => r.selectores.includes('html'))
    const relleno = html.map((r) => decl(r.cuerpo, 'scroll-padding-top')).find(Boolean)
    expect(relleno, 'html: scroll-padding-top').toBeDefined()
    expect(relleno).toContain('var(--alto-cabecera-marco)')
    expect(relleno).toContain('var(--alto-topbar-movil)')
    // html solo ve las variables declaradas en :root, no las de .shell
    const raiz = REGLAS.filter((r) => r.selectores.includes(':root'))
    for (const v of ['--alto-cabecera-marco', '--alto-topbar-movil']) {
      expect(raiz.some((r) => decl(r.cuerpo, v) !== undefined), v).toBe(true)
      const enShell = REGLAS.filter((r) => r.selectores.includes('.shell'))
      expect(enShell.some((r) => decl(r.cuerpo, v) !== undefined), `${v} en .shell`).toBe(false)
    }
  })

  it('Layout la pinta como primer hijo de main#contenido y CabeceraPagina la alimenta', () => {
    const layout = leer('../../components/Layout.tsx')
    expect(layout).toMatch(/<main className="content" id="contenido"[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<CabeceraMarco /)
    expect(layout).toContain('<CabeceraProvider>')
    const pagina = leer('../../components/CabeceraPagina.tsx')
    expect(pagina).toContain('useCabecera(')
    expect(declara('.cabecera-visor')).toBe(false)
  })
})

// Páginas del shell que ya pintan <CabeceraPagina> (src/pages/<Pagina>.tsx)
// (las de cada módulo se suman al llegar con su módulo)
const PAGINAS_ADOPTADAS: string[] = ['Dashboard', 'Team', 'Tools', 'Admin']

describe.each(PAGINAS_ADOPTADAS)('página %s', (pagina) => {
  const fuente = leer(`../../pages/${pagina}.tsx`)

  it('usa CabeceraPagina y no las cabeceras viejas', () => {
    expect(fuente).toContain('<CabeceraPagina')
    for (const vieja of ['cal-header', 'widgets-head', 'mail-head-actions']) {
      expect(fuente, vieja).not.toContain(vieja)
    }
  })
})

// Un solo h1 por ruta, el del marco: dentro del shell nadie pinta un <h1>
// suelto (Login y MfaGate quedan fuera de Layout)
describe('un solo h1 por ruta', () => {
  it.each(['../../App.tsx', '../../components/ProtectedRoute.tsx', ...PAGINAS_ADOPTADAS.map((p) => `../../pages/${p}.tsx`)])(
    '%s no pinta un <h1> propio',
    (ruta) => {
      expect(leer(ruta)).not.toMatch(/<h1[\s>]/)
    }
  )
})

describe('secciones de Administración (CabeceraAdmin)', () => {
  it('son la cabecera común en h2 y styles.css no conserva .admin-cabecera', () => {
    const fuente = leer('../../pages/admin/CabeceraAdmin.tsx')
    expect(fuente).toMatch(/<CabeceraPagina[^>]*nivel=\{2\}/)
    expect(fuente).not.toContain('admin-cabecera')
    for (const s of ['.admin-cabecera', '.admin-cabecera h2', '.admin-cabecera-lado', '.admin-cabecera-lado .form-check']) {
      expect(declara(s), s).toBe(false)
    }
  })
})

// La hoja cabecera.css de las apps estáticas y su adopción por app no viajan:
// en el producto todos los módulos son páginas React del shell.
