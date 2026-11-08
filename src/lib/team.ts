import type { MemberStatus } from '../types'
import { supabase } from './supabase'

// Datos de la página Equipo: última conexión (member_status). RLS: todos
// leen, cada quien escribe lo suyo. (Los horarios laborales se retiraron
// el 2026-09-10; la tabla work_schedules queda en la base sin uso.)

export async function fetchMemberStatuses(): Promise<MemberStatus[]> {
  const { data, error } = await supabase
    .from('member_status')
    .select('user_id, last_seen_at')
  if (error) throw error
  return (data ?? []) as MemberStatus[]
}

// «hace 5 min», «hoy 14:32», «ayer 09:10», «12 jul»
export function relativeSeen(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'hace un momento'
  if (diff < 3600_000) return `hace ${Math.round(diff / 60_000)} min`
  const time = d.toLocaleTimeString('es-419', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `hoy ${time}`
  const ayer = new Date(now.getTime() - 86400000)
  if (d.toDateString() === ayer.toDateString()) return `ayer ${time}`
  return d.toLocaleDateString('es-419', { day: 'numeric', month: 'short' })
}
