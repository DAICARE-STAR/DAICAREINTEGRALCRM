import { describe, expect, it } from 'vitest'
import { avisoParcial } from '../invitacion'

describe('avisoParcial', () => {
  it('todo guardado → sin aviso', () => {
    expect(avisoParcial({ rolesAsignados: true, nombreGuardado: true })).toBeNull()
    expect(avisoParcial(null)).toBeNull()
  })
  it('roles o nombre sin guardar → lo dice', () => {
    expect(avisoParcial({ rolesAsignados: false, nombreGuardado: true })).toContain('los roles')
    expect(avisoParcial({ rolesAsignados: false, nombreGuardado: false })).toContain('los roles ni el nombre')
  })
})
