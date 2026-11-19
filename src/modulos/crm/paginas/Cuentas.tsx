import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import BarraFiltros from '../../../components/BarraFiltros'
import CabeceraPagina from '../../../components/CabeceraPagina'
import EstadoVacio from '../../../components/EstadoVacio'
import Resumen from '../../../components/Resumen'
import { SkeletonFilas, SkeletonLista } from '../../../components/Skeleton'
import { useAuth } from '../../../context/AuthContext'
import { useAvisos } from '../../../context/AvisosContext'
import { partirFiltro } from '../../../lib/resumen'
import { AJUSTES_POR_DEFECTO, etapasOrdenadas, nombreEtapa } from '../lib/catalogos'
import {
  buscarCuentas,
  contarPorEtapa,
  leerAjustesCrm,
  leerCampos,
  leerResponsables,
  traducirError,
  type Responsable,
} from '../lib/datos'
import { aParametros, desdeParametros, FILTROS_VACIOS, type FiltrosCrm } from '../lib/filtros'
import type { AjustesCrm, CampoDef, Cuenta } from '../lib/tipos'
import { contadoresEtapa } from '../lib/vistas'
import Exportar from './Exportar'
import FormCuenta from './FormCuenta'
import Importar from './Importar'

const PAGINA = 50

type VistaProps = {
  cuentas: Cuenta[] | null
  total: number
  filtros: FiltrosCrm
  busqueda: string
  ajustes: AjustesCrm
  responsables: Responsable[]
  conteo: Record<string, number>
  puedeEditar: boolean
  puedeExportar: boolean
  error?: string | null
  alBuscar: (q: string) => void
  alFiltrar: (id: keyof FiltrosCrm, valor: string) => void
  alLimpiar: () => void
  alNueva: () => void
  alImportar: () => void
  alExportar: () => void
  alCargarMas: () => void
}

