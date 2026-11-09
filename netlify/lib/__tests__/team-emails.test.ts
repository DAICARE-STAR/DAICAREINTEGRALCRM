import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { teamEmails } from '../email.mts'

// N-6: las cuentas de servicio se excluyen por profiles.es_servicio, no solo
// por la lista fija de correos.
function cliente(servicio: { data: { id: string }[] | null; error: { code: string } | null }) {
  const usuarios = [
    { id: 'u1', email: 'ana@cliente.test' },
    { id: 'u2', email: 'robot@cliente.test' },
    { id: 'u3', email: 'claude-dev@empresa.test' },
  ]
  return {
    auth: { admin: { listUsers: async () => ({ data: { users: usuarios }, error: null }) } },
    from: () => ({ select: () => ({ eq: async () => servicio }) }),
  } as unknown as SupabaseClient
}

describe('teamEmails', () => {
  it('excluye la cuenta marcada es_servicio aunque su correo no esté en la lista', async () => {
    expect(await teamEmails(cliente({ data: [{ id: 'u2' }], error: null }))).toEqual(['ana@cliente.test'])
  })

  it('sin leer es_servicio, excluye al menos la lista fija', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await teamEmails(cliente({ data: null, error: { code: '57014' } }))).toEqual(['ana@cliente.test', 'robot@cliente.test'])
  })
})
