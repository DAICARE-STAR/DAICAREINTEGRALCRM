import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { filasDeModulos } from '../../../lib/consumo'
import { ModulosVista, textoConector } from '../ModulosTab'

describe('ModulosVista (render estático)', () => {
  const filas = filasDeModulos(
    [
      { slug: 'nucleo', activo: true, limites: { miembros: 10, almacenamiento_mb: 100 } },
      { slug: 'ia', activo: true, limites: { ia_dia_equipo: 50 } },
    ],
    { miembros: 9, almacenamiento_mb: 20, ia_hoy: 45 },
  )
  const html = renderToStaticMarkup(<ModulosVista filas={filas} />)

  it('una sola cifra destacada, la más alta', () => {
    expect(html.match(/modulos-cifra/g)).toHaveLength(1)
    expect(html).toContain('90 %')
  })

  it('ningún botón de activar', () => {
    expect(html).not.toMatch(/<button/)
    expect(html).not.toMatch(/activar/i)
  })

  it('conectores con el estado del proxy; sin respuesta, sin comprobar', () => {
    const correo = filasDeModulos([{ slug: 'nucleo', activo: true, limites: {} }], null).filter((f) => f.conectores.includes('correo'))
    if (correo.length) {
      expect(renderToStaticMarkup(<ModulosVista filas={correo} conectores={{ correo: 'configurado' }} />)).toContain('correo (configurado)')
      expect(renderToStaticMarkup(<ModulosVista filas={correo} />)).toContain('correo (sin comprobar)')
    }
    expect(textoConector('correo', { correo: 'sin_configurar' })).toBe('correo (sin configurar)')
    expect(textoConector('correo', null)).toBe('correo (sin comprobar)')
  })
})
