import { createClient } from '@supabase/supabase-js'

// Purga diaria del detalle de uso del portal (migración 73): borra las
// filas de portal_uso más antiguas que nucleo.retencion_uso_dias (90 si no
// hay límite, nunca menos de 30; lo decide 07-widgets-uso.sql) con
// uso_purgar() sin argumentos, que solo la service role puede ejecutar. Una función
// programada no se puede invocar por HTTP (Netlify responde 403); a mano
// se corre `select public.uso_purgar();` en el SQL Editor.

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('uso-purga: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    return Response.json({ error: 'Función no configurada' }, { status: 500 })
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data, error } = await admin.rpc('uso_purgar')
  if (error) {
    // PGRST202 (PostgREST) o 42883 (Postgres): la función aún no existe.
    // Falla suave: la purga empieza sola cuando se aplique la 73.
    if (error.code === 'PGRST202' || error.code === '42883') {
      console.warn('uso-purga: falta la migración 73 (uso_purgar); no se purga')
      return Response.json({ omitida: 'falta la migración 73' })
    }
    console.error('uso-purga: uso_purgar falló:', error.message)
    return Response.json({ error: 'No se pudo purgar el uso' }, { status: 500 })
  }

  const borradas = typeof data === 'number' ? data : 0
  console.log('uso-purga:', borradas, 'fila(s) fuera de la retención borradas')
  return Response.json({ borradas })
}

// Diario a las 08:00 UTC (03:00 Colombia)
// Función programada de Netlify: solo se lee schedule (sin @netlify/functions)
export const config = {
  schedule: '0 8 * * *',
}
