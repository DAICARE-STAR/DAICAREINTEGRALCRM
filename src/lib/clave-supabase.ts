// La clave que viaja al navegador (VITE_SUPABASE_ANON_KEY) solo puede ser la
// pública. Una clave secreta se salta todos los permisos de la base: si alguien
// la pega ahí por error, el build la descarta (vite.config.ts) y la app arranca
// como si faltara la configuración, en vez de publicarla (0.2.28).
const PREFIJO_SECRETA = 'sb_' + 'secret_'

export function esClaveSecreta(valor: unknown): boolean {
  if (typeof valor !== 'string') return false
  const v = valor.trim()
  if (v.startsWith(PREFIJO_SECRETA)) return true
  // Formato antiguo: un JWT cuyo rol es service_role
  const partes = v.split('.')
  if (partes.length !== 3 || !v.startsWith('eyJ')) return false
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const cuerpo = JSON.parse(atob(base64)) as { role?: unknown }
    return cuerpo.role === 'service_role'
  } catch {
    return false
  }
}
