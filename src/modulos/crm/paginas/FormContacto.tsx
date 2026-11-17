import { useRef, useState, type FormEvent } from 'react'
import Dialogo from '../../../components/Dialogo'
import { limpiarCampos, validarCampos, validarValor } from '../lib/campos'
import { guardarContacto, traducirError } from '../lib/datos'
import type { AjustesCrm, CampoDef, Contacto } from '../lib/tipos'
import { partirEtiquetas, textoNulo } from '../lib/vistas'
import CamposPersonalizados from './CamposPersonalizados'
import { campoPersona } from '../../../lib/campos'

export default function FormContacto({
  cuentaId,
  contacto,
  ajustes,
  defs,
  onClose,
  onGuardado,
}: {
  cuentaId: string
  contacto: Contacto | null
  ajustes: AjustesCrm
  defs: CampoDef[]
  onClose: () => void
  onGuardado: (c: Contacto) => void
}) {
  const [f, setF] = useState(() => ({
    nombre: contacto?.nombre ?? '',
    relacion: contacto?.relacion ?? '',
    cargo: contacto?.cargo ?? '',
    email: contacto?.email ?? '',
    telefono: contacto?.telefono ?? '',
    principal: contacto?.principal ?? false,
    etiquetas: (contacto?.etiquetas ?? []).join(', '),
    notas: contacto?.notas ?? '',
    campos: { ...(contacto?.campos ?? {}) } as Record<string, unknown>,
  }))
  const original = useRef(JSON.stringify(f))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const campos = limpiarCampos(f.campos)
    const errs = validarCampos(defs, 'contacto', campos)
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    const normalizados: Record<string, unknown> = {}
    for (const d of defs.filter((x) => x.entidad === 'contacto')) {
      const r = campos[d.clave] === undefined ? null : validarValor(d, campos[d.clave])
      if (r?.ok) normalizados[d.clave] = r.valor
    }
    setGuardando(true)
    setError(null)
    try {
      onGuardado(
        await guardarContacto(contacto?.id ?? null, {
          cuenta_id: cuentaId,
          nombre: f.nombre.trim(),
          relacion: f.relacion || null,
          cargo: textoNulo(f.cargo),
          email: textoNulo(f.email),
          telefono: textoNulo(f.telefono),
          principal: f.principal,
          etiquetas: partirEtiquetas(f.etiquetas),
          notas: textoNulo(f.notas),
          campos: normalizados,
        }),
      )
    } catch (err) {
      setError(traducirError(err, { entidad: 'contacto', etiquetas: Object.fromEntries(defs.map((d) => [d.clave, d.etiqueta])) }))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      titulo={contacto ? 'Editar contacto' : 'Nuevo contacto'}
      onClose={onClose}
      onSubmit={enviar}
      sucio={() => JSON.stringify(f) !== original.current}
      focoInicial={nombreRef}
    >
      <div className="crm-form">
        <label>
          <span>Nombre *</span>
          <input {...campoPersona('crm-contacto-nombre')} ref={nombreRef} required maxLength={200} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        <label>
          <span>Relación</span>
          <select value={f.relacion} onChange={(e) => set('relacion', e.target.value)}>
            <option value="">—</option>
            {ajustes.relaciones.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Cargo</span>
          <input {...campoPersona('crm-contacto-cargo')} maxLength={120} value={f.cargo} onChange={(e) => set('cargo', e.target.value)} />
        </label>
        <label>
          <span>Correo</span>
          <input {...campoPersona('crm-contacto-correo')} type="email" maxLength={254} value={f.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label>
          <span>Teléfono</span>
          <input {...campoPersona('crm-contacto-telefono')} type="tel" maxLength={40} value={f.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </label>
        <label>
          <span>
            <input type="checkbox" checked={f.principal} onChange={(e) => set('principal', e.target.checked)} /> Contacto principal
          </span>
        </label>
        <label>
          <span>Etiquetas (separadas por coma)</span>
          <input {...campoPersona('crm-contacto-etiquetas')} value={f.etiquetas} onChange={(e) => set('etiquetas', e.target.value)} />
        </label>
        <label>
          <span>Notas</span>
          <textarea {...campoPersona('crm-contacto-notas')} rows={3} maxLength={4000} value={f.notas} onChange={(e) => set('notas', e.target.value)} />
        </label>
        <CamposPersonalizados
          defs={defs}
          entidad="contacto"
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
