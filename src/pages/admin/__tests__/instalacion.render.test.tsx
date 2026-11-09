import { describe, expect, it, vi } from 'vitest'
import { botonesConNombre, maxUnaPrimaria, renderEstatico, sinEmojis } from '../../../test/render'
import InvitarMiembro from '../InvitarMiembro'
import TemaInstalacion from '../TemaInstalacion'

vi.mock('react-dom', async (original) => ({ ...(await original<typeof import('react-dom')>()), createPortal: (n: unknown) => n }))
vi.stubGlobal('document', { body: {} })

// Vistas de Administración nuevas en 0.1 (N-5, N-7). TemaInstalacion va dentro
// de InstalacionTab, cuya primaria es «Guardar»: la sección no suma otra.
describe('Administración: sección Tema e Invitar (render estático)', () => {
  it('TemaInstalacion no pinta un botón primario', () => {
    const html = renderEstatico(<TemaInstalacion tema={{}} ajustes={{}} alGuardar={() => {}} />)
    expect(html).not.toMatch(/btn-primary/)
    sinEmojis(html)
    botonesConNombre(html)
  })

  it('InvitarMiembro: una primaria, sin emojis y botones con nombre', () => {
    const html = renderEstatico(
      <InvitarMiembro roles={[]} esAdmin rolesSoloAdmin={new Set()} onClose={() => {}} onInvitado={() => {}} />,
    )
    maxUnaPrimaria(html)
    sinEmojis(html)
    botonesConNombre(html)
  })
})
