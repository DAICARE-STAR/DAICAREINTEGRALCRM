// CSV según RFC 4180, pensado para Excel en Colombia (separador ';').

export type Separador = ',' | ';' | '\t'

const BOM = '﻿'

// Elige el separador más frecuente en la primera línea, fuera de comillas.
// En empate gana ';' (Excel en español), luego ','.
export function detectarSeparador(texto: string): Separador {
  const cuenta = { ',': 0, ';': 0, '\t': 0 }
  let enComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (c === '"') enComillas = !enComillas
    else if (!enComillas) {
      if (c === '\n' || c === '\r') break
      if (c === ',' || c === ';' || c === '\t') cuenta[c]++
    }
  }
  if (cuenta[';'] > 0 && cuenta[';'] >= cuenta[','] && cuenta[';'] >= cuenta['\t']) return ';'
  if (cuenta['\t'] > cuenta[',']) return '\t'
  return ','
}

export function leerCsv(texto: string): string[][] {
  if (texto.startsWith(BOM)) texto = texto.slice(1)
  const sep = detectarSeparador(texto)
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let i = 0
  const n = texto.length
  const esFin = (c: string) => c === sep || c === '\n' || c === '\r'
  while (i < n) {
    const c = texto[i]
    if (c === '"' && celda === '') {
      // Celda entre comillas: se lee en bloque hasta la comilla de cierre
      i++
      let inicio = i
      for (;;) {
        const j = texto.indexOf('"', i)
        if (j === -1) {
          celda += texto.slice(inicio)
          i = n
          break
        }
        if (texto[j + 1] === '"') {
          celda += texto.slice(inicio, j + 1)
          i = j + 2
          inicio = i
          continue
        }
        celda += texto.slice(inicio, j)
        i = j + 1
        break
      }
      // Texto suelto tras la comilla de cierre (CSV mal formado): se conserva
      const k = i
      while (i < n && !esFin(texto[i])) i++
      celda += texto.slice(k, i)
      continue
    }
    if (c === sep) {
      fila.push(celda)
      celda = ''
      i++
      continue
    }
    if (c === '\r' || c === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
      i += c === '\r' && texto[i + 1] === '\n' ? 2 : 1
      continue
    }
    const k = i
    while (i < n && !esFin(texto[i])) i++
    celda += texto.slice(k, i)
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }
  // Las líneas en blanco se descartan
  return filas.filter(f => f.some(x => x !== ''))
}

// Inyección de fórmulas: una celda que empieza con = + - @ tabulador o
// retorno lleva un apóstrofo delante. Excepción: números puros (signo
// opcional, dígitos, puntos, comas y espacios, sin letras), como '-5',
// '-1.234,5' o '+57 300 123 4567': Excel no los evalúa como fórmula y
// alterarlos rompería teléfonos y cifras.
const RE_NUMERO_PURO = /^[+-]?\d[\d.,\s]*$/

export function neutralizar(celda: string): string {
  if (celda === '' || !/^[=+\-@\t\r]/.test(celda)) return celda
  if (RE_NUMERO_PURO.test(celda)) return celda
  return "'" + celda
}

function citar(celda: string, sep: string): string {
  const v = neutralizar(celda)
  if (v.includes('"') || v.includes(sep) || v.includes('\n') || v.includes('\r')) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

export function escribirCsv(filas: string[][], sep: Separador = ';', conBom = true): string {
  const cuerpo = filas.map(f => f.map(c => citar(c, sep)).join(sep)).join('\r\n')
  return (conBom ? BOM : '') + cuerpo + '\r\n'
}
