import { describe, expect, it } from 'vitest'
import { fuentesValidas, validarFuente } from '../fuentes'

const BASE = 'https://x.supabase.co'
const ARCHIVO = `${BASE}/storage/v1/object/public/marca/fuentes/inter-400.woff2`
const buena = { familia: 'Inter', peso: 400, archivo: ARCHIVO }

describe('validarFuente', () => {
  it('acepta una declaración del bucket marca', () => {
    expect(validarFuente(buena, BASE)).toBeNull()
  })
  it('rechaza URLs fuera del bucket marca', () => {
    expect(validarFuente({ ...buena, archivo: 'https://otro.com/inter.woff2' }, BASE)).toMatch(/bucket marca/)
    expect(validarFuente({ ...buena, archivo: `${BASE}/storage/v1/object/public/avatares/a.woff2` }, BASE)).toMatch(/bucket marca/)
    expect(validarFuente({ ...buena, archivo: `${BASE}/storage/v1/object/public/marca/a.png` }, BASE)).toMatch(/woff2/)
  })
  it('rechaza pesos fuera de 100-900', () => {
    for (const peso of [0, 99, 901, 450.5, '400']) expect(validarFuente({ ...buena, peso }, BASE)).toMatch(/peso/)
    expect(validarFuente({ ...buena, peso: 100 }, BASE)).toBeNull()
    expect(validarFuente({ ...buena, peso: 900 }, BASE)).toBeNull()
  })
  it('rechaza familias que podrían romper la declaración', () => {
    expect(validarFuente({ ...buena, familia: "a'; x" }, BASE)).toMatch(/familia/)
  })
  it('fuentesValidas descarta lo que no vale', () => {
    expect(fuentesValidas([buena, { ...buena, peso: 1000 }, null], BASE)).toEqual([buena])
    expect(fuentesValidas('x', BASE)).toEqual([])
  })
})
