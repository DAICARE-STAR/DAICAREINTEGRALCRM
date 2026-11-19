import { useState, type FormEvent } from 'react'
import Dialogo from '../../../components/Dialogo'
import EstadoVacio from '../../../components/EstadoVacio'
import { SkeletonLineas } from '../../../components/Skeleton'
import { useAvisos } from '../../../context/AvisosContext'
import { textoConversion, validarFactor } from '../lib/conversiones'
import { guardarConversion, quitarConversion, traducirError } from '../lib/datos'
import { aTextoComa, leerDecimal } from '../lib/numeros'
import type { Catalogos, Conversion, Producto } from '../lib/tipos'
import { nombreUnidad } from '../lib/vistas'

// Pestaña Unidades de la ficha: «1 caja = 12 und». El selector no ofrece la
// unidad base, las archivadas ni las que el producto ya tiene.

export function UnidadesVista({
  producto,
  conversiones,
  error,
  catalogos,
  puedeEditar,
  alNueva,
  alCambiar,
  alQuitar,
  alReintentar,
}: {
  producto: Producto
  conversiones: Conversion[] | null
  error?: string | null
  catalogos: Catalogos
  puedeEditar: boolean
  alNueva: () => void
  alCambiar: (c: Conversion) => void
  alQuitar: (c: Conversion) => void
  alReintentar?: () => void
}) {
  return (
    <>
      {puedeEditar && !error && (
        <div className="prod-acciones">
          <button type="button" className="btn-ghost" onClick={alNueva}>
            Añadir unidad alterna
          </button>
        </div>
      )}
      {conversiones === null ? (
        <SkeletonLineas n={3} />
      ) : error ? (
        <EstadoVacio
          causa={error}
          accion={
            alReintentar && (
              <button type="button" className="btn-ghost" onClick={alReintentar}>
                Reintentar
              </button>
            )
          }
        />
      ) : conversiones.length === 0 ? (
        <EstadoVacio causa={`Solo se cuenta en ${nombreUnidad(catalogos, producto.unidad_base).toLowerCase()}.`} />
      ) : (
        <ul className="prod-lista">
          {[...conversiones]
            .sort((a, b) => a.unidad.localeCompare(b.unidad))
            .map((c) => (
              <li key={c.unidad} className="prod-fila">
                <span>
                  <strong>{nombreUnidad(catalogos, c.unidad)}</strong>
                  <span className="muted"> · {textoConversion(c.unidad, c.factor, producto.unidad_base, catalogos.unidades)}</span>
                </span>
                {puedeEditar && (
                  <span className="prod-acciones">
                    <button type="button" className="btn-ghost btn-small" onClick={() => alCambiar(c)}>
                      Cambiar factor
                    </button>
                    <button type="button" className="btn-ghost btn-small" onClick={() => alQuitar(c)}>
                      Quitar
                    </button>
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}
    </>
  )
}

function FormConversion({
  producto,
  conversion,
  catalogos,
  ocupadas,
  onClose,
  onGuardada,
}: {
  producto: Producto
  conversion: Conversion | null
  catalogos: Catalogos
  ocupadas: string[]
  onClose: () => void
  onGuardada: () => void
}) {
  const libres = catalogos.unidades.filter((u) => !u.archivado_en && u.clave !== producto.unidad_base && !ocupadas.includes(u.clave))
  const [unidad, setUnidad] = useState(conversion?.unidad ?? libres[0]?.clave ?? '')
  const [factor, setFactor] = useState(conversion ? aTextoComa(conversion.factor) : '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const leido = leerDecimal(factor, ',')
  const vista = leido && !validarFactor(leido) && unidad ? textoConversion(unidad, leido, producto.unidad_base, catalogos.unidades) : null

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const motivo = !unidad ? 'Elige la unidad.' : leido === null ? 'El factor tiene que ser un número mayor que cero.' : validarFactor(leido)
    if (motivo || leido === null) {
      setError(motivo)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await guardarConversion(!conversion, { producto_id: producto.id, unidad, factor: leido })
      onGuardada()
    } catch (err) {
      setError(traducirError(err, { entidad: 'conversion' }))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo={conversion ? 'Cambiar factor' : 'Añadir unidad alterna'} onClose={onClose} onSubmit={enviar}>
      <div className="prod-form">
        <label>
          <span>Unidad</span>
          <select value={unidad} disabled={!!conversion} onChange={(e) => setUnidad(e.target.value)}>
            {(conversion ? catalogos.unidades.filter((u) => u.clave === conversion.unidad) : libres).map((u) => (
              <option key={u.clave} value={u.clave}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{`Equivale a (en ${nombreUnidad(catalogos, producto.unidad_base).toLowerCase()})`}</span>
          <input autoComplete="off" inputMode="decimal" required maxLength={20} placeholder="12" value={factor} onChange={(e) => setFactor(e.target.value)} />
        </label>
        {vista && <p className="small muted">{vista}</p>}
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
        <button type="submit" className="btn-primary" disabled={guardando || libres.length + (conversion ? 1 : 0) === 0}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Dialogo>
  )
}

export default function UnidadesProducto({
  producto,
  conversiones,
  error,
  catalogos,
  puedeEditar,
  alCambio,
  alReintentar,
}: {
  producto: Producto
  conversiones: Conversion[] | null
  error: string | null
  catalogos: Catalogos
  puedeEditar: boolean
  alCambio: () => void
  alReintentar: () => void
}) {
  const avisar = useAvisos()
  const [editando, setEditando] = useState<Conversion | 'nueva' | null>(null)

  function quitar(c: Conversion) {
    if (!window.confirm(`¿Quitar la unidad alterna ${nombreUnidad(catalogos, c.unidad)}?`)) return
    quitarConversion(producto.id, c.unidad).then(
      () => {
        avisar('Unidad alterna quitada')
        alCambio()
      },
      (e) => avisar(traducirError(e), 'error'),
    )
  }

  return (
    <>
      <UnidadesVista
        producto={producto}
        conversiones={conversiones}
        error={error}
        catalogos={catalogos}
        puedeEditar={puedeEditar}
        alNueva={() => setEditando('nueva')}
        alCambiar={setEditando}
        alQuitar={quitar}
        alReintentar={alReintentar}
      />
      {editando && (
        <FormConversion
          producto={producto}
          conversion={editando === 'nueva' ? null : editando}
          catalogos={catalogos}
          ocupadas={(conversiones ?? []).map((c) => c.unidad)}
          onClose={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null)
            avisar('Unidad alterna guardada')
            alCambio()
          }}
        />
      )}
    </>
  )
}
