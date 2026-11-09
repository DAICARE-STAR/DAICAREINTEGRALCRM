import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Lista permitida de usos de storage en src (N-2; patrón de la prueba de la
// 84 reescrita en la 89 de team-portal). Todo pasa por uploadSiteImage de
// data.ts, que solo sube y pide la URL pública (sin list ni remove: los
// buckets no tienen SELECT). Cada función que la llama nombra su bucket; un
// bucket de módulo solo se usa desde src/modulos/<slug>/.

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const STORAGE_SQL = fileURLToPath(new URL('../../../supabase/esquema/09-storage-base.sql', import.meta.url))

// bucket -> { dueño, funciones de data.ts que suben a él }
const PERMITIDOS: Record<string, { modulo: string; funciones: string[] }> = {
  avatares: { modulo: 'nucleo', funciones: ['uploadAvatar'] },
  marca: { modulo: 'nucleo', funciones: ['uploadLogoInstalacion'] },
  blog: { modulo: 'sitio-web', funciones: ['uploadBlogImage', 'uploadBrandLogo', 'uploadProjectImage'] },
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n)
    if (statSync(ruta).isDirectory()) return n === '__tests__' ? [] : archivos(ruta)
    return /\.(ts|tsx)$/.test(n) ? [ruta] : []
  })
}

const fuentes = archivos(SRC).map((ruta) => ({ rel: relative(SRC, ruta).split(sep).join('/'), texto: readFileSync(ruta, 'utf8') }))
const data = fuentes.find((f) => f.rel === 'lib/data.ts')!.texto

describe('usos de storage en src', () => {
  it('solo data.ts toca storage, y solo con upload y getPublicUrl', () => {
    const usos = fuentes.flatMap((f) => [...f.texto.matchAll(/\.storage\s*\.from\(([^)]*)\)\s*\.(\w+)/g)].map((m) => `${f.rel}: ${m[1]}.${m[2]}`))
    expect(usos.sort()).toEqual(['lib/data.ts: bucket.getPublicUrl', 'lib/data.ts: bucket.upload'])
  })

  it('cada llamada a uploadSiteImage nombra un bucket permitido desde su función', () => {
    const llamadas = [...data.matchAll(/export function (\w+)\([^)]*\)[^{]*\{\s*return uploadSiteImage\(([^\n]*)\)\s*\n\}/g)].map((m) => {
      const bucket = /'([a-z-]+)'\s*$/.exec(m[2])?.[1] ?? '(sin bucket)'
      return [m[1], bucket]
    })
    const total = [...data.matchAll(/uploadSiteImage\(/g)].length - 1 // menos la definición
    expect(llamadas.length).toBe(total)
    const esperado = Object.entries(PERMITIDOS).flatMap(([b, p]) => p.funciones.map((f) => [f, b]))
    expect(llamadas.sort()).toEqual(esperado.sort())
  })

  it('los buckets del núcleo los crea 09-storage-base.sql y los de módulo no', () => {
    const sql = readFileSync(STORAGE_SQL, 'utf8')
    for (const [bucket, p] of Object.entries(PERMITIDOS)) {
      expect(sql.includes(`('${bucket}', '${bucket}'`), bucket).toBe(p.modulo === 'nucleo')
    }
  })

  it('las funciones de un bucket de módulo solo se llaman desde ese módulo', () => {
    const fallos: string[] = []
    for (const p of Object.values(PERMITIDOS)) {
      if (p.modulo === 'nucleo') continue
      for (const fn of p.funciones) {
        for (const f of fuentes) {
          if (f.rel === 'lib/data.ts' || f.rel.startsWith(`modulos/${p.modulo}/`)) continue
          if (new RegExp(`\b${fn}\b`).test(f.texto)) fallos.push(`${f.rel}: ${fn}`)
        }
      }
    }
    expect(fallos).toEqual([])
  })
})
