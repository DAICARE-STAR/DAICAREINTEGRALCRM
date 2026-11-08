// Formato de dinero del shell: el mismo de /apps/shared/moneda.js
// (GUIA-UI.md, «Dinero»). «CÓDIGO SÍMBOLO importe»: EUR € 27.299.940 ·
// USD $ 727.425 · COP $ 50.000.000. El código va delante porque el símbolo
// solo no distingue las divisas ($ es dólar y peso). Miles con punto
// (es-CO), sin decimales salvo que se pidan y '—' cuando no hay número.
// Las divisas nunca se suman entre sí: se apilan.

// Solo el glifo: el código lo pone fmtDinero
export const MONEDAS: Readonly<Record<string, string>> = {
  USD: '$',
  COP: '$',
  EUR: '€',
  BOB: 'Bs',
  PEN: 'S/',
  BRL: 'R$',
  ARS: '$',
  CLP: '$',
  UYU: '$',
  DOP: 'RD$',
  GTQ: 'Q',
  MXN: '$',
}

// Un formateador por número de decimales (crearlos en cada llamada es caro)
const formateadores = new Map<number, Intl.NumberFormat>()

function formateador(decimales: number): Intl.NumberFormat {
  let f = formateadores.get(decimales)
  if (!f) {
    f = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })
    formateadores.set(decimales, f)
  }
  return f
}

function aNumero(n: unknown): number | null {
  const v = typeof n === 'string' && n.trim() !== '' ? Number(n.replace(/,/g, '')) : n
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Número con miles con punto y coma decimal ('—' sin número). */
export function fmtNumero(n: unknown, decimales = 0): string {
  const v = aNumero(n)
  if (v === null) return '—'
  return formateador(decimales).format(decimales === 0 ? Math.round(v) : v)
}

/** «USD $ 1.234»; con decimales, «COP $ 4.123,45». '—' sin número. */
export function fmtDinero(n: unknown, moneda?: string | null, decimales = 0): string {
  const v = aNumero(n)
  if (v === null) return '—'
  const cod = moneda || 'USD'
  const sim = MONEDAS[cod]
  return `${cod}${sim ? ` ${sim}` : ''} ${fmtNumero(v, decimales)}`
}
