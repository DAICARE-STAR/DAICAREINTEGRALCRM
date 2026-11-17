import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { campoPersona } from '../campos'

// Lo heredado del portal de origen no debe llegar al usuario por los campos de
// texto (0.2.10, 0.2.15 y 0.2.16). Tres causas, las tres vigiladas aquí:
//  1) Un placeholder con un ejemplo real (cargo, teléfono, dirección de una
//     oficina, marca de un tercero) o con el correo de la sesión.
//  2) Un campo sin autoComplete: el navegador sugiere lo escrito antes en
//     cualquier otro sitio o puerto (el historial va por tipo de campo, no por
//     origen), así que los datos de personas y de salud se cuelan de un
//     producto a otro.
//  3) Un campo de datos de personas o de salud sin el ayudante campoPersona, o
//     con un name= o autoComplete= escrito después del spread que lo anula
//     (Chrome y Edge ignoran «off» y adivinan el tipo por el name).

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))

// Cada patrón se escribe partido para que este archivo no se delate a sí mismo
const EJEMPLOS_REALES: [string, RegExp][] = [
  ['cargo de la empresa de origen', new RegExp('Gerente ' + 'LATAM', 'i')],
  ['ciudad de una oficina de origen', new RegExp('Carta' + 'gena', 'i')],
  ['dirección de una oficina de origen', new RegExp('Diag\\. ' + '22T', 'i')],
  ['marca de un tercero', new RegExp('no' + 'tion\\.', 'i')],
]

function tsx(): string[] {
  const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'src'], {
    cwd: RAIZ,
    encoding: 'utf8',
  })
  return salida
    .split('\0')
    .filter((r) => /\.tsx$/.test(r) && !/__tests__\//.test(r) && !/\.test\.tsx$/.test(r))
}

type Campo = { ruta: string; linea: number; tag: string; atributos: string }

// Cada <input> y <textarea> con sus atributos; las llaves de JSX se cuentan
// para no cortar el tag en el «=>» de un onChange.
function campos(): Campo[] {
  const salida: Campo[] = []
  for (const ruta of tsx()) {
    const t = readFileSync(RAIZ + ruta, 'utf8')
    const re = /<(input|textarea)(?=[\s/>])/g
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) {
      let i = m.index + m[0].length
      let d = 0
      for (; i < t.length; i++) {
        const c = t[i]
        if (c === '{') d++
        else if (c === '}') d--
        else if (c === '>' && d === 0) break
      }
      salida.push({ ruta, linea: t.slice(0, m.index).split('\n').length, tag: m[1], atributos: t.slice(m.index + m[0].length, i) })
    }
  }
  return salida
}

const SIN_TEXTO = /type="(checkbox|radio|file|range|color|hidden|submit|button)"/

describe('campos de texto sin datos heredados', () => {
  const todos = campos()

  it('encuentra los formularios del producto', () => {
    expect(todos.length).toBeGreaterThan(40)
    expect(todos.some((c) => c.ruta === 'src/components/EditProfileModal.tsx')).toBe(true)
    expect(todos.some((c) => c.ruta === 'src/modulos/crm/paginas/Salud.tsx')).toBe(true)
  })

  it('todo input y textarea de texto declara autoComplete', () => {
    const sin = todos
      .filter((c) => !SIN_TEXTO.test(c.atributos) && !/autoComplete|\{\.\.\.campoPersona\(/.test(c.atributos))
      .map((c) => `${c.ruta}:${c.linea}`)
    expect(sin).toEqual([])
  })

  it('los campos de datos de personas y de salud usan el ayudante campoPersona', () => {
    const delicados = [
      'src/components/EditProfileModal.tsx',
      'src/modulos/crm/paginas/FormContacto.tsx',
      'src/modulos/crm/paginas/FormCuenta.tsx',
      'src/modulos/crm/paginas/FormActividad.tsx',
      'src/modulos/crm/paginas/Salud.tsx',
      'src/modulos/crm/paginas/Consentimientos.tsx',
      'src/pages/admin/MembersTab.tsx',
      'src/pages/admin/InvitarMiembro.tsx',
      'src/modulos/crm/paginas/CamposPersonalizados.tsx',
    ]
    // Fechas y números no guardan historial de texto: no necesitan el ayudante
    const SIN_HISTORIAL = /type="(checkbox|radio|file|range|color|hidden|submit|button|date|datetime-local|number)"/
    const sin = todos
      .filter((c) => delicados.includes(c.ruta) && !SIN_HISTORIAL.test(c.atributos) && !/\{\.\.\.campoPersona\(/.test(c.atributos))
      .map((c) => `${c.ruta}:${c.linea}`)
    expect(sin).toEqual([])
    for (const ruta of delicados) expect(todos.some((c) => c.ruta === ruta), ruta).toBe(true)
  })

  it('nada después del spread de campoPersona anula su name ni su autoComplete', () => {
    const anulados = todos
      .filter((c) => {
        const i = c.atributos.indexOf('{...campoPersona(')
        return i >= 0 && /(^|\s)(name|autoComplete)=/.test(c.atributos.slice(i))
      })
      .map((c) => `${c.ruta}:${c.linea}`)
    expect(anulados).toEqual([])
  })

  it('campoPersona cierra el autorrelleno con un name opaco y estable', () => {
    const a = campoPersona('perfil-telefono')
    expect(a.autoComplete).toBe('off')
    expect(a.name).toMatch(/^bl-[a-z0-9]+$/)
    // Sin palabras que la heurística del navegador reconozca
    expect(a.name).not.toMatch(/perfil|tel|nombre|correo|cargo|direcc|name|phone|mail/i)
    expect(campoPersona('perfil-telefono').name).toBe(a.name)
    expect(campoPersona('perfil-nombre').name).not.toBe(a.name)
    expect(a).toMatchObject({ 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' })
  })

  it('Editar perfil no muestra ejemplos en gris, solo pistas de formato', () => {
    const t = readFileSync(RAIZ + 'src/components/EditProfileModal.tsx', 'utf8')
    const FORMATO = /^placeholder="https?:\/\/[^"]*"$/
    const malos = [...t.matchAll(/placeholder=(?:"[^"]*"|\{[^}]*\})/g)].map((m) => m[0]).filter((p) => !FORMATO.test(p))
    expect(malos).toEqual([])
  })

  it('ningún placeholder usa el correo de la sesión ni un ejemplo real', () => {
    const malos: string[] = []
    for (const ruta of tsx()) {
      const t = readFileSync(RAIZ + ruta, 'utf8')
      t.split(/\r?\n/).forEach((l, i) => {
        if (!/placeholder=/.test(l)) return
        if (/placeholder=\{[^}]*(email|correo|session|profile)/i.test(l)) malos.push(`${ruta}:${i + 1} (dato de la sesión)`)
        for (const [que, patron] of EJEMPLOS_REALES) if (patron.test(l)) malos.push(`${ruta}:${i + 1} (${que})`)
      })
    }
    expect(malos).toEqual([])
  })
})
