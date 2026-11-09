import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generar } from '../../../tools/producto/documentar-modulos.mjs'

// N-9: la documentación sigue al código. docs/modulos.md es el del registro;
// el README nombra cada variable de .env.example; ningún documento lleva
// correos ni IP; los datos de demostración no traen DDL.

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))
const leer = (r: string) => readFileSync(RAIZ + r, 'utf8').replace(/\r\n/g, '\n')

function documentos(): string[] {
  const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'], {
    cwd: RAIZ,
    encoding: 'utf8',
  })
  return salida.split('\0').filter((r) => r && !r.startsWith('node_modules/'))
}

describe('documentación', () => {
  it('docs/modulos.md coincide con el registro', () => {
    expect(leer('docs/modulos.md')).toBe(generar())
  })

  it('el README nombra toda variable de .env.example', () => {
    const variables = [...leer('.env.example').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1])
    const readme = leer('README.md')
    expect(variables.length).toBeGreaterThan(10)
    expect(variables.filter((v) => !readme.includes(`\`${v}\``))).toEqual([])
  })

  it('ningún documento lleva correos ni direcciones IP', () => {
    const correo = /[\w.+-]+@[\w-]+\.[\w.]+/
    const ip = /\b(?:\d{1,3}\.){3}\d{1,3}\b/
    const hallazgos = documentos().filter((r) => {
      const t = leer(r)
      return correo.test(t) || ip.test(t)
    })
    expect(hallazgos).toEqual([])
  })

  it('demo-*.sql solo trae datos', () => {
    const t = leer('supabase/esquema/datos/demo-nucleo.sql').replace(/--.*$/gm, '')
    expect(t).not.toMatch(/\b(create|alter|drop|grant|revoke|truncate)\b/i)
  })
})
