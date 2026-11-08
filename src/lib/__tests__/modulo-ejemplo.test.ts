import { lazy } from 'react'
import { describe, expect, it } from 'vitest'
import { componerShell, shellDe, type ModuloShell } from '../../modulos'

// Módulo «ejemplo» que solo existe en las pruebas (N-3): ejercita el camino
// en que un módulo sí trae rutas.tsx, que hoy ningún módulo real recorre.
const Rutas = lazy(async () => ({ default: () => null }))
const ejemplo: ModuloShell = {
  Rutas,
  busquedas: [{ grupo: 'Ejemplo', buscar: async () => [] }],
  pestanasAdmin: [{ id: 'ejemplo', label: 'Ejemplo', grupo: 'Módulos', acceso: 'admin', Componente: Rutas }],
}

describe('módulo de ejemplo en el shell', () => {
  const shell = componerShell({ './ejemplo/rutas.tsx': { default: ejemplo } })

  it('la clave es la carpeta y shellDe la encuentra', () => {
    expect(Object.keys(shell)).toEqual(['ejemplo'])
    expect(shellDe('ejemplo', shell)).toBe(ejemplo)
    expect(shellDe('ejemplo', shell)?.pestanasAdmin?.[0].id).toBe('ejemplo')
  })

  it('un slug sin carpeta o heredado del prototipo no aporta nada', () => {
    expect(shellDe('otro', shell)).toBeUndefined()
    expect(shellDe('constructor', shell)).toBeUndefined()
    expect(shellDe('ejemplo')).toBeUndefined()
  })
})
