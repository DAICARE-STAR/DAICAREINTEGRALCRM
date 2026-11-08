import { supabase } from './supabase'

// Registro de auditoría general. Llamar con `void logAction(...)` tras una
// acción relevante: es fire-and-forget y NUNCA rompe el flujo que la llamó
// (si falta la migración 18 o no hay red, simplemente no se registra).
//
//   void logAction('rol.crear', 'Creó el rol "ventas"', 'roles', 'ventas')
//
// Convención de acción: '<entidad>.<verbo>' en minúsculas.
export async function logAction(
  action: string,
  detail: string,
  entity = '',
  entityId = ''
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user) return
    await supabase.from('audit_log').insert({
      user_id: user.id,
      user_email: user.email ?? '',
      action,
      detail,
      entity,
      entity_id: entityId,
    })
  } catch {
    /* el registro nunca interrumpe la acción del usuario */
  }
}
