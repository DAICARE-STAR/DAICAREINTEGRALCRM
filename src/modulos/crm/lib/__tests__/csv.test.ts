import { describe, expect, it } from 'vitest'
import { detectarSeparador, escribirCsv, leerCsv, neutralizar } from '../csv'

describe('csv', () => {
  it('separador ; colombiano con BOM y CRLF', () => {
    expect(leerCsv('﻿Nombre;Ciudad\r\nAna;Bogotá\r\n')).toEqual([['Nombre', 'Ciudad'], ['Ana', 'Bogotá']])
  })

  it('autodetecta coma y tabulador, ignorando separadores entre comillas', () => {
    expect(detectarSeparador('"a;b;c",d\n')).toBe(',')
    expect(leerCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('comillas, comillas dobles y saltos de línea dentro de celdas', () => {
    const t = 'a;b\n"dice ""hola""";"línea 1\nlínea 2"\n"x;y";\n'
    expect(leerCsv(t)).toEqual([['a', 'b'], ['dice "hola"', 'línea 1\nlínea 2'], ['x;y', '']])
  })

  it('neutraliza fórmulas pero no números', () => {
    expect(neutralizar('=SUMA(A1)')).toBe("'=SUMA(A1)")
    expect(neutralizar('@x')).toBe("'@x")
    expect(neutralizar('-5')).toBe('-5')
    expect(neutralizar('+57 300 123 4567')).toBe('+57 300 123 4567')
    expect(neutralizar('-1+cmd')).toBe("'-1+cmd")
    expect(neutralizar('\tx')).toBe("'\tx")
  })

  it('ida y vuelta de escribir y leer', () => {
    const filas = [['Nombre', 'Notas'], ['Ana; "la jefa"', 'uno\r\ndos'], ['Luis', '']]
    const t = escribirCsv(filas)
    expect(t.startsWith('﻿')).toBe(true)
    expect(leerCsv(t)).toEqual(filas)
    expect(escribirCsv([['a']], ',', false)).toBe('a\r\n')
  })

  it('1.000 filas en menos de 1 s', () => {
    const t = Array.from({ length: 1000 }, (_, i) => `n${i};"c ${i}";x`).join('\n')
    const t0 = performance.now()
    expect(leerCsv(t)).toHaveLength(1000)
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  it('celda patológica de 100.000 caracteres en menos de 1 s', () => {
    const grande = '"' + '""a'.repeat(33334) + '"'
    const t0 = performance.now()
    const r = leerCsv('a;b\n' + grande + ';z\n' + 'x'.repeat(100000))
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(r[1][0].length).toBe(66668)
    expect(r[1][1]).toBe('z')
    // Comilla sin cerrar: no se cuelga
    const t1 = performance.now()
    leerCsv('"' + 'a\n'.repeat(50000))
    expect(performance.now() - t1).toBeLessThan(1000)
  })
})
