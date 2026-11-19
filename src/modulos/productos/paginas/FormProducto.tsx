import { useEffect, useRef, useState, type FormEvent } from 'react'
import Dialogo from '../../../components/Dialogo'
import { aplanar, opcionesArbol } from '../lib/categorias'
import { leerCodigo } from '../lib/codigo'
import { campoDeError, crearProducto, editarProducto, traducirError } from '../lib/datos'
import { aTextoComa } from '../lib/numeros'
import { TIPOS_PRODUCTO, type Catalogos, type Producto, type TipoProducto } from '../lib/tipos'
import { cambiosProducto, validarProducto, type CampoProducto, type FormProducto as Estado } from '../lib/validacion'
import { nombreUnidad, textoClase } from '../lib/vistas'

type Campo = CampoProducto | 'categoria_id'

function inicial(p: Producto | null, c: Catalogos): Estado {
  const predeterminada = c.impuestos.find((i) => i.predeterminado && !i.archivado_en)?.clave ?? ''
  return {
    codigo: p?.codigo ?? '',
    nombre: p?.nombre ?? '',
    tipo: p?.tipo ?? 'bien',
    vendible: p?.vendible ?? true,
    comprable: p?.comprable ?? true,
    categoria_id: p?.categoria_id ?? '',
    unidad_base: p?.unidad_base ?? (c.unidades.some((u) => u.clave === 'und') ? 'und' : c.unidades.find((u) => !u.archivado_en)?.clave ?? ''),
    impuesto: p?.impuesto ?? predeterminada,
    precio: aTextoComa(p?.precio_lista ?? null),
    descripcion: p?.descripcion ?? '',
  }
}

// Alta y edición de un producto. Código vacío en el alta: lo pone la
// numeración automática. El precio de lista va sin IVA, por unidad base, en
// la moneda de la instalación. Las listas ofrecen lo activo más lo que el
// producto ya tiene (una unidad o clase archivada que conserva).
export default function FormProducto({
  producto,
  catalogos,
  moneda,
  onClose,
  onGuardado,
}: {
  producto: Producto | null
  catalogos: Catalogos
  moneda: string
  onClose: () => void
  onGuardado: (p: Producto) => void
}) {
  const [f, setF] = useState<Estado>(() => inicial(producto, catalogos))
  const original = useRef(JSON.stringify(f))
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [vistaCodigo, setVistaCodigo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setF((x) => ({ ...x, [k]: v }))

  // Si el formulario se abrió antes de que llegaran los catálogos, toma la
  // unidad y la clase por defecto en cuanto llegan
  useEffect(() => {
    if (producto) return
    const d = inicial(null, catalogos)
    setF((x) => {
      if (x.unidad_base && x.impuesto) return x
      const y = { ...x, unidad_base: x.unidad_base || d.unidad_base, impuesto: x.impuesto || d.impuesto }
      // Los valores por defecto no cuentan como cambios sin guardar
      original.current = JSON.stringify({ ...JSON.parse(original.current), unidad_base: y.unidad_base, impuesto: y.impuesto })
      return y
    })
  }, [catalogos, producto])

  const unidades = catalogos.unidades.filter((u) => !u.archivado_en || u.clave === producto?.unidad_base)
  const impuestos = catalogos.impuestos.filter((i) => !i.archivado_en || i.clave === producto?.impuesto)
  const categorias = aplanar(catalogos.categorias).filter((n) => !n.categoria.archivado_en || n.categoria.id === producto?.categoria_id)
  const unidadPrecio = f.unidad_base ? nombreUnidad(catalogos, f.unidad_base).toLowerCase() : 'unidad base'

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const r = validarProducto(f, { nuevo: !producto, moneda })
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    setErrores({})
    setError(null)
    setGuardando(true)
    try {
      onGuardado(producto ? await editarProducto(producto, cambiosProducto(producto, r.datos)) : await crearProducto(r.datos))
    } catch (err) {
      const msg = traducirError(err, { entidad: 'producto' })
      const campo = campoDeError(err)
      if (campo) setErrores({ [campo]: msg })
      else setError(msg)
    } finally {
      setGuardando(false)
    }
  }

  const aviso = (k: Campo) =>
    errores[k] && (
      <span className="error small" role="alert">
        {errores[k]}
      </span>
    )

  return (
    <Dialogo
      titulo={producto ? 'Editar producto' : 'Nuevo producto'}
      onClose={onClose}
      onSubmit={enviar}
      sucio={() => JSON.stringify(f) !== original.current}
      focoInicial={nombreRef}
      className="modal-ancho"
    >
      <div className="prod-form">
        <label>
          <span>Código{producto ? ' *' : ''}</span>
          <input
            autoComplete="off"
            maxLength={60}
            placeholder={producto ? undefined : 'A-100'}
            value={f.codigo}
            onChange={(e) => {
              set('codigo', e.target.value)
              setVistaCodigo(null)
            }}
            onBlur={() => {
              const c = leerCodigo(f.codigo)
              setVistaCodigo(c.ok && c.codigo !== null && c.codigo !== f.codigo ? c.codigo : null)
            }}
          />
          {vistaCodigo && <span className="small muted">Se guarda como {vistaCodigo}</span>}
          {!producto && f.codigo.trim() === '' && <span className="small muted">Automático</span>}
          {aviso('codigo')}
        </label>
        <label>
          <span>Nombre *</span>
          <input autoComplete="off" ref={nombreRef} required maxLength={200} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
          {aviso('nombre')}
        </label>
        <label>
          <span>Tipo</span>
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoProducto)}>
            {TIPOS_PRODUCTO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="prod-marcas">
          <label>
            <input type="checkbox" checked={f.vendible} onChange={(e) => set('vendible', e.target.checked)} />
            <span>Se vende</span>
          </label>
          <label>
            <input type="checkbox" checked={f.comprable} onChange={(e) => set('comprable', e.target.checked)} />
            <span>Se compra</span>
          </label>
        </div>
        <label>
          <span>Categoría</span>
          <select value={f.categoria_id} onChange={(e) => set('categoria_id', e.target.value)}>
            <option value="">Sin categoría</option>
            {opcionesArbol(categorias).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.label}
              </option>
            ))}
          </select>
          {aviso('categoria_id')}
        </label>
        <label>
          <span>Unidad base *</span>
          <select value={f.unidad_base} onChange={(e) => set('unidad_base', e.target.value)}>
            {unidades.map((u) => (
              <option key={u.clave} value={u.clave}>
                {u.nombre}
                {u.archivado_en ? ' (archivada)' : ''}
              </option>
            ))}
          </select>
          {aviso('unidad_base')}
        </label>
        <label>
          <span>Impuesto *</span>
          <select value={f.impuesto} onChange={(e) => set('impuesto', e.target.value)}>
            {impuestos.map((i) => (
              <option key={i.clave} value={i.clave}>
                {textoClase(i, i.clave)}
                {i.archivado_en ? ' (archivada)' : ''}
              </option>
            ))}
          </select>
          {aviso('impuesto')}
        </label>
        <label>
          <span>Precio de lista por {unidadPrecio}, sin IVA</span>
          <span className="prod-precio">
            <span aria-hidden="true">{moneda}</span>
            <input autoComplete="off" inputMode="decimal" maxLength={30} placeholder="1.250,5" value={f.precio} onChange={(e) => set('precio', e.target.value)} />
          </span>
          {aviso('precio')}
        </label>
        <label>
          <span>Descripción</span>
          <textarea autoComplete="off" maxLength={4000} rows={3} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
          {aviso('descripcion')}
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
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Dialogo>
  )
}
