import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// El producto nace de una copia neutralizada de team-portal (N-1, 0.1.19):
// ningún archivo versionado lleva el nombre, el dominio, el proyecto de
// Supabase, los tokens ni las claves de la empresa de origen. Solo
// docs/origen.md y tools/origen/ los nombran, porque documentan el renombre,
// y las pruebas que vigilan el renombre los citan para prohibirlos. La ruta
// local del repo de origen (regla de portes de AGENTS.md y docs/portes.md)
// se admite tal cual: no viaja en el build. Se leen los archivos que git conoce (versionados o por versionar, sin los
// ignorados), así un archivo nuevo entra solo en la revisión.

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))
const EXENTOS = [
  /^docs\/origen\.md$/,
  /^tools\/origen\//,
  /^src\/lib\/__tests__\/(contraste|esquema|mapa-renombre|tema-js)\.test\.ts$/,
]
const RUTA_ORIGEN = 'C:\\Users\\enzov\\IA\\' + 'lu' + 'ce-design\\team-portal'
const BINARIO = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|pdf)$/i

// Cada patrón se escribe partido para que este archivo no se delate a sí mismo
const PROHIBIDOS: [string, RegExp][] = [
  ['nombre', new RegExp('lu' + 'ce', 'i')],
  ['dominio', new RegExp('lu' + 'cedesign', 'i')],
  ['sitio', new RegExp('ldteam' + 'portal', 'i')],
  ['proyecto de Supabase', new RegExp('zkddstmh' + 'iarougxhnelq', 'i')],
  ['primitiva', new RegExp('--' + 'ld-')],
  ['clave de localStorage', new RegExp("['\"`]" + 'l' + 'd_')],
  ['tema', new RegExp('mar' + 'fil', 'i')],
]

function archivos(): string[] {
  const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return salida
    .split('\0')
    .filter(Boolean)
    .filter((r) => !BINARIO.test(r) && !EXENTOS.some((e) => e.test(r)))
}

describe('neutralidad del producto', () => {
  const lista = archivos()

  it('lee los archivos del repo', () => {
    expect(lista).toEqual(expect.arrayContaining(['src/App.tsx', 'netlify/lib/email.mts', 'src/styles.css']))
  })

  // El CHANGELOG entra en el bundle (pestaña Novedades) y public/ se sirve tal
  // cual: el cliente los lee. Ahí no se nombra el portal de origen (0.2.10).
  // En src/ y netlify/ vale el código, no los comentarios: esos dejan el
  // rastro del origen por diseño y el build los quita.
  it('lo que llega al navegador no nombra el portal de origen', () => {
    const origen = new RegExp('team' + '-portal', 'i')
    const sinComentarios = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
    const hallazgos: string[] = []
    for (const ruta of lista) {
      const sirve = ruta === 'CHANGELOG.md' || ruta === 'index.html' || ruta.startsWith('public/')
      const codigo = /^(src|netlify)\//.test(ruta) && /\.(tsx?|mts|js|html|css)$/.test(ruta) && !/__tests__\//.test(ruta)
      if (!sirve && !codigo) continue
      let texto: string
      try {
        texto = readFileSync(RAIZ + ruta, 'utf8')
      } catch {
        continue // borrado en el árbol de trabajo
      }
      if (codigo && !sirve) texto = sinComentarios(texto)
      texto.split(/\r?\n/).forEach((l, i) => {
        if (origen.test(l.split(RUTA_ORIGEN).join(''))) hallazgos.push(`${ruta}:${i + 1}`)
      })
    }
    expect(hallazgos).toEqual([])
  })

  it.each(PROHIBIDOS)('ningún archivo contiene el %s de la empresa de origen', (_, patron) => {
    const hallazgos: string[] = []
    for (const ruta of lista) {
      let texto: string
      try {
        texto = readFileSync(RAIZ + ruta, 'utf8')
      } catch {
        continue // borrado en el árbol de trabajo
      }
      texto.split(/\r?\n/).forEach((l, i) => {
        if (patron.test(l.split(RUTA_ORIGEN).join(''))) hallazgos.push(`${ruta}:${i + 1}`)
      })
    }
    expect(hallazgos).toEqual([])
  })
})
