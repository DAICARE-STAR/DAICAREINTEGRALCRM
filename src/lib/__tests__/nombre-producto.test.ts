import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NOMBRE_PORTAL_POR_DEFECTO } from '../instalacion'

// El nombre del producto es Bash Logistics (PP-DEC-27). Cada instalación pone el
// suyo en VITE_PORTAL_NOMBRE; sin él, el nombre visible es el del producto.
// Ningún archivo del shell, las funciones o public/ vuelve al nombre
// provisional de la 0.1.

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))
const PROVISIONAL = new RegExp('Portal ' + 'del equipo')

function fuentes(): string[] {
  const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'src', 'netlify', 'public', 'vite.config.ts', 'index.html'], {
    cwd: RAIZ,
    encoding: 'utf8',
  })
  return salida
    .split('\0')
    .filter((f) => /\.(ts|tsx|mts|js|mjs|html)$/.test(f))
    .filter((f) => !/__tests__\//.test(f))
}

describe('nombre del producto', () => {
  it('el nombre visible por defecto es Bash Logistics', () => {
    expect(NOMBRE_PORTAL_POR_DEFECTO).toBe('Bash Logistics')
    expect(readFileSync(RAIZ + 'vite.config.ts', 'utf8')).toMatch(/NOMBRE_POR_DEFECTO = 'Bash Logistics'/)
  })

  it('ningún archivo fuente usa el nombre provisional', () => {
    const conProvisional = fuentes().filter((f) => PROVISIONAL.test(readFileSync(RAIZ + f, 'utf8')))
    expect(conProvisional).toEqual([])
  })
})
