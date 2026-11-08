import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { filtrarWidgets, widgetsActivos } from '../modulos'
import { esWidgetId } from '../widgets'

describe('widgets del Inicio por módulo activo', () => {
  const todos = [{ id: 'clock' }, { id: 'reuniones' }, { id: 'proyectos' }, { id: 'facturacion' }, { id: 'huerfano' }]

  it('solo el núcleo sin módulos activos', () => {
    expect(filtrarWidgets(todos, []).map((w) => w.id)).toEqual(['clock'])
  })

  it('suma los de cada módulo activo y descarta los que nadie declara', () => {
    expect(filtrarWidgets(todos, ['calendario', 'proyectos']).map((w) => w.id)).toEqual(['clock', 'reuniones', 'proyectos'])
  })
})

// Las tres capas de los widgets del núcleo cuadran: el registro, lo que el
// shell sabe pintar (widgets.ts) y la semilla de 07-widgets-uso.sql
describe('widgets del núcleo', () => {
  it('el registro, el shell y la semilla de 07 declaran los mismos', () => {
    const delRegistro = widgetsActivos([])
    expect(delRegistro.filter((id) => !esWidgetId(id))).toEqual([])
    const sql = readFileSync(fileURLToPath(new URL('../../../supabase/esquema/07-widgets-uso.sql', import.meta.url)), 'utf8')
    const semilla = /insert into public\.portal_widgets[^;]*;/i.exec(sql)?.[0] ?? ''
    const ids = [...semilla.matchAll(/\(\s*'([a-z-]+)',/g)].map((m) => m[1])
    expect(ids).toEqual(delRegistro)
  })
})
