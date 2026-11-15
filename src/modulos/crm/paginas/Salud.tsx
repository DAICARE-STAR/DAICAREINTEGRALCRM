import { useEffect, useRef, useState, type FormEvent } from 'react'
import EstadoVacio from '../../../components/EstadoVacio'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAvisos } from '../../../context/AvisosContext'
import { CAMPOS_SALUD, saludGuardar, saludLeer, traducirError, type CampoSalud, type DatosSalud } from '../lib/datos'

// Pestaña Salud (PP-DEC-19). Los datos se leen al abrir la pestaña, viven
// solo en el estado de este panel (nada global ni en localStorage) y se
// descartan al desmontarlo.

const ETIQUETA: Record<CampoSalud, string> = {
  diagnosticos: 'Diagnósticos',
  medicamentos: 'Medicamentos',
  alergias: 'Alergias',
  antecedentes: 'Antecedentes',
  observaciones: 'Observaciones',
}

type VistaProps = {
  aal2: boolean
  puedeEditar: boolean
  vigente: boolean
  datos: DatosSalud | null
  error: string | null
  guardando?: boolean
  alActivarMfa: () => void
  alGuardar: (d: DatosSalud) => void
  alRegistrarConsentimiento: () => void
}

export function SaludVista(p: VistaProps) {
  const [borrador, setBorrador] = useState<DatosSalud | null>(p.datos)
  useEffect(() => setBorrador(p.datos), [p.datos])

  if (!p.aal2) {
    return (
      <EstadoVacio
        causa="Los datos de salud exigen el segundo factor activo en esta sesión."
        accion={
          <button type="button" className="btn-primary" onClick={p.alActivarMfa}>
            Activar segundo factor
          </button>
        }
      />
    )
  }
  if (p.error) return <EstadoVacio causa={p.error} />
  if (p.datos === null || borrador === null) return <SkeletonLineas n={5} />

  const editable = p.puedeEditar && p.vigente
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    p.alGuardar(borrador)
  }
  return (
    <>
      {p.puedeEditar && !p.vigente && (
        <EstadoVacio
          causa="Sin consentimiento de datos de salud vigente."
          accion={
            <button type="button" className="btn-primary" onClick={p.alRegistrarConsentimiento}>
              Registrar consentimiento
            </button>
          }
        />
      )}
      {editable ? (
        <form className="crm-form" onSubmit={enviar}>
          {CAMPOS_SALUD.map((k) => (
            <label key={k}>
              <span>{ETIQUETA[k]}</span>
              <textarea name={`ts-crm-salud-${k}`} autoComplete="off" rows={3} value={borrador[k]} onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })} />
            </label>
          ))}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={p.guardando}>
              {p.guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      ) : (
        <dl className="crm-datos">
          {CAMPOS_SALUD.map((k) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{ETIQUETA[k]}</dt>
              <dd>{p.datos![k] || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

export default function SaludPanel({
  cuentaId,
  aal2,
  puedeEditar,
  vigente,
  alActivarMfa,
  alRegistrarConsentimiento,
}: {
  cuentaId: string
  aal2: boolean
  puedeEditar: boolean
  vigente: boolean
  alActivarMfa: () => void
  alRegistrarConsentimiento: () => void
}) {
  const avisar = useAvisos()
  const [datos, setDatos] = useState<DatosSalud | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    if (aal2) {
      saludLeer(cuentaId).then(
        (d) => vivo.current && setDatos(d),
        (e) => vivo.current && setError(traducirError(e)),
      )
    }
    return () => {
      vivo.current = false
      setDatos(null)
    }
  }, [cuentaId, aal2])

  async function guardar(d: DatosSalud) {
    setGuardando(true)
    try {
      await saludGuardar(cuentaId, d)
      if (vivo.current) setDatos(d)
      avisar('Datos de salud guardados')
    } catch (e) {
      avisar(traducirError(e), 'error')
    } finally {
      if (vivo.current) setGuardando(false)
    }
  }

  return (
    <SaludVista
      aal2={aal2}
      puedeEditar={puedeEditar}
      vigente={vigente}
      datos={datos}
      error={error}
      guardando={guardando}
      alActivarMfa={alActivarMfa}
      alGuardar={guardar}
      alRegistrarConsentimiento={alRegistrarConsentimiento}
    />
  )
}
