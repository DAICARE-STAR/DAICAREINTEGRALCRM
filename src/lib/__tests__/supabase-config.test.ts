import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Una variable de Supabase vacía cuenta como ausente. Con VITE_SUPABASE_URL=
// en el .env (así viene al copiar .env.example) el cliente lanzaba al crearse
// y caía todo lo que lo importa: visto en la primera instalación real (0.2.8).

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))

async function cargar(url: string, clave: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', clave)
  return import('../supabase')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('configuración del cliente de Supabase', () => {
  it('con las variables vacías el módulo carga y queda sin configurar', async () => {
    const m = await cargar('', '')
    expect(m.supabaseConfigured).toBe(false)
    expect(m.supabase).toBeDefined()
  })

  it('con solo espacios también cuenta como ausente', async () => {
    const m = await cargar('   ', ' ')
    expect(m.supabaseConfigured).toBe(false)
  })

  it('con las dos variables queda configurado', async () => {
    const m = await cargar('https://ejemplo.supabase.co', 'clave-publica-de-ejemplo')
    expect(m.supabaseConfigured).toBe(true)
  })

  it('las pruebas no leen el .env de quien instala', () => {
    expect(readFileSync(RAIZ + 'vitest.config.ts', 'utf8')).toMatch(/envDir:\s*false/)
  })
})
