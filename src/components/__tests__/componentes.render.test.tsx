import { describe, expect, it } from 'vitest'
import { botonesConNombre, maxUnaPrimaria, renderEstatico, sinEmojis, unH1 } from '../../test/render'
import BarraFiltros from '../BarraFiltros'
import { CabeceraVista } from '../CabeceraPagina'
import Dinero from '../Dinero'
import EstadoVacio from '../EstadoVacio'
import Resumen from '../Resumen'

const comunes = (html: string) => {
  maxUnaPrimaria(html)
  sinEmojis(html)
  botonesConNombre(html)
}

const filtro = (i: number, valor = '') => ({
  id: `f${i}`,
  etiqueta: `Filtro ${i}`,
  opciones: [
    { valor: '', label: `Filtro ${i}: todos` },
    { valor: 'a', label: 'A' },
  ],
  valor,
})

describe('componentes compartidos (render estático)', () => {
  it('CabeceraVista: un h1, acciones y sin línea de dato', () => {
    const html = renderEstatico(
      <CabeceraVista titulo="Clientes">
        <button type="button" className="btn-primary">
          Nuevo
        </button>
      </CabeceraVista>
    )
    unH1(html)
    comunes(html)
    expect(html).not.toMatch(/<\/h1>\s*<(p|span class="cabecera-dato)/)
  })

  it('BarraFiltros: cinco visibles, Más filtros abierto con su contador', () => {
    const filtros = [1, 2, 3, 4, 5, 6].map((i) => filtro(i, i === 6 ? 'a' : ''))
    const html = renderEstatico(<BarraFiltros filtros={filtros} alCambiar={() => {}} alLimpiar={() => {}} />)
    comunes(html)
    expect(html).toContain('<details class="fbar-mas" open=""')
    expect(html).toContain('Más filtros · 1')
    expect(html).toContain('1 filtro')
    expect(html).toContain('aria-label="Filtro 6"')
  })

  it('Resumen: una cifra destacada y sin contadores en cero', () => {
    const html = renderEstatico(
      <Resumen
        destacado={{ label: 'Total', valor: '5' }}
        cuentas={[
          { n: 5, label: 'Abiertas', filtro: 'f|abierta' },
          { n: 0, label: 'Vencidas' },
        ]}
        alFiltrar={() => {}}
      />
    )
    comunes(html)
    expect(html.match(/rd-valor/g)).toHaveLength(1)
    expect(html).not.toContain('Vencidas')
    expect(html).toContain('aria-pressed="false"')
  })

  it('Dinero: código y símbolo; divisas apiladas', () => {
    expect(renderEstatico(<Dinero valor={1234} moneda="COP" />)).toContain('COP $ 1.234')
    const html = renderEstatico(
      <Dinero
        montos={[
          { valor: 1, moneda: 'USD' },
          { valor: 2, moneda: 'EUR' },
        ]}
      />
    )
    expect(html).toContain('USD $ 1')
    expect(html).toContain('EUR € 2')
  })

  it('EstadoVacio: causa, acción y el permiso que falta', () => {
    const html = renderEstatico(
      <EstadoVacio
        causa="No tienes acceso a los miembros."
        permiso="manage_members"
        accion={<button type="button">Volver</button>}
      />
    )
    comunes(html)
    expect(html).toContain('manage_members')
    expect(html).toContain('role="alert"')
  })

  it('AvisosProvider: regiones status y alert montadas', () => {
    const html = renderEstatico(<p>x</p>)
    expect(html).toContain('role="status"')
    expect(html).toContain('role="alert"')
  })
})
