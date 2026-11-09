// Respuesta 200 de invitar-miembro con una parte sin guardar: el invitado
// existe, pero el admin debe saber qué completar a mano en Miembros.
export function avisoParcial(r: { rolesAsignados?: boolean; nombreGuardado?: boolean } | null): string | null {
  const faltan = [r?.rolesAsignados === false && 'los roles', r?.nombreGuardado === false && 'el nombre'].filter(Boolean)
  return faltan.length ? `No se guardaron ${faltan.join(' ni ')}: complétalos en Miembros.` : null
}
