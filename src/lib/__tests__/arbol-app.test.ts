import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// useAvisos() lanza fuera de AvisosProvider: el árbol real de la app debe montarlo.
describe('árbol de la app', () => {
  it('main.tsx envuelve App en AvisosProvider', () => {
    const main = readFileSync(fileURLToPath(new URL('../../main.tsx', import.meta.url)), 'utf8')
    expect(main).toMatch(/<AvisosProvider>\s*<App \/>\s*<\/AvisosProvider>/)
  })
})
