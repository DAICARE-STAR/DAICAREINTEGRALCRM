import { useEffect, useState, type FormEvent } from 'react'
import { SkeletonLineas } from '../../components/Skeleton'
import { useInstalacion } from '../../context/InstalacionContext'
import { logAction } from '../../lib/audit'
import { guardarInstalacion, uploadLogoInstalacion } from '../../lib/data'
import { CLAVES_LOGO, LOGOS, logoDe, logosValidos, SUPABASE_URL, type ClaveLogo, type Logos } from '../../lib/instalacion'
import { supabase } from '../../lib/supabase'
import CabeceraAdmin from './CabeceraAdmin'

// Administración → Instalación (N-4), solo administrador: datos de la
// empresa y logos (bucket marca). La fila es única (id = 1) y la base
// valida cada campo con su CHECK (04-instalacion-modulos.sql).

interface Fila {
  nombre: string
  nombre_corto: string
  rubro: string
  pais: string
  locale: string
  zona_horaria: string
  moneda_base: string
  divisas: string[]
  correo_responsable: string
  contactos: unknown[]
  logos: unknown
}

type Campo = 'nombre' | 'nombre_corto' | 'rubro' | 'pais' | 'locale' | 'zona_horaria' | 'moneda_base' | 'divisas' | 'correo_responsable' | 'contactos'
type Campos = Record<Campo, string>

// Cinco campos por grupo
const GRUPOS: { titulo: string; campos: { id: Campo; etiqueta: string; multilinea?: boolean }[] }[] = [
  {
    titulo: 'Empresa',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre' },
      { id: 'nombre_corto', etiqueta: 'Nombre corto' },
      { id: 'rubro', etiqueta: 'Rubro' },
      { id: 'pais', etiqueta: 'País (código de 2 letras)' },
      { id: 'locale', etiqueta: 'Idioma regional (es-CO)' },
    ],
  },
  {
    titulo: 'Región y contacto',
    campos: [
      { id: 'zona_horaria', etiqueta: 'Zona horaria' },
      { id: 'moneda_base', etiqueta: 'Moneda base' },
      { id: 'divisas', etiqueta: 'Divisas (separadas por coma)' },
      { id: 'correo_responsable', etiqueta: 'Correo del responsable' },
      { id: 'contactos', etiqueta: 'Contactos (uno por línea)', multilinea: true },
    ],
  },
]

// Mensaje por CHECK de la tabla (código 23514)
const CHECKS: Record<string, string> = {
  instalacion_nombre_check: 'El nombre debe tener entre 1 y 120 caracteres.',
  instalacion_nombre_corto_check: 'El nombre corto admite hasta 40 caracteres.',
  instalacion_pais_check: 'El país va en dos letras mayúsculas (CO).',
  instalacion_locale_check: 'El idioma regional va como es o es-CO.',
  instalacion_zona_check: 'La zona horaria no existe (por ejemplo America/Bogota).',
  instalacion_moneda_check: 'La moneda base va en tres letras mayúsculas (COP).',
  instalacion_divisas_check: 'Cada divisa va en tres letras mayúsculas, separadas por coma.',
  instalacion_correo_check: 'El correo del responsable no es válido.',
  instalacion_tema_check: 'La base rechazó el tema: solo admite primitivas de la lista con colores #rrggbb.',
}

export function mensajeGuardado(e: unknown): string {
  const err = e as { code?: string; message?: string } | null
  if (err?.code === '23514') {
    const nombre = Object.keys(CHECKS).find((c) => err.message?.includes(c))
    return nombre ? CHECKS[nombre] : 'Algún dato no tiene el formato esperado.'
  }
  return err?.message || 'No se pudo guardar.'
}

const aCampos = (f: Fila): Campos => ({
  nombre: f.nombre,
  nombre_corto: f.nombre_corto,
  rubro: f.rubro,
  pais: f.pais,
  locale: f.locale,
  zona_horaria: f.zona_horaria,
  moneda_base: f.moneda_base,
  divisas: f.divisas.join(', '),
  correo_responsable: f.correo_responsable,
  contactos: f.contactos.filter((c): c is string => typeof c === 'string').join('\n'),
})

