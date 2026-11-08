import { describe, expect, it } from 'vitest'
import { filtrarWidgets } from '../modulos'

describe('widgets del Inicio por módulo activo', () => {
  const todos = [{ id: 'clock' }, { id: 'reuniones' }, { id: 'proyectos' }, { id: 'facturacion' }, { id: 'huerfano' }]

  it('solo el núcleo sin módulos activos', () => {
    expect(filtrarWidgets(todos, []).map((w) => w.id)).toEqual(['clock'])
  })

  it('suma los de cada módulo activo y descarta los que nadie declara', () => {
    expect(filtrarWidgets(todos, ['calendario', 'proyectos']).map((w) => w.id)).toEqual(['clock', 'reuniones', 'proyectos'])
  })
})
