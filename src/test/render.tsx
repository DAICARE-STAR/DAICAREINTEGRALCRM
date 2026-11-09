import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { expect } from 'vitest'
import { AvisosProvider } from '../context/AvisosContext'

// Render estático para las pruebas .render.test.tsx (entorno node, sin jsdom):
// MemoryRouter y los contextos que los componentes compartidos necesitan, más
// las afirmaciones comunes de GUIA-UI.md.

export function renderEstatico(elemento: ReactElement, ruta = '/'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[ruta]}>
      <AvisosProvider>{elemento}</AvisosProvider>
    </MemoryRouter>
  )
}

/** Exactamente un h1. */
export function unH1(html: string): void {
  expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
}

/** Como mucho un botón primario. */
export function maxUnaPrimaria(html: string): void {
  expect((html.match(/btn-primary/g) ?? []).length).toBeLessThanOrEqual(1)
}

const EMOJI = /\p{Extended_Pictographic}/u

/** Sin emojis (los glifos neutros × · — ✓ ✕ no son pictográficos). */
export function sinEmojis(html: string): void {
  expect(EMOJI.test(html.replace(/[×·—✓✕▲▼]/g, ''))).toBe(false)
}

/** Todo botón tiene texto visible o aria-label. */
export function botonesConNombre(html: string): void {
  const botones = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? []
  for (const b of botones) {
    const texto = b.replace(/<[^>]+>/g, '').trim()
    const conEtiqueta = /aria-label="[^"]+"/.test(b)
    expect(conEtiqueta || texto.length > 0, b).toBe(true)
  }
}
