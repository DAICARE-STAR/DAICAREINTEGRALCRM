// Código del producto con la misma regla que productos_preparar
// (22-catalogo.sql): sin ningún espacio y en mayúsculas; luego solo A-Z,
// cifras y . _ / -, empezando por letra o cifra, hasta 40.

export const RE_CODIGO = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/

/** Quita todos los espacios y pasa a mayúsculas, como la base. */
export function normalizarCodigo(texto: string): string {
  return texto.replace(/\s/g, '').toUpperCase()
}

/** El código ya normalizado cumple el check de la base. */
export function esCodigoValido(codigo: string): boolean {
  return RE_CODIGO.test(codigo)
}

/**
 * Lee lo escrito en el campo Código: vacío es «automático» (null); si no,
 * el código normalizado o el motivo por el que la base lo rechazaría.
 */
export function leerCodigo(texto: string): { ok: true; codigo: string | null } | { ok: false; error: string } {
  const c = normalizarCodigo(texto)
  if (c === '') return { ok: true, codigo: null }
  if (c.length > 40) return { ok: false, error: 'El código admite hasta 40 caracteres.' }
  if (!esCodigoValido(c)) return { ok: false, error: 'El código solo admite letras sin tilde, cifras y . _ / -, y empieza por letra o cifra.' }
  return { ok: true, codigo: c }
}

/** Nombre normalizado como la columna nombre_normalizado de la base. */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLowerCase()
}
