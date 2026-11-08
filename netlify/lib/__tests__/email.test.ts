import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Transporte SMTP de sendEmailTo: TLS implícito en 465 y STARTTLS
// obligatorio en los demás puertos. nodemailer se simula: sin red.
const smtp = vi.hoisted(() => ({
  createTransport: vi.fn((_opciones: Record<string, unknown>) => ({ sendMail: vi.fn(async () => ({})) })),
}))
vi.mock('nodemailer', () => ({ createTransport: smtp.createTransport, default: smtp }))

import { sendEmailTo } from '../email.mts'

const CONTENIDO = { subject: 'Prueba', text: 'Hola', html: '<p>Hola</p>' }

describe('sendEmailTo: TLS del SMTP', () => {
  beforeEach(() => {
    vi.stubEnv('SMTP_HOST', 'smtp.empresa.test')
    vi.stubEnv('SMTP_USER', 'marketing@empresa.test')
    vi.stubEnv('SMTP_PASS', 'clave-de-prueba')
    smtp.createTransport.mockClear()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('con 587 exige STARTTLS (requireTLS) y no usa TLS implícito', async () => {
    vi.stubEnv('SMTP_PORT', '587')
    await sendEmailTo(['ana@empresa.test'], CONTENIDO)
    expect(smtp.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }))
  })

  it('con 465 (el valor por defecto) usa TLS implícito', async () => {
    vi.stubEnv('SMTP_PORT', '465')
    await sendEmailTo(['ana@empresa.test'], CONTENIDO)
    expect(smtp.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }))
  })

  it('sin SMTP_PORT toma 465', async () => {
    vi.stubEnv('SMTP_PORT', undefined)
    await sendEmailTo(['ana@empresa.test'], CONTENIDO)
    expect(smtp.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }))
  })
})
