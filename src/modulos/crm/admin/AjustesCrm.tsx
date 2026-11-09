import { useEffect, useState } from 'react'
import EstadoVacio from '../../../components/EstadoVacio'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAvisos } from '../../../context/AvisosContext'
import CabeceraAdmin from '../../../pages/admin/CabeceraAdmin'
import { etapasOrdenadas, validarAjustes } from '../lib/catalogos'
import { borrarCampo, guardarAjustesCrm, guardarCampo, leerAjustesCrm, leerCampos, traducirError } from '../lib/datos'
import type { AjustesCrm as Ajustes, CampoDef, Cierre, EntidadCampo, TipoCampo } from '../lib/tipos'
import { RE_CLAVE_CAMPO } from '../lib/tipos'

// Administración → CRM (solo administrador): catálogos en
// instalacion.ajustes.crm y campos personalizados (crm_campos_def).

const lista = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)

export function CatalogosVista({ ajustes, alCambiar, errores }: { ajustes: Ajustes; alCambiar: (a: Ajustes) => void; errores: string[] }) {
  const etapas = etapasOrdenadas(ajustes)
  const cambiarEtapa = (i: number, cambios: Partial<Ajustes['etapas'][number]>) =>
    alCambiar({ ...ajustes, etapas: etapas.map((e, j) => (i === j ? { ...e, ...cambios } : e)) })
  return (
    <div className="crm-form">
      <fieldset className="crm-form">
        <legend>Etapas</legend>
        {etapas.map((e, i) => (
          <div key={i} className="crm-acciones">
            <input aria-label={`Clave de la etapa ${i + 1}`} value={e.clave} onChange={(ev) => cambiarEtapa(i, { clave: ev.target.value })} />
            <input aria-label={`Nombre de la etapa ${i + 1}`} value={e.nombre} onChange={(ev) => cambiarEtapa(i, { nombre: ev.target.value })} />
            <select aria-label={`Cierre de la etapa ${i + 1}`} value={e.cierre ?? ''} onChange={(ev) => cambiarEtapa(i, { cierre: (ev.target.value || null) as Cierre })}>
              <option value="">Abierta</option>
              <option value="ganada">Cierre ganado</option>
              <option value="perdida">Cierre perdido</option>
            </select>
            <button type="button" className="btn-ghost btn-small" disabled={etapas.length <= 1} onClick={() => alCambiar({ ...ajustes, etapas: etapas.filter((_, j) => j !== i) })}>
              Quitar
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => alCambiar({ ...ajustes, etapas: [...etapas, { clave: '', nombre: '', orden: Math.max(0, ...etapas.map((e) => e.orden)) + 1, cierre: null }] })}
          >
            Añadir etapa
          </button>
        </div>
      </fieldset>
      {(
        [
          ['origenes', 'Orígenes'],
          ['tipos_empresa', 'Tipos de empresa'],
          ['relaciones', 'Relaciones'],
        ] as const
      ).map(([k, etiqueta]) => (
        <label key={k}>
          <span>{etiqueta} (separados por coma)</span>
          <textarea rows={2} value={ajustes[k].join(', ')} onChange={(e) => alCambiar({ ...ajustes, [k]: lista(e.target.value) })} />
        </label>
      ))}
      {errores.length > 0 && (
        <ul className="error" role="alert">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CAMPO_VACIO: CampoDef = { clave: '', entidad: 'cuenta', etiqueta: '', tipo: 'texto', opciones: [], obligatorio: false, filtrable: false, orden: 0 }

function FilaCampo({ def, nuevo, alGuardado }: { def: CampoDef; nuevo: boolean; alGuardado: () => void }) {
  const avisar = useAvisos()
  const [d, setD] = useState(def)
  const [opciones, setOpciones] = useState(def.opciones.join(', '))
  const valida = RE_CLAVE_CAMPO.test(d.clave) && d.etiqueta.trim() !== '' && (d.tipo !== 'lista' || lista(opciones).length > 0)
  const guardar = () =>
    guardarCampo({ ...d, etiqueta: d.etiqueta.trim(), opciones: d.tipo === 'lista' ? lista(opciones) : [] }, nuevo).then(
      () => {
        avisar('Campo guardado')
        if (nuevo) {
          setD(CAMPO_VACIO)
          setOpciones('')
        }
        alGuardado()
      },
      (e) => avisar(traducirError(e), 'error'),
    )
  const etiq = nuevo ? 'del campo nuevo' : `de ${def.clave}`
  return (
    <div className="crm-acciones">
      <input aria-label={`Clave ${etiq}`} value={d.clave} disabled={!nuevo} onChange={(e) => setD({ ...d, clave: e.target.value })} />
      <input aria-label={`Etiqueta ${etiq}`} value={d.etiqueta} maxLength={80} onChange={(e) => setD({ ...d, etiqueta: e.target.value })} />
      <select aria-label={`Entidad ${etiq}`} value={d.entidad} disabled={!nuevo} onChange={(e) => setD({ ...d, entidad: e.target.value as EntidadCampo })}>
        <option value="cuenta">Cuenta</option>
        <option value="contacto">Contacto</option>
      </select>
      <select aria-label={`Tipo ${etiq}`} value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoCampo })}>
        <option value="texto">Texto</option>
        <option value="numero">Número</option>
        <option value="fecha">Fecha</option>
        <option value="lista">Lista</option>
        <option value="booleano">Sí o no</option>
      </select>
      {d.tipo === 'lista' && <input aria-label={`Opciones ${etiq}`} placeholder="Opciones" value={opciones} onChange={(e) => setOpciones(e.target.value)} />}
      <input aria-label={`Orden ${etiq}`} type="number" value={d.orden} onChange={(e) => setD({ ...d, orden: Number(e.target.value) || 0 })} />
      <label>
        <span>
          <input type="checkbox" checked={d.obligatorio} onChange={(e) => setD({ ...d, obligatorio: e.target.checked })} /> Obligatorio
        </span>
      </label>
      <button type="button" className="btn-ghost btn-small" disabled={!valida} onClick={guardar}>
        {nuevo ? 'Añadir campo' : 'Guardar campo'}
      </button>
      {!nuevo && (
        <button
          type="button"
          className="btn-ghost btn-small"
          onClick={() => {
            if (!window.confirm(`¿Borrar el campo ${def.clave}? Las cuentas que lo tengan no se podrán editar hasta quitar su valor.`)) return
            borrarCampo(def.clave).then(alGuardado, (e) => avisar(traducirError(e), 'error'))
          }}
        >
          Borrar
        </button>
      )}
    </div>
  )
}

export default function AjustesCrm() {
  const avisar = useAvisos()
  const [ajustes, setAjustes] = useState<Ajustes | null>(null)
  const [campos, setCampos] = useState<CampoDef[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const recargarCampos = () => leerCampos().then(setCampos, (e) => setError(traducirError(e)))

  useEffect(() => {
    leerAjustesCrm().then(setAjustes, (e) => setError(traducirError(e)))
    void recargarCampos()
  }, [])

  const errores = ajustes ? validarAjustes(ajustes) : []

  async function guardar() {
    if (!ajustes || errores.length > 0) return
    setGuardando(true)
    try {
      await guardarAjustesCrm(ajustes)
      avisar('Catálogos guardados')
    } catch (e) {
      avisar(traducirError(e), 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section>
      <CabeceraAdmin titulo="CRM">
        <button type="button" className="btn-primary" disabled={!ajustes || errores.length > 0 || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar catálogos'}
        </button>
      </CabeceraAdmin>
      {error ? (
        <EstadoVacio causa={error} />
      ) : !ajustes ? (
        <SkeletonLineas n={6} />
      ) : (
        <CatalogosVista ajustes={ajustes} alCambiar={setAjustes} errores={errores} />
      )}
      <h3>Campos personalizados</h3>
      {campos === null ? (
        <SkeletonLineas n={3} />
      ) : (
        <>
          {campos.map((c) => (
            <FilaCampo key={c.clave + c.etiqueta + c.tipo + c.orden} def={c} nuevo={false} alGuardado={() => void recargarCampos()} />
          ))}
          <FilaCampo def={CAMPO_VACIO} nuevo alGuardado={() => void recargarCampos()} />
        </>
      )}
    </section>
  )
}
