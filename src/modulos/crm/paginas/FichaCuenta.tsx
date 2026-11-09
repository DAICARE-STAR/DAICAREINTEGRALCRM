import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import CabeceraPagina from '../../../components/CabeceraPagina'
import EstadoVacio from '../../../components/EstadoVacio'
import MfaModal from '../../../components/MfaModal'
import Pestanas, { PanelPestana } from '../../../components/Pestanas'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { useAvisos } from '../../../context/AvisosContext'
import { AJUSTES_POR_DEFECTO, nombreEtapa } from '../lib/catalogos'
import {
  archivarCuenta,
  borrarCuenta,
  contactosDeCuenta,
  leerAjustesCrm,
  leerCampos,
  leerConsentimientos,
  leerCuenta,
  leerResponsables,
  nivelSesion,
  permisoExplicito,
  traducirError,
  type Consentimiento,
  type Responsable,
} from '../lib/datos'
import type { AjustesCrm, CampoDef, Contacto, Cuenta } from '../lib/tipos'
import { consentimientoVigente, pestanasCuenta, type PestanaFicha } from '../lib/vistas'
import { ConsentimientosPanel, FormConsentimiento } from './Consentimientos'
import FormContacto from './FormContacto'
import FormCuenta from './FormCuenta'
import { ActividadesPanel, ContactosDeCuenta, HistorialPanel } from './Paneles'
import SaludPanel from './Salud'

const ID_BASE = 'crm-ficha'

