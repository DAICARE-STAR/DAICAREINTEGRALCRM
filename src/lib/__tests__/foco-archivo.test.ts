import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Subida de logos: el input .sr-only recorta su propio anillo de foco, así que
// lo lleva el label con aspecto de botón (WCAG 2.4.7).
describe('foco del input de archivo oculto', () => {
  it('base-shell.css pinta el anillo en el label', () => {
    const css = readFileSync(fileURLToPath(new URL('../../estilos/base-shell.css', import.meta.url)), 'utf8')
    expect(css).toMatch(/label:has\(> input\.sr-only:focus-visible\)\)? *\{\s*outline: var\(--pal-foco-ancho\) solid var\(--focus\)/)
  })
})
