import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import EstadoVacio from '../../../components/EstadoVacio'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAvisos } from '../../../context/AvisosContext'
import { borrarActividad, leerActividades, leerHistorial, traducirError, type Cambio, type Responsable } from '../lib/datos'
import type { Actividad, Contacto } from '../lib/tipos'
import { fmtFechaHora, nombreTipoActividad } from '../lib/vistas'
import FormActividad from './FormActividad'

// Paneles compartidos por las fichas de cuenta y de contacto.

export function ActividadesPanel({
  cuentaId,
  contactoId,
  contactos,
  puedeEditar,
  usuarioId,
  esAdmin,
  responsables,
}: {
  cuentaId: string | null
  contactoId: string | null
  contactos: Contacto[]
  puedeEditar: boolean
  usuarioId: string | null
  esAdmin: boolean
  responsables: Responsable[]
}) {
  const avisar = useAvisos()
  const [lista, setLista] = useState<Actividad[] | null>(null)
  const [editando, setEditando] = useState<Actividad | 'nueva' | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    setLista(null)
    leerActividades(contactoId ? { contacto_id: contactoId } : { cuenta_id: cuentaId ?? undefined }).then(setLista, (e) => {
      setLista([])
      avisar(traducirError(e), 'error')
    })
  }, [cuentaId, contactoId, recarga, avisar])

  const propia = (a: Actividad) => esAdmin || (puedeEditar && a.autor_id === usuarioId)
  const autor = (id: string | null) => responsables.find((r) => r.id === id)?.nombre ?? '—'

  return (
    <>
      {puedeEditar && (
        <div className="crm-acciones">
          <button type="button" className="btn-ghost" onClick={() => setEditando('nueva')}>
            Nueva actividad
          </button>
        </div>
      )}
      {lista === null ? (
        <SkeletonLineas n={4} />
      ) : lista.length === 0 ? (
        <EstadoVacio causa="Sin actividades registradas." />
      ) : (
        <ul className="crm-lista">
          {lista.map((a) => (
            <li key={a.id}>
              <strong>{a.asunto}</strong>
              <div className="small muted">
                {nombreTipoActividad(a.tipo)} · {fmtFechaHora(a.fecha)} · {autor(a.autor_id)}
              </div>
              {a.detalle && <p>{a.detalle}</p>}
              {propia(a) && (
                <div className="crm-acciones">
                  <button type="button" className="btn-ghost btn-small" onClick={() => setEditando(a)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => {
                      if (!window.confirm('¿Borrar esta actividad?')) return
                      borrarActividad(a.id).then(
                        () => setRecarga((x) => x + 1),
                        (e) => avisar(traducirError(e), 'error'),
                      )
                    }}
                  >
                    Borrar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <FormActividad
          actividad={editando === 'nueva' ? null : editando}
          cuentaId={cuentaId}
          contactoId={contactoId}
          contactos={contactos}
          onClose={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null)
            setRecarga((x) => x + 1)
            avisar('Actividad guardada')
          }}
        />
      )}
    </>
  )
}

const OPERACION: Record<Cambio['operacion'], string> = { insert: 'Creación', update: 'Edición', delete: 'Borrado' }

export function HistorialPanel({ entidad, id, responsables }: { entidad: 'cuenta' | 'contacto'; id: string; responsables: Responsable[] }) {
  const [lista, setLista] = useState<Cambio[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    leerHistorial(entidad, id).then(setLista, (e) => {
      setLista([])
      setError(traducirError(e))
    })
  }, [entidad, id])
  if (lista === null) return <SkeletonLineas n={4} />
  if (lista.length === 0) return <EstadoVacio causa={error ?? 'Sin cambios registrados.'} />
  return (
    <ul className="crm-lista">
      {lista.map((c) => (
        <li key={c.id}>
          <strong>{OPERACION[c.operacion]}</strong>
          {c.campos.length > 0 && <span> · {c.campos.join(', ')}</span>}
          <div className="small muted">
            {fmtFechaHora(c.created_at)} · {responsables.find((r) => r.id === c.autor_id)?.nombre ?? '—'}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ContactosDeCuenta({
  contactos,
  puedeEditar,
  alNuevo,
  alEditar,
}: {
  contactos: Contacto[] | null
  puedeEditar: boolean
  alNuevo: () => void
  alEditar: (c: Contacto) => void
}) {
  return (
    <>
      {puedeEditar && (
        <div className="crm-acciones">
          <button type="button" className="btn-ghost" onClick={alNuevo}>
            Nuevo contacto
          </button>
        </div>
      )}
      {contactos === null ? (
        <SkeletonLineas n={3} />
      ) : contactos.length === 0 ? (
        <EstadoVacio causa="La cuenta no tiene contactos." />
      ) : (
        <ul className="crm-lista">
          {contactos.map((c) => (
            <li key={c.id}>
              <Link to={`/crm/contactos/${c.id}`}>{c.nombre}</Link>
              {c.principal && <span className="muted"> · principal</span>}
              {c.archivado_en && <span className="muted"> · archivado</span>}
              <div className="small muted">{[c.relacion, c.cargo, c.telefono, c.email].filter(Boolean).join(' · ') || '—'}</div>
              {puedeEditar && (
                <button type="button" className="btn-ghost btn-small" onClick={() => alEditar(c)}>
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
