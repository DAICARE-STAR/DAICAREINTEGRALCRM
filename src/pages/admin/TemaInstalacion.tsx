import { useMemo, useState } from 'react'
import { describirFalla, primitivasDe, primitivasDeColor, resolver, semanticosDe, TEMAS_PORTAL, validarTemas } from '../../lib/contraste'
import { logAction } from '../../lib/audit'
import { guardarInstalacion } from '../../lib/data'
import { validarFuente, type Fuente } from '../../lib/fuentes'
import { SUPABASE_URL } from '../../lib/instalacion'
import { esTema, TEMAS, type Tema } from '../../lib/theme'
import PALETA_CSS from '../../estilos/paleta.css?raw'
import TEMAS_CSS from '../../estilos/temas.css?raw'

// Sección Tema de Administración → Instalación (N-5): tema por defecto,
// primitivas de color con vista previa en los tres temas y fuentes del
// bucket marca. Guardar queda deshabilitado mientras falle un par de
// validarTemas, la misma función de tools/tema/verificar.mjs. La base
// rechaza igual un tema mal formado (tema_valido, código 23514).

const BASE = primitivasDe(PALETA_CSS)
const EDITABLES = primitivasDeColor(PALETA_CSS)
const NOMBRE_TEMA: Record<Tema, string> = Object.fromEntries(TEMAS.map((t) => [t.id, t.nombre])) as Record<Tema, string>

type Ajustes = Record<string, unknown>

const aLineas = (fuentes: Fuente[]) => fuentes.map((f) => `${f.familia} | ${f.peso} | ${f.archivo}`).join('\n')

function deLineas(texto: string): { fuentes: Fuente[]; errores: string[] } {
  const fuentes: Fuente[] = []
  const errores: string[] = []
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((linea, i) => {
      const [familia = '', peso = '', archivo = ''] = linea.split('|').map((p) => p.trim())
      const f = { familia, peso: Number(peso), archivo }
      const error = validarFuente(f, SUPABASE_URL)
      if (error) errores.push(`Fuente ${i + 1}: ${error}`)
      else fuentes.push(f)
    })
  return { fuentes, errores }
}

function Muestra({ tema, propias }: { tema: Tema; propias: Record<string, string> }) {
  const sem = semanticosDe(TEMAS_CSS, tema)
  const prim = new Map(BASE)
  for (const [k, v] of Object.entries(propias)) prim.set(k, v)
  const c = (token: string) => resolver(sem.get(token) ?? '', sem, prim) ?? undefined
  return (
    <div style={{ background: c('--bg'), color: c('--txt'), padding: 12, borderRadius: 8, minWidth: 160 }}>
      <strong style={{ color: c('--txt-strong') }}>{NOMBRE_TEMA[tema]}</strong>
      <div style={{ background: c('--card'), padding: 8, marginTop: 8, borderRadius: 6 }}>
        <div>Texto</div>
        <div style={{ color: c('--muted') }}>Atenuado</div>
        <div style={{ color: c('--acento') }}>Acento</div>
        <span style={{ display: 'inline-block', marginTop: 6, padding: '2px 8px', borderRadius: 4, background: c('--btn-bg'), color: c('--btn-txt') }}>Botón</span>
      </div>
    </div>
  )
}

export default function TemaInstalacion({
  tema,
  ajustes,
  alGuardar,
}: {
  tema: Record<string, string>
  ajustes: Ajustes
  alGuardar: (aviso: string | null, error: unknown) => void
}) {
  const nucleo = (ajustes.nucleo ?? {}) as { tema_por_defecto?: unknown; fuentes?: unknown }
  const [propias, setPropias] = useState<Record<string, string>>(tema)
  const [porDefecto, setPorDefecto] = useState<Tema>(esTema(nucleo.tema_por_defecto) ? nucleo.tema_por_defecto : 'claro')
  const [lineas, setLineas] = useState(() => aLineas(Array.isArray(nucleo.fuentes) ? (nucleo.fuentes as Fuente[]) : []))
  const [guardando, setGuardando] = useState(false)

  const validacion = useMemo(() => validarTemas(propias, PALETA_CSS, TEMAS_CSS), [propias])
  const fuentes = useMemo(() => deLineas(lineas), [lineas])
  const bloqueado = !validacion.ok || fuentes.errores.length > 0

  function cambiar(clave: string, valor: string) {
    const v = valor.toLowerCase()
    const siguiente = { ...propias }
    if (v === BASE.get(clave)?.toLowerCase()) delete siguiente[clave]
    else siguiente[clave] = v
    setPropias(siguiente)
  }

  async function guardar() {
    setGuardando(true)
    try {
      await guardarInstalacion({
        tema: propias,
        ajustes: { ...ajustes, nucleo: { ...nucleo, tema_por_defecto: porDefecto, fuentes: fuentes.fuentes } },
      })
      void logAction('instalacion.actualizar', 'Actualizó el tema de la instalación', 'instalacion', '1')
      alGuardar('Tema guardado.', null)
    } catch (e) {
      alGuardar(null, e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section aria-labelledby="tema-titulo">
      <h3 id="tema-titulo">Tema</h3>
      <div className="form-grid">
        <label className="form-field">
          <span className="form-label">Tema por defecto</span>
          <select value={porDefecto} onChange={(e) => setPorDefecto(e.target.value as Tema)}>
            {TEMAS_PORTAL.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TEMA[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
        {TEMAS_PORTAL.map((t) => (
          <Muestra key={t} tema={t} propias={propias} />
        ))}
      </div>

      <div className="form-grid">
        {EDITABLES.map((clave) => (
          <label key={clave} className="form-field">
            <span className="form-label">{clave.replace('--pal-', '')}</span>
            <input type="color" value={(propias[clave] ?? BASE.get(clave) ?? '#000000').toLowerCase()} onChange={(e) => cambiar(clave, e.target.value)} />
          </label>
        ))}
        <label className="form-field form-field-wide">
          <span className="form-label">Fuentes (familia | peso | URL del bucket marca, una por línea)</span>
          <textarea autoComplete="off" rows={2} value={lineas} onChange={(e) => setLineas(e.target.value)} />
        </label>
      </div>

      {(validacion.fallas.length > 0 || fuentes.errores.length > 0) && (
        <ul className="alert" role="alert">
          {validacion.fallas.map((f) => (
            <li key={`${f.tema}${f.texto}${f.fondo}`}>{describirFalla(f)}</li>
          ))}
          {fuentes.errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {/* La primaria de la vista es «Guardar» de InstalacionTab (GUIA-UI) */}
      <div className="form-actions">
        <button className="btn-ghost" type="button" disabled={bloqueado || guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar tema'}
        </button>
        <button className="btn-ghost" type="button" onClick={() => setPropias({})}>
          Volver a la paleta neutra
        </button>
      </div>
    </section>
  )
}
