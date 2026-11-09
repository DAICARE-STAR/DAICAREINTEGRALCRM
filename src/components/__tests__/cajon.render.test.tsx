import { describe, expect, it, vi } from 'vitest'
import { botonesConNombre, maxUnaPrimaria, renderEstatico, sinEmojis } from '../../test/render'
import CajonPestanas from '../CajonPestanas'

// Sin DOM no hay portal: se pinta en el sitio para el render estático
vi.mock('react-dom', async (original) => ({ ...(await original<typeof import('react-dom')>()), createPortal: (n: unknown) => n }))
vi.stubGlobal('document', { body: {} })

describe('CajonPestanas (render estático)', () => {
  const html = renderEstatico(
    <CajonPestanas
      titulo="Ficha del cliente"
      pestanas={[
        { id: 'datos', label: 'Datos' },
        { id: 'notas', label: 'Notas' },
      ]}
      activa="datos"
      onCambiar={() => {}}
      onClose={() => {}}
    >
      <p>Contenido</p>
    </CajonPestanas>,
  )

  it('role=dialog modal con el título como nombre', () => {
    expect(html).toMatch(/role="dialog"/)
    expect(html).toMatch(/aria-modal="true"/)
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`id="${id}">Ficha del cliente</h2>`)
  })

  it('el botón «×» se llama Cerrar', () => {
    expect(html).toMatch(/<button[^>]*aria-label="Cerrar"[^>]*>×<\/button>/)
  })

  it('reglas de GUIA-UI', () => {
    maxUnaPrimaria(html)
    sinEmojis(html)
    botonesConNombre(html)
  })
})
