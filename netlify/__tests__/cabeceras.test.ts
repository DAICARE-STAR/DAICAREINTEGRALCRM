import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contrato entre la configuración del hosting y el código (seguridad.md § CSP
// y cabeceras): netlify.toml trae las cabeceras base, los 404 forzados van
// antes del fallback SPA y el CSP del shell (vite.config.ts) no declara lo que
// en una <meta> no funciona.

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const TOML = leer('../../netlify.toml')
const VITE = leer('../../vite.config.ts')
const PAGINA_404 = leer('../../404.html')

type Bloque = { tipo: string; valores: Record<string, string> }

// Lector mínimo de netlify.toml: tablas [[headers]] y [[redirects]] con sus
// pares clave = valor (incluida la subtabla [headers.values]).
function bloques(toml: string): Bloque[] {
  const salida: Bloque[] = []
  let actual: Bloque | null = null
  for (const cruda of toml.split(/\r?\n/)) {
    const linea = cruda.replace(/^\s*#.*$/, '').trim()
    if (!linea) continue
    const tabla = /^\[\[(\w+)\]\]$/.exec(linea)
    if (tabla) {
      actual = { tipo: tabla[1], valores: {} }
      salida.push(actual)
      continue
    }
    if (/^\[[\w.]+\]$/.test(linea)) {
      if (linea !== '[headers.values]') actual = null
      continue
    }
    const kv = /^([\w-]+)\s*=\s*(.+?)\s*(?:#.*)?$/.exec(linea)
    if (kv && actual) actual.valores[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1')
  }
  return salida
}

const TODOS = bloques(TOML)
const REDIRECTS = TODOS.filter((b) => b.tipo === 'redirects')
const HEADERS = TODOS.filter((b) => b.tipo === 'headers')

const RUTAS_INTERNAS = [
  '/netlify/*', '/supabase/*', '/tools/*', '/docs/*', '/src/*', '/.github/*', '/.claude/*',
  '/README.md', '/AGENTS.md', '/CLAUDE.md', '/HANDOFF.md', '/CHANGELOG.md',
  '/package.json', '/package-lock.json', '/netlify.toml', '/vite.config.ts', '/vitest.config.ts',
  '/tsconfig.json', '/tsconfig.netlify.json', '/.env', '/.env.example',
]

describe('cabeceras de netlify.toml', () => {
  it('el bloque /* trae exactamente las cabeceras base', () => {
    const global = HEADERS.filter((h) => h.valores.for === '/*')
    expect(global).toHaveLength(1)
    const { for: _ruta, ...valores } = global[0].valores
    expect(valores).toEqual({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "frame-ancestors 'self'",
    })
  })

  it('no hay otro bloque de cabeceras: el CSP completo viaja en la <meta> del shell', () => {
    expect(HEADERS).toHaveLength(1)
  })
})

describe('redirects de netlify.toml', () => {
  const indiceFallback = REDIRECTS.findIndex((r) => r.valores.from === '/*')
  const indiceApi = REDIRECTS.findIndex((r) => r.valores.from === '/api/*')

  it('el fallback SPA existe y es el último', () => {
    expect(indiceFallback).toBe(REDIRECTS.length - 1)
    expect(REDIRECTS[indiceFallback].valores).toMatchObject({ to: '/index.html', status: '200' })
  })

  it('/api/* va a las funciones antes que todo lo demás', () => {
    expect(indiceApi).toBe(0)
    expect(REDIRECTS[0].valores).toMatchObject({ to: '/.netlify/functions/:splat', status: '200' })
  })

  it.each(RUTAS_INTERNAS)('%s responde 404 forzado antes del fallback', (ruta) => {
    const i = REDIRECTS.findIndex((r) => r.valores.from === ruta)
    expect(i, `${ruta} sin regla`).toBeGreaterThan(indiceApi)
    expect(i).toBeLessThan(indiceFallback)
    expect(REDIRECTS[i].valores).toMatchObject({ to: '/404.html', status: '404', force: 'true' })
  })

  it('toda regla 404 apunta a /404.html y está en la lista', () => {
    for (const r of REDIRECTS.filter((x) => x.valores.status === '404')) {
      expect(r.valores.to).toBe('/404.html')
      expect(RUTAS_INTERNAS).toContain(r.valores.from)
    }
  })
})

describe('404.html', () => {
  it('es estática, sin scripts y con noindex', () => {
    expect(PAGINA_404).not.toMatch(/<script/i)
    expect(PAGINA_404).toMatch(/<meta name="robots" content="noindex/)
    expect(PAGINA_404).toMatch(/<a href="\/"/)
  })

  it('vite.config.ts la construye como entrada propia', () => {
    expect(VITE).toMatch(/404: '404\.html'/)
  })
})

describe('CSP del shell (vite.config.ts)', () => {
  it('no declara frame-ancestors (en una <meta> no funciona: va en netlify.toml)', () => {
    const codigo = VITE.replace(/^\s*\/\/.*$/gm, '')
    expect(codigo).not.toMatch(/frame-ancestors/)
  })

  it('img-src y font-src usan el origen exacto de Supabase, sin https: suelto', () => {
    expect(VITE).toMatch(/img-src 'self' data: blob: \$\{https\}/)
    expect(VITE).toMatch(/font-src 'self' data: \$\{https\}/)
    expect(VITE).not.toMatch(/img-src 'self' data: https:/)
  })

  it('script-src solo self y sin unsafe-inline; object-src none', () => {
    expect(VITE).toMatch(/"script-src 'self'"/)
    expect(VITE).toMatch(/"object-src 'none'"/)
  })
})
