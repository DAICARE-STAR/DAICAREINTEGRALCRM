import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { primitivasDe, semanticosDe, sinComentarios } from '../contraste'

// tools/origen/mapa-renombre.json es el renombre único de team-portal al
// producto (PP-DEC-05): cada grupo es biyectivo y cada destino existe en
// paleta.css, temas.css o public/tema.js, para que un porte con el mapa
// nunca apunte a un token que no está.

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
type Mapa = Record<string, Record<string, string>>
const MAPA = JSON.parse(leer('../../../tools/origen/mapa-renombre.json')) as Mapa & { _nota: string }
const PALETA = primitivasDe(leer('../../estilos/paleta.css'))
const TEMAS_CSS = leer('../../estilos/temas.css')
const TEMA_JS = leer('../../../public/tema.js')

const GRUPOS = ['primitivas', 'semanticos', 'temas', 'localStorage', 'globales'] as const

describe('mapa-renombre.json', () => {
  it.each(GRUPOS)('el grupo %s es biyectivo y no deja ningún origen igual a su destino', (grupo) => {
    const pares = Object.entries(MAPA[grupo])
    expect(pares.length).toBeGreaterThan(0)
    expect(new Set(pares.map(([, v]) => v)).size).toBe(pares.length)
    for (const [k, v] of pares) expect(k).not.toBe(v)
  })

  it('todas las primitivas --ld-* conocidas tienen destino en paleta.css', () => {
    for (const [origen, destino] of Object.entries(MAPA.primitivas)) {
      expect(origen).toMatch(/^--ld-/)
      expect(destino).toMatch(/^--pal-/)
      expect(PALETA.has(destino), `${origen} → ${destino}`).toBe(true)
    }
  })

  it('los semánticos renombrados existen en los tres temas', () => {
    for (const tema of ['claro', 'calido', 'oscuro']) {
      const s = semanticosDe(TEMAS_CSS, tema)
      for (const [origen, destino] of Object.entries(MAPA.semanticos)) {
        expect(origen).toMatch(/^--gold/)
        expect(s.has(destino), `${tema}: ${origen} → ${destino}`).toBe(true)
      }
    }
  })

  it('los temas renombrados son bloques data-theme de temas.css y la lista de tema.js', () => {
    const css = sinComentarios(TEMAS_CSS)
    for (const [origen, destino] of Object.entries(MAPA.temas)) {
      expect(css).toContain(`:root[data-theme='${destino}']`)
      expect(TEMA_JS).toContain(`'${destino}'`)
      expect(css).not.toContain(origen)
    }
  })

  it('las claves de localStorage y los globales renombrados aparecen en tema.js, y los viejos no', () => {
    for (const [origen, destino] of Object.entries({ ...MAPA.localStorage, ...MAPA.globales })) {
      expect(TEMA_JS, destino).toContain(destino)
      expect(TEMA_JS, origen).not.toContain(origen)
    }
    for (const destino of Object.values(MAPA.localStorage)) expect(destino).toMatch(/^pt_[a-z_]+_v\d+$/)
  })
})
