import type { Session } from '@supabase/supabase-js'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { cerrarSesion, esErrorAuthPasajero, instalarObservadorFunciones } from '../lib/funciones'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { Permission, Profile } from '../types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  // true = hay sesión de contraseña (aal1) pero el usuario tiene un segundo
  // factor verificado: falta el código TOTP para llegar a aal2. Mientras
  // tanto el RLS (migración 43) bloquea los datos, así que la app muestra
  // la pantalla de desafío en lugar del contenido.
  mfaPending: boolean
  hasPerm: (perm: Permission | Permission[]) => boolean
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  verifyMfa: (code: string) => Promise<{ error: string | null }>
  // destino: adónde recargar si Auth no cierra la sesión (por defecto /login)
  signOut: (destino?: string) => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

interface UserRoleRel {
  role: string
  roles: { permissions: string[] | null } | null
}
interface ProfileRow {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string
  user_roles?: UserRoleRel[] | null
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  // Trae el perfil con TODOS sus roles y la unión de permisos (migración 26,
  // multi-rol). Si la base aún no la tiene, reintenta sin el join.
  const withRoles = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, user_roles ( role, roles ( permissions ) )')
    .eq('id', userId)
    .single()

  const row = (withRoles.data as ProfileRow | null) ?? null
  if (!withRoles.error && row) {
    const urs = row.user_roles ?? []
    const roles = urs.map((u) => u.role)
    const permissions = [...new Set(urs.flatMap((u) => u.roles?.permissions ?? []))]
    return {
      id: row.id,
      full_name: row.full_name,
      avatar_url: row.avatar_url ?? null,
      role: row.role,
      // Antes de la migración 26 no hay user_roles: cae al rol único.
      roles: roles.length ? roles : row.role ? [row.role] : [],
      permissions,
    }
  }

  // Reintento sin avatar_url ni join: cubre bases sin migración 18/19/26.
  const plain = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .single()
  if (plain.error) console.error('No se pudo cargar el perfil:', plain.error.message)
  const p = (plain.data as ProfileRow | null) ?? null
  return p
    ? {
        id: p.id,
        full_name: p.full_name,
        avatar_url: null,
        role: p.role,
        roles: p.role ? [p.role] : [],
        permissions: [],
      }
    : null
}

// Cierra la sesión revocando el refresh token (alcance global) y nunca la
// deja abierta: si Auth no la cierra (caído, 5xx, 429 o sin respuesta en
// 4 s), cerrarSesion() borra la clave local y aquí se recarga en `destino`
// para que el shell arranque sin ella. En ese caso la promesa no se
// resuelve: la página ya se va y quien llama no debe seguir navegando.
async function cerrarSesionPortal(destino = '/login'): Promise<void> {
  if ((await cerrarSesion(() => supabase.auth.signOut())) === 'auth') return
  void supabase.auth.stopAutoRefresh().catch(() => {})
  window.location.replace(destino)
  return new Promise<void>(() => {})
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfaPending, setMfaPending] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // Si getSession rechaza (red/almacenamiento), no dejar la app atascada
      // en el spinner: se pasa a "sin sesión" y el usuario puede reintentar.
      .catch((err) => console.error('getSession falló:', err))
      .finally(() => setLoading(false))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Negativas de las funciones con `codigo` (netlify/lib/autorizacion.mts),
  // vistas en cualquier llamada a /api/* sin tocar a quien la hizo:
  // · mfa_requerida: factor verificado con sesión aal1 → pide el código
  //   (MfaGate) en vez de cerrar la sesión. Si la sesión ya es aal2 (o ya
  //   no hay sesión), la respuesta era de un token anterior y se ignora.
  // · auth_lento (503): Auth caído un momento; la sesión sigue.
  // · sesion_invalida: se cierra, pero solo si Auth lo confirma; un fallo
  //   de red, un 5xx o un 429 de Auth no echan a nadie.
  useEffect(() => {
    if (!supabaseConfigured) return
    return instalarObservadorFunciones(async (tipo) => {
      if (tipo === 'mfa') {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (data?.currentLevel === 'aal1') setMfaPending(true)
      } else if (tipo === 'sesion') {
        const { data, error } = await supabase.auth.getUser()
        if (!error && data.user) return
        if (error && esErrorAuthPasajero(error)) return
        await cerrarSesionPortal()
      }
    })
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setMfaPending(false)
      return
    }
    let cancelled = false
    // ¿La sesión necesita subir a aal2? (usuario con factor verificado que
    // entró solo con contraseña — también al restaurar sesión guardada)
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data }) => {
        if (!cancelled && data) {
          setMfaPending(data.currentLevel === 'aal1' && data.nextLevel === 'aal2')
        }
      })
      .catch(() => {
        if (!cancelled) setMfaPending(false)
      })
    fetchProfile(session.user.id).then((p) => {
      if (!cancelled) setProfile(p)
    })
    return () => {
      cancelled = true
    }
  }, [session])

  function hasPerm(perm: Permission | Permission[]): boolean {
    if (!profile) return false
    // admin (entre sus roles) = superusuario. Los demás: unión de permisos.
    if (profile.roles.includes('admin')) return true
    const list = Array.isArray(perm) ? perm : [perm]
    return list.some((p) => profile.permissions.includes(p))
  }

  // Recarga el perfil (tras editar nombre/avatar) sin volver a iniciar sesión
  async function refreshProfile() {
    if (!session) return
    const p = await fetchProfile(session.user.id)
    setProfile(p)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  // Completa el segundo paso con el código de la app de autenticación.
  // Al verificar, Supabase emite una sesión aal2 (onAuthStateChange la
  // recoge) y el perfil se recarga ya con el RLS abierto.
  async function verifyMfa(code: string) {
    const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
    if (fErr) return { error: fErr.message }
    const totp = factors?.totp.find((f) => f.status === 'verified') ?? factors?.totp[0]
    if (!totp) return { error: 'No hay un segundo factor configurado.' }
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
    if (cErr || !ch) return { error: cErr?.message ?? 'No se pudo iniciar el desafío.' }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: ch.id,
      code,
    })
    if (vErr) return { error: 'Código incorrecto o vencido.' }
    setMfaPending(false)
    return { error: null }
  }

  async function signOut(destino?: string) {
    await cerrarSesionPortal(destino)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        mfaPending,
        hasPerm,
        refreshProfile,
        signIn,
        verifyMfa,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
