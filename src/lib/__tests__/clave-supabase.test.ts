import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { esClaveSecreta } from '../clave-supabase'

// La variable VITE_SUPABASE_ANON_KEY viaja al navegador: una clave secreta
// pegada ahí por error no debe llegar al bundle (0.2.28).
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))
const jwt = (cuerpo: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(cuerpo)).replace(/=+$/, '')}.firma-de-relleno`

describe('clave de Supabase que viaja al navegador', () => {
  it('reconoce una clave secreta del formato nuevo y del antiguo', () => {
    expect(esClaveSecreta('sb_' + 'secret_' + 'relleno0000000000')).toBe(true)
    expect(esClaveSecreta('  sb_' + 'secret_' + 'relleno0000000000  ')).toBe(true)
    expect(esClaveSecreta(jwt({ role: 'service_role', ref: 'abc' }))).toBe(true)
  })

  it('deja pasar una clave pública, un valor vacío y cualquier otro texto', () => {
    expect(esClaveSecreta('sb_publishable_relleno0000000000')).toBe(false)
    expect(esClaveSecreta(jwt({ role: 'anon', ref: 'abc' }))).toBe(false)
    expect(esClaveSecreta('')).toBe(false)
    expect(esClaveSecreta(undefined)).toBe(false)
    expect(esClaveSecreta('eyJ.no-es-json.x')).toBe(false)
  })

  it('el build y el cliente la descartan', () => {
    const vite = readFileSync(RAIZ + 'vite.config.ts', 'utf8')
    expect(vite).toMatch(/esClaveSecreta\(env\.VITE_SUPABASE_ANON_KEY\)/)
    expect(vite).toMatch(/process\.env\.VITE_SUPABASE_ANON_KEY = ''/)
    expect(vite).toMatch(/'import\.meta\.env\.VITE_SUPABASE_ANON_KEY': '""'/)
    const cliente = readFileSync(RAIZ + 'src/lib/supabase.ts', 'utf8')
    expect(cliente).toMatch(/esClaveSecreta\(claveLeida\) \? undefined : claveLeida/)
  })
})
