import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import BarraFiltros from '../../../components/BarraFiltros'
import CabeceraPagina from '../../../components/CabeceraPagina'
import EstadoVacio from '../../../components/EstadoVacio'
import Resumen from '../../../components/Resumen'
import { SkeletonFilas, SkeletonLista } from '../../../components/Skeleton'
import { useAvisos } from '../../../context/AvisosContext'
import { buscarContactos, traducirError, type ContactoConCuenta, type FiltrosContactos } from '../lib/datos'

const PAGINA = 50

type VistaProps = {
  contactos: ContactoConCuenta[] | null
  total: number
  busqueda: string
  archivados: boolean
  error?: string | null
  alBuscar: (q: string) => void
  alArchivados: (v: boolean) => void
  alLimpiar: () => void
  alCargarMas: () => void
}

export function ContactosVista(p: VistaProps) {
  const cabecera = (
    <thead>
      <tr>
        <th scope="col">Nombre</th>
        <th scope="col">Cuenta</th>
        <th scope="col">Relación</th>
        <th scope="col">Teléfono</th>
        <th scope="col">Correo</th>
      </tr>
    </thead>
  )
  return (
    <div className="page page-crm">
      <CabeceraPagina titulo="Contactos">
        <Link to="/crm" className="btn-ghost">
          Cuentas
        </Link>
      </CabeceraPagina>
      <BarraFiltros
        buscador={{ valor: p.busqueda, etiqueta: 'Buscar por nombre, correo o teléfono', alCambiar: p.alBuscar }}
        filtros={[
          {
            id: 'archivados',
            etiqueta: 'Archivados',
            valor: p.archivados ? '1' : '',
            opciones: [
              { valor: '', label: 'Sin archivados' },
              { valor: '1', label: 'Con archivados' },
            ],
          },
        ]}
        alCambiar={(_id, v) => p.alArchivados(v === '1')}
        alLimpiar={p.alLimpiar}
      />
      <Resumen destacado={{ label: 'Contactos', valor: p.contactos === null ? null : p.total.toLocaleString('es-CO') }} cuentas={[]} />
      {p.contactos === null ? (
        // Las filas del esqueleto van dentro de la tabla; en móvil, donde no hay tabla, bloques
        <>
          <div className="table-scroll crm-tabla">
            <table className="table">
              {cabecera}
              <tbody>
                <SkeletonFilas filas={6} columnas={5} />
              </tbody>
            </table>
          </div>
          <div className="crm-tarjetas">
            <SkeletonLista n={6} avatar={false} lineas={2} />
          </div>
        </>
      ) : p.contactos.length === 0 ? (
        <EstadoVacio causa={p.error ?? 'No hay contactos con estos filtros.'} />
      ) : (
        <>
          <div className="table-scroll crm-tabla">
            <table className="table">
              {cabecera}
              <tbody>
                {p.contactos.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/crm/contactos/${c.id}`}>{c.nombre}</Link>
                      {c.principal && <span className="muted"> · principal</span>}
                    </td>
                    <td>
                      <Link to={`/crm/cuentas/${c.cuenta_id}`}>{c.crm_cuentas?.nombre ?? '—'}</Link>
                    </td>
                    <td>{c.relacion ?? '—'}</td>
                    <td>{c.telefono ?? '—'}</td>
                    <td>{c.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="crm-tarjetas">
            {p.contactos.map((c) => (
              <li key={c.id} className="crm-tarjeta">
                <Link to={`/crm/contactos/${c.id}`}>{c.nombre}</Link>
                <div className="small muted">{[c.crm_cuentas?.nombre, c.relacion, c.telefono].filter(Boolean).join(' · ')}</div>
              </li>
            ))}
          </ul>
          {p.contactos.length < p.total && (
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

export default function Contactos() {
  const avisar = useAvisos()
  const [busqueda, setBusqueda] = useState('')
  const [f, setF] = useState<FiltrosContactos>({ q: '', archivados: false })
  const [lista, setLista] = useState<ContactoConCuenta[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === busqueda ? x : { ...x, q: busqueda })), 200)
    return () => clearTimeout(t)
  }, [busqueda])

  useEffect(() => {
    const n = ++seq.current
    setLista(null)
    setError(null)
    buscarContactos(f, 0, PAGINA).then(
      (r) => {
        if (n !== seq.current) return
        setLista(r.filas)
        setTotal(r.total)
      },
      (e) => {
        if (n !== seq.current) return
        setLista([])
        setError(traducirError(e))
      },
    )
  }, [f])

  return (
    <ContactosVista
      contactos={lista}
      total={total}
      busqueda={busqueda}
      archivados={f.archivados}
      error={error}
      alBuscar={setBusqueda}
      alArchivados={(v) => setF((x) => ({ ...x, archivados: v }))}
      alLimpiar={() => {
        setBusqueda('')
        setF({ q: '', archivados: false })
      }}
      alCargarMas={() => {
        const actuales = lista ?? []
        buscarContactos(f, actuales.length, PAGINA).then(
          (r) => {
            setLista([...actuales, ...r.filas])
            setTotal(r.total)
          },
          (e) => avisar(traducirError(e), 'error'),
        )
      }}
    />
  )
}
