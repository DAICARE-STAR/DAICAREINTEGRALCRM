import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import CabeceraPagina from '../../../components/CabeceraPagina'
import EstadoVacio from '../../../components/EstadoVacio'
import Pestanas, { PanelPestana } from '../../../components/Pestanas'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { useAvisos } from '../../../context/AvisosContext'
import { AJUSTES_POR_DEFECTO } from '../lib/catalogos'
import {
  archivarContacto,
  borrarContacto,
  leerAjustesCrm,
  leerCampos,
  leerContacto,
  leerResponsables,
  traducirError,
  type ContactoConCuenta,
  type Responsable,
} from '../lib/datos'
import type { AjustesCrm, CampoDef } from '../lib/tipos'
import FormContacto from './FormContacto'
import { ActividadesPanel, HistorialPanel } from './Paneles'

type Pestana = 'datos' | 'actividades' | 'historial'
const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'datos', label: 'Datos' },
  { id: 'actividades', label: 'Actividades' },
  { id: 'historial', label: 'Historial' },
]
const ID_BASE = 'crm-contacto'

export default function FichaContacto() {
  const { id = '' } = useParams<{ id: string }>()
  const { hasPerm, profile } = useAuth()
  const avisar = useAvisos()
  const navigate = useNavigate()
  const [c, setC] = useState<ContactoConCuenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activa, setActiva] = useState<Pestana>('datos')
  const [ajustes, setAjustes] = useState<AjustesCrm>(AJUSTES_POR_DEFECTO)
  const [defs, setDefs] = useState<CampoDef[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [editando, setEditando] = useState(false)
  const puedeEditar = hasPerm('edit_crm')
  const esAdmin = !!profile?.roles.includes('admin')

  useEffect(() => {
    leerAjustesCrm().then(setAjustes, () => {})
    leerCampos().then(setDefs, () => {})
    leerResponsables().then(setResponsables, () => {})
  }, [])

  useEffect(() => {
    setC(null)
    setError(null)
    leerContacto(id).then(setC, (e) => setError(traducirError(e)))
  }, [id])

  if (!c) {
    return (
      <div className="page page-crm">
        <CabeceraPagina titulo="Contacto" />
        {error ? <EstadoVacio causa={error} accion={<Link to="/crm/contactos" className="btn-ghost">Volver a contactos</Link>} /> : <SkeletonLineas n={6} />}
      </div>
    )
  }

  const filas: [string, ReactNode][] = [
    ['Cuenta', <Link to={`/crm/cuentas/${c.cuenta_id}`}>{c.crm_cuentas?.nombre ?? 'Ver cuenta'}</Link>],
    ['Relación', c.relacion],
    ['Cargo', c.cargo],
    ['Correo', c.email],
    ['Teléfono', c.telefono],
    ['Principal', c.principal ? 'Sí' : 'No'],
    ['Etiquetas', c.etiquetas.join(', ') || null],
    ['Notas', c.notas],
    ...defs
      .filter((d) => d.entidad === 'contacto')
      .map((d): [string, ReactNode] => {
        const v = c.campos[d.clave]
        return [d.etiqueta, v === undefined || v === null ? null : d.tipo === 'booleano' ? (v ? 'Sí' : 'No') : String(v)]
      }),
  ]

  return (
    <div className="page page-crm">
      <CabeceraPagina
        titulo={c.nombre}
        sufijo={c.archivado_en ? 'archivado' : null}
        pestanas={<Pestanas pestanas={PESTANAS} activa={activa} onCambiar={setActiva} etiqueta="Secciones del contacto" idBase={ID_BASE} />}
      >
        <Link to="/crm/contactos" className="btn-ghost">
          Contactos
        </Link>
        {puedeEditar && (
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditando(true)}>
              Editar
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                archivarContacto(c.id, !c.archivado_en).then(
                  () => leerContacto(id).then(setC, () => {}),
                  (e) => avisar(traducirError(e), 'error'),
                )
              }
            >
              {c.archivado_en ? 'Restaurar' : 'Archivar'}
            </button>
          </>
        )}
        {esAdmin && (
          <button
            type="button"
            className="btn-ghost btn-danger"
            onClick={() => {
              if (!window.confirm(`¿Borrar el contacto «${c.nombre}»? No se puede deshacer.`)) return
              borrarContacto(c.id).then(
                () => navigate(`/crm/cuentas/${c.cuenta_id}`),
                (e) => avisar(traducirError(e), 'error'),
              )
            }}
          >
            Borrar
          </button>
        )}
      </CabeceraPagina>
      <PanelPestana idBase={ID_BASE} id={activa}>
        {activa === 'datos' && (
          <dl className="crm-datos">
            {filas.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
        {activa === 'actividades' && (
          <ActividadesPanel
            cuentaId={c.cuenta_id}
            contactoId={c.id}
            contactos={[]}
            puedeEditar={puedeEditar}
            usuarioId={profile?.id ?? null}
            esAdmin={esAdmin}
            responsables={responsables}
          />
        )}
        {activa === 'historial' && <HistorialPanel entidad="contacto" id={c.id} responsables={responsables} />}
      </PanelPestana>
      {editando && (
        <FormContacto
          cuentaId={c.cuenta_id}
          contacto={c}
          ajustes={ajustes}
          defs={defs}
          onClose={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false)
            avisar('Contacto guardado')
            leerContacto(id).then(setC, () => {})
          }}
        />
      )}
    </div>
  )
}
