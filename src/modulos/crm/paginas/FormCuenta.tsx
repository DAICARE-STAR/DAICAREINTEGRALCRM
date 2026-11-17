import { useRef, useState, type FormEvent } from 'react'
import Dialogo from '../../../components/Dialogo'
import { etapasOrdenadas } from '../lib/catalogos'
import { limpiarCampos, validarCampos, validarValor } from '../lib/campos'
import { crearCuenta, editarCuenta, traducirError, type CambiosCuenta, type Responsable } from '../lib/datos'
import type { AjustesCrm, CampoDef, Cuenta, TipoCuenta } from '../lib/tipos'
import { partirEtiquetas, textoNulo } from '../lib/vistas'
import CamposPersonalizados from './CamposPersonalizados'
import { campoPersona } from '../../../lib/campos'

type Estado = {
  tipo: TipoCuenta
  nombre: string
  documento: string
  etapa: string
  origen: string
  tipo_empresa: string
  responsable_id: string
  telefono: string
  email: string
  direccion: string
  ciudad: string
  pais: string
  etiquetas: string
  notas: string
  campos: Record<string, unknown>
}

function inicial(c: Cuenta | null, ajustes: AjustesCrm): Estado {
  return {
    tipo: c?.tipo ?? 'persona',
    nombre: c?.nombre ?? '',
    documento: c?.documento ?? '',
    etapa: c?.etapa ?? etapasOrdenadas(ajustes)[0]?.clave ?? '',
    origen: c?.origen ?? '',
    tipo_empresa: c?.tipo_empresa ?? '',
    responsable_id: c?.responsable_id ?? '',
    telefono: c?.telefono ?? '',
    email: c?.email ?? '',
    direccion: c?.direccion ?? '',
    ciudad: c?.ciudad ?? '',
    pais: c?.pais ?? 'CO',
    etiquetas: (c?.etiquetas ?? []).join(', '),
    notas: c?.notas ?? '',
    campos: { ...(c?.campos ?? {}) },
  }
}

export default function FormCuenta({
  cuenta,
  ajustes,
  defs,
  responsables,
  onClose,
  onGuardada,
}: {
  cuenta: Cuenta | null
  ajustes: AjustesCrm
  defs: CampoDef[]
  responsables: Responsable[]
  onClose: () => void
  onGuardada: (c: Cuenta) => void
}) {
  const [f, setF] = useState<Estado>(() => inicial(cuenta, ajustes))
  const original = useRef(JSON.stringify(f))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setF((x) => ({ ...x, [k]: v }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const campos = limpiarCampos(f.campos)
    const errs = validarCampos(defs, 'cuenta', campos)
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    const normalizados: Record<string, unknown> = {}
    for (const d of defs.filter((x) => x.entidad === 'cuenta')) {
      if (campos[d.clave] === undefined) continue
      const r = validarValor(d, campos[d.clave])
      if (r.ok) normalizados[d.clave] = r.valor
    }
    const datos: CambiosCuenta = {
      tipo: f.tipo,
      nombre: f.nombre.trim(),
      documento: textoNulo(f.documento),
      etapa: f.etapa || null,
      origen: f.origen || null,
      tipo_empresa: f.tipo === 'empresa' ? f.tipo_empresa || null : null,
      responsable_id: f.responsable_id || null,
      telefono: textoNulo(f.telefono),
      email: textoNulo(f.email),
      direccion: textoNulo(f.direccion),
      ciudad: textoNulo(f.ciudad),
      pais: f.pais.trim().toUpperCase() || 'CO',
      etiquetas: partirEtiquetas(f.etiquetas),
      notas: textoNulo(f.notas),
      campos: normalizados,
    }
    setGuardando(true)
    setError(null)
    try {
      onGuardada(cuenta ? await editarCuenta(cuenta.id, datos) : await crearCuenta(datos))
    } catch (err) {
      setError(traducirError(err, { entidad: 'cuenta', etiquetas: Object.fromEntries(defs.map((d) => [d.clave, d.etiqueta])) }))
    } finally {
      setGuardando(false)
    }
  }

  const texto = (k: keyof Estado, etiqueta: string, extra: Record<string, unknown> = {}) => (
    <label>
      <span>{etiqueta}</span>
      <input {...campoPersona(`crm-cuenta-${k}`)} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} {...extra} />
    </label>
  )

  return (
    <Dialogo
      titulo={cuenta ? 'Editar cuenta' : 'Nueva cuenta'}
      onClose={onClose}
      onSubmit={enviar}
      sucio={() => JSON.stringify(f) !== original.current}
      focoInicial={nombreRef}
      className="modal-ancho"
    >
      <div className="crm-form">
        <label>
          <span>Tipo</span>
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoCuenta)}>
            <option value="persona">Persona</option>
            <option value="empresa">Empresa</option>
          </select>
        </label>
        <label>
          <span>Nombre *</span>
          <input {...campoPersona('crm-cuenta-nombre')} ref={nombreRef} required maxLength={200} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        {texto('documento', f.tipo === 'persona' ? 'Cédula' : 'NIT', { maxLength: 30 })}
        <label>
          <span>Etapa</span>
          <select value={f.etapa} onChange={(e) => set('etapa', e.target.value)}>
            {etapasOrdenadas(ajustes).map((x) => (
              <option key={x.clave} value={x.clave}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Origen</span>
          <select value={f.origen} onChange={(e) => set('origen', e.target.value)}>
            <option value="">—</option>
            {ajustes.origenes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        {f.tipo === 'empresa' && (
          <label>
            <span>Tipo de empresa</span>
            <select value={f.tipo_empresa} onChange={(e) => set('tipo_empresa', e.target.value)}>
              <option value="">—</option>
              {ajustes.tipos_empresa.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Responsable</span>
          <select value={f.responsable_id} onChange={(e) => set('responsable_id', e.target.value)}>
            <option value="">—</option>
            {responsables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        {texto('telefono', 'Teléfono', { maxLength: 40, type: 'tel' })}
        {texto('email', 'Correo', { maxLength: 254, type: 'email' })}
        {texto('direccion', 'Dirección', { maxLength: 300 })}
        {texto('ciudad', 'Ciudad', { maxLength: 120 })}
        {texto('pais', 'País (código)', { maxLength: 2, pattern: '[A-Za-z]{2}' })}
        {texto('etiquetas', 'Etiquetas (separadas por coma)')}
        <label>
          <span>Notas</span>
          <textarea {...campoPersona('crm-cuenta-notas')} maxLength={4000} rows={3} value={f.notas} onChange={(e) => set('notas', e.target.value)} />
        </label>
        <CamposPersonalizados
          defs={defs}
          entidad="cuenta"
          valores={f.campos}
          errores={errores}
          alCambiar={(k, v) => setF((x) => ({ ...x, campos: { ...x.campos, [k]: v } }))}
        />
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
