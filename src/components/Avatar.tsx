// Avatar del usuario: la foto si la tiene, o un círculo con sus iniciales.
// Sin foto no muestra un emoji ni un placeholder genérico (identidad sobria).

function iniciales(nombre: string | null, email?: string): string {
  const base = (nombre ?? '').trim() || (email ?? '').split('@')[0] || '?'
  const partes = base.split(/\s+/).filter(Boolean)
  const ini = partes.length >= 2 ? partes[0][0] + partes[1][0] : base.slice(0, 2)
  return ini.toUpperCase()
}

interface Props {
  url: string | null
  name: string | null
  email?: string
  size?: number
}

export default function Avatar({ url, name, email, size = 32 }: Props) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }
  if (url) {
    return (
      <img
        className="avatar avatar-img"
        style={style}
        src={url}
        alt={name ?? 'Avatar'}
        loading="lazy"
      />
    )
  }
  return (
    <span className="avatar avatar-initials" style={style} aria-hidden="true">
      {iniciales(name, email)}
    </span>
  )
}
