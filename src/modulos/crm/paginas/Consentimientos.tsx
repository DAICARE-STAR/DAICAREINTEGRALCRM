import { useRef, useState, type FormEvent } from 'react'
import Dialogo from '../../../components/Dialogo'
import EstadoVacio from '../../../components/EstadoVacio'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAvisos } from '../../../context/AvisosContext'
import {
  registrarConsentimiento,
  revocarConsentimiento,
  traducirError,
  urlConsentimiento,
  type Consentimiento,
  type MedioConsentimiento,
  type TipoConsentimiento,
} from '../lib/datos'
import { fmtFecha, fmtFechaHora } from '../lib/vistas'

const TIPO: Record<TipoConsentimiento, string> = { tratamiento_datos: 'Tratamiento de datos', datos_salud: 'Datos de salud' }
const MEDIO: Record<MedioConsentimiento, string> = { escrito: 'Escrito', digital: 'Digital', verbal_grabado: 'Verbal grabado' }
const TIPOS_ARCHIVO = 'application/pdf,image/jpeg,image/png'
const MAX_BYTES = 10 * 1024 * 1024

export function ConsentimientosPanel({
  lista,
  puedeRegistrar,
  puedeRevocar,
  puedeVerArchivo,
  alCambio,
  alNuevo,
}: {
  lista: Consentimiento[] | null
  puedeRegistrar: boolean
  puedeRevocar: boolean
  puedeVerArchivo: boolean
  alCambio: () => void
  alNuevo: () => void
}) {
  const avisar = useAvisos()
  return (
    <>
      {puedeRegistrar && (
        <div className="crm-acciones">
          <button type="button" className="btn-ghost" onClick={alNuevo}>
            Registrar consentimiento
          </button>
        </div>
      )}
      {lista === null ? (
        <SkeletonLineas n={3} />
      ) : lista.length === 0 ? (
        <EstadoVacio causa="Sin consentimientos registrados." />
      ) : (
        <ul className="crm-lista">
          {lista.map((c) => (
            <li key={c.id}>
              <strong>{TIPO[c.tipo]}</strong> · {c.otorgado ? 'otorgado' : 'negado'}
              {c.revocado_en && <span className="muted"> · revocado {fmtFechaHora(c.revocado_en)}</span>}
              <div className="small muted">
                {fmtFecha(c.fecha)} · {MEDIO[c.medio]} · versión {c.version_texto}
              </div>
              <div className="crm-acciones">
                {c.archivo_ruta && puedeVerArchivo && (
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() =>
                      urlConsentimiento(c.archivo_ruta!).then(
                        (u) => window.open(u, '_blank', 'noopener'),
                        (e) => avisar(traducirError(e), 'error'),
                      )
                    }
                  >
                    Ver archivo
                  </button>
                )}
                {puedeRevocar && c.otorgado && !c.revocado_en && (
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => {
                      if (!window.confirm('¿Revocar este consentimiento?')) return
                      revocarConsentimiento(c.id).then(alCambio, (e) => avisar(traducirError(e), 'error'))
                    }}
                  >
                    Revocar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function FormConsentimiento({
  cuentaId,
  tipoInicial,
  onClose,
  onGuardado,
}: {
  cuentaId: string
  tipoInicial: TipoConsentimiento
  onClose: () => void
  onGuardado: () => void
}) {
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
  const [f, setF] = useState({ tipo: tipoInicial, otorgado: true, fecha: hoy, medio: 'escrito' as MedioConsentimiento, version_texto: '' })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const versionRef = useRef<HTMLInputElement>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (archivo && archivo.size > MAX_BYTES) {
      setError('El archivo supera 10 MB.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await registrarConsentimiento(cuentaId, { ...f, version_texto: f.version_texto.trim() }, archivo)
      onGuardado()
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      titulo="Registrar consentimiento"
      onClose={onClose}
      onSubmit={enviar}
      sucio={() => f.version_texto !== '' || archivo !== null}
      focoInicial={versionRef}
    >
      <div className="crm-form">
        <label>
          <span>Tipo</span>
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoConsentimiento })}>
            <option value="tratamiento_datos">{TIPO.tratamiento_datos}</option>
            <option value="datos_salud">{TIPO.datos_salud}</option>
          </select>
        </label>
        <label>
          <span>Decisión</span>
          <select value={f.otorgado ? '1' : '0'} onChange={(e) => setF({ ...f, otorgado: e.target.value === '1' })}>
            <option value="1">Otorgado</option>
            <option value="0">Negado</option>
          </select>
        </label>
        <label>
          <span>Fecha</span>
          <input autoComplete="off" type="date" required value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </label>
        <label>
          <span>Medio</span>
          <select value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value as MedioConsentimiento })}>
            {(Object.keys(MEDIO) as MedioConsentimiento[]).map((m) => (
              <option key={m} value={m}>
                {MEDIO[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Versión del texto *</span>
          <input name="ts-crm-consentimiento-version" autoComplete="off" ref={versionRef} required maxLength={40} value={f.version_texto} onChange={(e) => setF({ ...f, version_texto: e.target.value })} />
        </label>
        <label>
          <span>Archivo (PDF, JPG o PNG)</span>
          <input type="file" accept={TIPOS_ARCHIVO} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Registrar'}
        </button>
      </div>
    </Dialogo>
  )
}
