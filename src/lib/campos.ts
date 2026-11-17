// Atributos para un campo de datos de personas o de salud (0.2.15). Chrome y
// Edge ignoran autoComplete="off" en su autorrelleno de direcciones y adivinan
// el tipo por el name, así que el name es opaco y estable: «ts-» y un hash del
// nombre lógico, sin palabras como nombre, teléfono o correo. Los data-* piden
// a LastPass, 1Password, Bitwarden y Dashlane que no ofrezcan nada.
export function campoPersona(nombre: string) {
  let h = 5381
  for (let i = 0; i < nombre.length; i++) h = (h * 33 + nombre.charCodeAt(i)) >>> 0
  return {
    name: 'ts-' + h.toString(36),
    autoComplete: 'off',
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
  }
}