const deCampos = (c: Campos) => ({
  nombre: c.nombre.trim(),
  nombre_corto: c.nombre_corto.trim(),
  rubro: c.rubro.trim(),
  pais: c.pais.trim().toUpperCase(),
  locale: c.locale.trim(),
  zona_horaria: c.zona_horaria.trim(),
  moneda_base: c.moneda_base.trim().toUpperCase(),
  divisas: c.divisas.split(',').map((d) => d.trim().toUpperCase()).filter(Boolean),
  correo_responsable: c.correo_responsable.trim(),
  contactos: c.contactos.split('\n').map((l) => l.trim()).filter(Boolean),
})

export default function InstalacionTab() {
  const { recargar } = useInstalacion()
  const [campos, setCampos] = useState<Campos | null>(null)
  const [logos, setLogos] = useState<Logos>({})
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState<ClaveLogo | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data, error: e } = await supabase
        .from('instalacion')
        .select('nombre, nombre_corto, rubro, pais, locale, zona_horaria, moneda_base, divisas, correo_responsable, contactos, logos')
        .eq('id', 1)
        .maybeSingle()
      if (!vivo) return
      if (e || !data) {
        setError('No se pudieron leer los datos de la instalación.')
        return
      }
      const fila = data as Fila
      setCampos(aCampos(fila))
      setLogos(logosValidos(fila.logos, SUPABASE_URL))
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!campos) return
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      await guardarInstalacion(deCampos(campos))
      void logAction('instalacion.actualizar', 'Actualizó los datos de la instalación', 'instalacion', '1')
      setAviso('Datos guardados.')
      recargar()
    } catch (err) {
      setError(mensajeGuardado(err))
    } finally {
      setGuardando(false)
    }
  }

  async function subirLogo(clave: ClaveLogo, file: File | undefined) {
    if (!file) return
    setSubiendo(clave)
    setError(null)
    setAviso(null)
    try {
      const url = await uploadLogoInstalacion(file)
      const nuevos = { ...logos, [clave]: url }
      await guardarInstalacion({ logos: nuevos })
      void logAction('instalacion.actualizar', `Cambió el logo ${clave}`, 'instalacion', '1')
      setLogos(nuevos)
      setAviso(`${LOGOS[clave].etiqueta}: actualizado.`)
      recargar()
    } catch (err) {
      setError(mensajeGuardado(err))
    } finally {
      setSubiendo(null)
    }
  }

  return (
    <section>
      <CabeceraAdmin titulo="Instalación" />
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="notice" role="status">
          {aviso}
        </p>
      )}
      {!campos ? (
        !error && <SkeletonLineas n={6} />
      ) : (
        <>
          <form className="admin-form" onSubmit={(e) => void guardar(e)}>
            {GRUPOS.map((g) => (
              <fieldset key={g.titulo} className="form-grid">
                <legend className="form-label">{g.titulo}</legend>
                {g.campos.map((c) => (
                  <label key={c.id} className={`form-field${c.multilinea ? ' form-field-wide' : ''}`}>
                    <span className="form-label">{c.etiqueta}</span>
                    {c.multilinea ? (
                      <textarea rows={3} value={campos[c.id]} onChange={(e) => setCampos({ ...campos, [c.id]: e.target.value })} />
                    ) : (
                      <input value={campos[c.id]} onChange={(e) => setCampos({ ...campos, [c.id]: e.target.value })} />
                    )}
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="form-actions">
              <button className="btn-primary" type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>

          <h3>Logos</h3>
          <div className="table-scroll">
            <table className="table">
              <tbody>
                {CLAVES_LOGO.map((clave) => (
                  <tr key={clave}>
                    <td>{LOGOS[clave].etiqueta}</td>
                    <td>
                      <img src={logoDe(logos, clave)} alt="" height={32} style={{ maxWidth: 120, objectFit: 'contain' }} />
                    </td>
                    <td className="actions">
                      <label className="btn-ghost btn-small">
                        {subiendo === clave ? 'Subiendo…' : 'Subir'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="sr-only"
                          disabled={subiendo !== null}
                          aria-label={`Subir ${LOGOS[clave].etiqueta}`}
                          onChange={(e) => {
                            void subirLogo(clave, e.target.files?.[0])
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