export function DatosCuenta({ cuenta, ajustes, defs, responsables }: { cuenta: Cuenta; ajustes: AjustesCrm; defs: CampoDef[]; responsables: Responsable[] }) {
  const filas: [string, ReactNode][] = [
    ['Tipo', cuenta.tipo === 'persona' ? 'Persona' : 'Empresa'],
    [cuenta.tipo === 'persona' ? 'Cédula' : 'NIT', cuenta.documento],
    ['Etapa', cuenta.etapa ? nombreEtapa(ajustes, cuenta.etapa) : null],
    ['Origen', cuenta.origen],
    ...(cuenta.tipo === 'empresa' ? [['Tipo de empresa', cuenta.tipo_empresa] as [string, ReactNode]] : []),
    ['Responsable', responsables.find((r) => r.id === cuenta.responsable_id)?.nombre ?? null],
    ['Teléfono', cuenta.telefono],
    ['Correo', cuenta.email],
    ['Dirección', cuenta.direccion],
    ['Ciudad', cuenta.ciudad],
    ['País', cuenta.pais],
    ['Etiquetas', cuenta.etiquetas.join(', ') || null],
    ['Notas', cuenta.notas],
    ...defs
      .filter((d) => d.entidad === 'cuenta')
      .sort((a, b) => a.orden - b.orden)
      .map((d): [string, ReactNode] => {
        const v = cuenta.campos[d.clave]
        return [d.etiqueta, v === undefined || v === null ? null : d.tipo === 'booleano' ? (v ? 'Sí' : 'No') : String(v)]
      }),
  ]
  return (
    <dl className="crm-datos">
      {filas.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

type VistaProps = {
  cuenta: Cuenta | null
  error?: string | null
  verSalud: boolean
  activa: PestanaFicha
  puedeEditar: boolean
  esAdmin: boolean
  alCambiar: (p: PestanaFicha) => void
  alEditar: () => void
  alArchivar: () => void
  alBorrar: () => void
  children?: ReactNode
}

export function FichaCuentaVista(p: VistaProps) {
  if (!p.cuenta) {
    return (
      <div className="page page-crm">
        <CabeceraPagina titulo="Cuenta" />
        {p.error ? <EstadoVacio causa={p.error} accion={<Link to="/crm" className="btn-ghost">Volver a cuentas</Link>} /> : <SkeletonLineas n={6} />}
      </div>
    )
  }
  const pestanas = pestanasCuenta(p.cuenta.tipo, p.verSalud)
  const activa = pestanas.some((x) => x.id === p.activa) ? p.activa : 'datos'
  return (
    <div className="page page-crm">
      <CabeceraPagina
        titulo={p.cuenta.nombre}
        sufijo={p.cuenta.archivado_en ? 'archivada' : null}
        pestanas={<Pestanas pestanas={pestanas} activa={activa} onCambiar={p.alCambiar} etiqueta="Secciones de la cuenta" idBase={ID_BASE} />}
      >
        <Link to="/crm" className="btn-ghost">
          Cuentas
        </Link>
        {p.puedeEditar && (
          <>
            <button type="button" className="btn-ghost" onClick={p.alEditar}>
              Editar
            </button>
            <button type="button" className="btn-ghost" onClick={p.alArchivar}>
              {p.cuenta.archivado_en ? 'Restaurar' : 'Archivar'}
            </button>
          </>
        )}
        {p.esAdmin && (
          <button type="button" className="btn-ghost btn-danger" onClick={p.alBorrar}>
            Borrar
          </button>
        )}
      </CabeceraPagina>
      <PanelPestana idBase={ID_BASE} id={activa}>
        {p.children}
      </PanelPestana>
    </div>
  )
}

export default function FichaCuenta() {
  const { id = '' } = useParams<{ id: string }>()
  const { hasPerm, profile, session } = useAuth()
  const avisar = useAvisos()
  const navigate = useNavigate()
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activa, setActiva] = useState<PestanaFicha>('datos')
  const [ajustes, setAjustes] = useState<AjustesCrm>(AJUSTES_POR_DEFECTO)
  const [defs, setDefs] = useState<CampoDef[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [contactos, setContactos] = useState<Contacto[] | null>(null)
  const [consent, setConsent] = useState<Consentimiento[] | null>(null)
  const [verSalud, setVerSalud] = useState(false)
  const [editSalud, setEditSalud] = useState(false)
  const [aal2, setAal2] = useState(false)
  const [dialogo, setDialogo] = useState<'cuenta' | 'contacto' | 'consentimiento' | 'mfa' | null>(null)
  const [contactoEd, setContactoEd] = useState<Contacto | null>(null)
  const esAdmin = !!profile?.roles.includes('admin')
  const puedeEditar = hasPerm('edit_crm')

  const recargarContactos = useCallback(() => contactosDeCuenta(id).then(setContactos, () => setContactos([])), [id])
  const recargarConsent = useCallback(() => leerConsentimientos(id).then(setConsent, () => setConsent([])), [id])

  useEffect(() => {
    leerAjustesCrm().then(setAjustes, () => {})
    leerCampos().then(setDefs, () => {})
    leerResponsables().then(setResponsables, () => {})
    permisoExplicito('ver_salud').then(setVerSalud)
    permisoExplicito('edit_salud').then(setEditSalud)
  }, [])

  useEffect(() => {
    nivelSesion().then((n) => setAal2(n === 'aal2'), () => setAal2(false))
  }, [session])

  useEffect(() => {
    setCuenta(null)
    setError(null)
    setActiva('datos')
    leerCuenta(id).then(setCuenta, (e) => setError(traducirError(e)))
    void recargarContactos()
    void recargarConsent()
  }, [id, recargarContactos, recargarConsent])

  function archivar() {
    if (!cuenta) return
    const archivar = !cuenta.archivado_en
    archivarCuenta(cuenta.id, archivar).then(
      () => {
        avisar(archivar ? 'Cuenta archivada' : 'Cuenta restaurada')
        leerCuenta(id).then(setCuenta, () => {})
      },
      (e) => avisar(traducirError(e), 'error'),
    )
  }

  function borrar() {
    if (!cuenta || !window.confirm(`¿Borrar «${cuenta.nombre}» con sus contactos, actividades y datos asociados? No se puede deshacer.`)) return
    borrarCuenta(cuenta.id).then(
      () => {
        avisar('Cuenta borrada')
        navigate('/crm')
      },
      (e) => avisar(traducirError(e), 'error'),
    )
  }

  let panel: ReactNode = null
  if (cuenta) {
    switch (activa) {
      case 'datos':
        panel = <DatosCuenta cuenta={cuenta} ajustes={ajustes} defs={defs} responsables={responsables} />
        break
      case 'contactos':
        panel = (
          <ContactosDeCuenta
            contactos={contactos}
            puedeEditar={puedeEditar}
            alNuevo={() => {
              setContactoEd(null)
              setDialogo('contacto')
            }}
            alEditar={(c) => {
              setContactoEd(c)
              setDialogo('contacto')
            }}
          />
        )
        break
      case 'actividades':
        panel = (
          <ActividadesPanel
            cuentaId={cuenta.id}
            contactoId={null}
            contactos={contactos ?? []}
            puedeEditar={puedeEditar}
            usuarioId={profile?.id ?? null}
            esAdmin={esAdmin}
            responsables={responsables}
          />
        )
        break
      case 'historial':
        panel = <HistorialPanel entidad="cuenta" id={cuenta.id} responsables={responsables} />
        break
      case 'salud':
        panel = (
          <SaludPanel
            key={cuenta.id}
            cuentaId={cuenta.id}
            aal2={aal2}
            puedeEditar={editSalud}
            vigente={consentimientoVigente(consent ?? [], 'datos_salud')}
            alActivarMfa={() => setDialogo('mfa')}
            alRegistrarConsentimiento={() => setDialogo('consentimiento')}
          />
        )
        break
      case 'consentimientos':
        panel = (
          <ConsentimientosPanel
            lista={consent}
            puedeRegistrar={puedeEditar}
            puedeRevocar={esAdmin || editSalud || puedeEditar}
            puedeVerArchivo={puedeEditar}
            alCambio={() => void recargarConsent()}
            alNuevo={() => setDialogo('consentimiento')}
          />
        )
        break
    }
  }

  return (
    <>
      <FichaCuentaVista
        cuenta={cuenta}
        error={error}
        verSalud={verSalud}
        activa={activa}
        puedeEditar={puedeEditar}
        esAdmin={esAdmin}
        alCambiar={setActiva}
        alEditar={() => setDialogo('cuenta')}
        alArchivar={archivar}
        alBorrar={borrar}
      >
        {panel}
      </FichaCuentaVista>
      {dialogo === 'cuenta' && cuenta && (
        <FormCuenta
          cuenta={cuenta}
          ajustes={ajustes}
          defs={defs}
          responsables={responsables}
          onClose={() => setDialogo(null)}
          onGuardada={(c) => {
            setCuenta(c)
            setDialogo(null)
            avisar('Cuenta guardada')
          }}
        />
      )}
      {dialogo === 'contacto' && cuenta && (
        <FormContacto
          cuentaId={cuenta.id}
          contacto={contactoEd}
          ajustes={ajustes}
          defs={defs}
          onClose={() => setDialogo(null)}
          onGuardado={() => {
            setDialogo(null)
            avisar('Contacto guardado')
            void recargarContactos()
          }}
        />
      )}
      {dialogo === 'consentimiento' && cuenta && (
        <FormConsentimiento
          cuentaId={cuenta.id}
          tipoInicial={activa === 'salud' ? 'datos_salud' : 'tratamiento_datos'}
          onClose={() => setDialogo(null)}
          onGuardado={() => {
            setDialogo(null)
            avisar('Consentimiento registrado')
            void recargarConsent()
          }}
        />
      )}
      {dialogo === 'mfa' && (
        <MfaModal
          onClose={() => {
            setDialogo(null)
            nivelSesion().then((n) => setAal2(n === 'aal2'), () => {})
          }}
        />
      )}
    </>
  )
}