export function CuentasVista(p: VistaProps) {
  const etapas = etapasOrdenadas(p.ajustes)
  const nombreResp = (id: string | null) => p.responsables.find((r) => r.id === id)?.nombre ?? '—'
  const opciones = (neutra: string, lista: { valor: string; label: string }[]) => [{ valor: '', label: neutra }, ...lista]
  const deLista = (l: string[]) => l.map((v) => ({ valor: v, label: v }))
  const cabecera = (
    <thead>
      <tr>
        <th scope="col">Nombre</th>
        <th scope="col">Tipo</th>
        <th scope="col">Etapa</th>
        <th scope="col">Responsable</th>
        <th scope="col">Teléfono</th>
        <th scope="col">Ciudad</th>
      </tr>
    </thead>
  )
  return (
    <div className="page page-crm">
      <CabeceraPagina titulo="Cuentas">
        <Link to="/crm/contactos" className="btn-ghost">
          Contactos
        </Link>
        {p.puedeEditar && (
          <button type="button" className="btn-ghost" onClick={p.alImportar}>
            Importar
          </button>
        )}
        {p.puedeExportar && (
          <button type="button" className="btn-ghost" onClick={p.alExportar}>
            Exportar
          </button>
        )}
        {p.puedeEditar && (
          <button type="button" className="btn-primary" onClick={p.alNueva}>
            Nueva cuenta
          </button>
        )}
      </CabeceraPagina>

      <BarraFiltros
        buscador={{ valor: p.busqueda, etiqueta: 'Buscar por nombre, documento o correo', alCambiar: p.alBuscar }}
        filtros={[
          { id: 'tipo', etiqueta: 'Tipo', valor: p.filtros.tipo, opciones: opciones('Tipo: todos', [{ valor: 'persona', label: 'Persona' }, { valor: 'empresa', label: 'Empresa' }]) },
          { id: 'etapa', etiqueta: 'Etapa', valor: p.filtros.etapa, opciones: opciones('Etapa: todas', etapas.map((e) => ({ valor: e.clave, label: e.nombre }))) },
          { id: 'origen', etiqueta: 'Origen', valor: p.filtros.origen, opciones: opciones('Origen: todos', deLista(p.ajustes.origenes)) },
          { id: 'responsable', etiqueta: 'Responsable', valor: p.filtros.responsable, opciones: opciones('Responsable: todos', p.responsables.map((r) => ({ valor: r.id, label: r.nombre }))) },
          { id: 'etiqueta', etiqueta: 'Etiqueta', valor: p.filtros.etiqueta, opciones: opciones('Etiqueta: todas', p.filtros.etiqueta ? deLista([p.filtros.etiqueta]) : []) },
          { id: 'archivadas', etiqueta: 'Archivadas', valor: p.filtros.archivadas ? '1' : '', opciones: [{ valor: '', label: 'Sin archivadas' }, { valor: '1', label: 'Con archivadas' }] },
        ]}
        alCambiar={(id, v) => p.alFiltrar(id as keyof FiltrosCrm, v)}
        alLimpiar={p.alLimpiar}
      />

      <Resumen
        destacado={{ label: 'Cuentas', valor: p.cuentas === null ? null : p.total.toLocaleString('es-CO') }}
        cuentas={contadoresEtapa(p.ajustes, p.conteo, p.filtros.etapa)}
        alFiltrar={(par) => {
          const f = partirFiltro(par)
          if (f) p.alFiltrar('etapa', p.filtros.etapa === f.valor ? '' : f.valor)
        }}
      />

      {p.cuentas === null ? (
        // Las filas del esqueleto van dentro de la tabla; en móvil, donde no hay tabla, bloques
        <>
          <div className="table-scroll crm-tabla">
            <table className="table">
              {cabecera}
              <tbody>
                <SkeletonFilas filas={6} columnas={6} />
              </tbody>
            </table>
          </div>
          <div className="crm-tarjetas">
            <SkeletonLista n={6} avatar={false} lineas={2} />
          </div>
        </>
      ) : p.cuentas.length === 0 ? (
        <EstadoVacio
          causa={p.error ?? 'No hay cuentas con estos filtros.'}
          accion={
            p.error ? undefined : (
              <button type="button" className="btn-ghost" onClick={p.alLimpiar}>
                Limpiar filtros
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="table-scroll crm-tabla">
            <table className="table">
              {cabecera}
              <tbody>
                {p.cuentas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/crm/cuentas/${c.id}`}>{c.nombre}</Link>
                      {c.archivado_en && <span className="muted"> · archivada</span>}
                    </td>
                    <td>{c.tipo === 'persona' ? 'Persona' : 'Empresa'}</td>
                    <td>{c.etapa ? nombreEtapa(p.ajustes, c.etapa) : '—'}</td>
                    <td>{nombreResp(c.responsable_id)}</td>
                    <td>{c.telefono ?? '—'}</td>
                    <td>{c.ciudad ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="crm-tarjetas">
            {p.cuentas.map((c) => (
              <li key={c.id} className="crm-tarjeta">
                <Link to={`/crm/cuentas/${c.id}`}>{c.nombre}</Link>
                <div className="small muted">
                  {c.tipo === 'persona' ? 'Persona' : 'Empresa'} · {c.etapa ? nombreEtapa(p.ajustes, c.etapa) : '—'}
                  {c.telefono ? ` · ${c.telefono}` : ''}
                </div>
              </li>
            ))}
          </ul>
          {p.cuentas.length < p.total && (
            <div className="crm-mas">
              <button type="button" className="btn-ghost" onClick={p.alCargarMas}>
                Cargar más
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Cuentas() {
  const { hasPerm } = useAuth()
  const avisar = useAvisos()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filtros = desdeParametros(params)
  const clave = aParametros(filtros).toString()
  const [busqueda, setBusqueda] = useState(filtros.q)
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState<AjustesCrm>(AJUSTES_POR_DEFECTO)
  const [defs, setDefs] = useState<CampoDef[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [conteo, setConteo] = useState<Record<string, number>>({})
  const [dialogo, setDialogo] = useState<'nueva' | 'importar' | 'exportar' | null>(null)
  const [recarga, setRecarga] = useState(0)
  const seq = useRef(0)
  const puedeEditar = hasPerm('edit_crm')
  const puedeExportar = hasPerm('exportar_crm')

  useEffect(() => {
    leerAjustesCrm().then(setAjustes, () => {})
    leerCampos().then(setDefs, () => {})
    leerResponsables().then(setResponsables, () => {})
  }, [])

  const cambiar = (f: FiltrosCrm) => setParams(aParametros(f), { replace: true })

  // Búsqueda con espera de 200 ms antes de ir a la URL
  useEffect(() => {
    if (busqueda === filtros.q) return
    const t = setTimeout(() => cambiar({ ...filtros, q: busqueda }), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  useEffect(() => {
    const n = ++seq.current
    setCuentas(null)
    setError(null)
    buscarCuentas(filtros, 0, PAGINA).then(
      (r) => {
        if (n !== seq.current) return
        setCuentas(r.filas)
        setTotal(r.total)
      },
      (e) => {
        if (n !== seq.current) return
        setCuentas([])
        setTotal(0)
        setError(traducirError(e))
      },
    )
    contarPorEtapa({ ...filtros, etapa: '' }, ajustes.etapas.map((e) => e.clave)).then(
      (c) => n === seq.current && setConteo(c),
      () => {},
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, ajustes, recarga])

  function cargarMas() {
    const actuales = cuentas ?? []
    buscarCuentas(filtros, actuales.length, PAGINA).then(
      (r) => {
        setCuentas([...actuales, ...r.filas])
        setTotal(r.total)
      },
      (e) => avisar(traducirError(e), 'error'),
    )
  }

  return (
    <>
      <CuentasVista
        cuentas={cuentas}
        total={total}
        filtros={filtros}
        busqueda={busqueda}
        ajustes={ajustes}
        responsables={responsables}
        conteo={conteo}
        puedeEditar={puedeEditar}
        puedeExportar={puedeExportar}
        error={error}
        alBuscar={setBusqueda}
        alFiltrar={(id, v) => cambiar({ ...filtros, [id]: id === 'archivadas' ? v === '1' : v })}
        alLimpiar={() => {
          setBusqueda('')
          cambiar(FILTROS_VACIOS)
        }}
        alNueva={() => setDialogo('nueva')}
        alImportar={() => setDialogo('importar')}
        alExportar={() => setDialogo('exportar')}
        alCargarMas={cargarMas}
      />
      {dialogo === 'nueva' && (
        <FormCuenta
          cuenta={null}
          ajustes={ajustes}
          defs={defs}
          responsables={responsables}
          onClose={() => setDialogo(null)}
          onGuardada={(c) => {
            setDialogo(null)
            avisar('Cuenta creada')
            navigate(`/crm/cuentas/${c.id}`)
          }}
        />
      )}
      {dialogo === 'importar' && (
        <Importar
          ajustes={ajustes}
          defs={defs}
          responsables={responsables}
          onClose={() => {
            setDialogo(null)
            setRecarga((x) => x + 1)
          }}
        />
      )}
      {dialogo === 'exportar' && puedeExportar && (
        <Exportar filtros={filtros} total={total} ajustes={ajustes} defs={defs} responsables={responsables} onClose={() => setDialogo(null)} />
      )}
    </>
  )
}
