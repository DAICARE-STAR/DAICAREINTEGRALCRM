import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ModuloNoDisponible from '../ModuloNoDisponible'

describe('ModuloNoDisponible (render estático)', () => {
  it('un h1 con el nombre del módulo y ningún botón primario', () => {
    const html = renderToStaticMarkup(<ModuloNoDisponible nombre="Calendario" />)
    const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/g) ?? []
    expect(h1).toHaveLength(1)
    expect(h1[0]).toContain('Módulo no disponible: Calendario')
    expect(html).not.toContain('btn-primary')
  })

  it('con error muestra el error y Reintentar', () => {
    const html = renderToStaticMarkup(<ModuloNoDisponible nombre="Chat" error="Fallo" alReintentar={() => {}} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('btn-primary')
  })
})
