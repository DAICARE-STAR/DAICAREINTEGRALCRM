# 04 · Checklist de despliegue de una instalación

- Revisión: 2026-11-08 · Próxima: 2027-05-08
- La instalación completa paso a paso está en `README.md` («Instalación por cliente»).

## Antes

- [ ] `npm run typecheck`, `npx vitest run`, `npm run build` y `npm run secretos` en verde.
- [ ] `node tools/producto/documentar-modulos.mjs --check` sale 0.
- [ ] Revisión de portes al día (`docs/portes.md`).

## Base

- [ ] Registro público cerrado y TOTP activado.
- [ ] `aplicar.mjs` y `aplicar.mjs --verificar` sin DIFIERE.
- [ ] `cuentas-prueba.mjs` y `supabase/pruebas/rls-simulacion.sql` sin FALLA.
- [ ] Módulos activados con `modulos.mjs`; `--listar` coincide con lo contratado.

## Sitio

- [ ] Variables cargadas en Netlify según `docs/instalacion/variables.md`.
- [ ] Recargar sin caché; confirmar por `content-type` y por el efecto real.
- [ ] `curl -sI` a las rutas internas: ninguna devuelve el shell; consola sin violaciones de CSP.
- [ ] Invitación del primer administrador recibida y aceptada.

## Reglas para agentes

- El deploy y la base los opera el usuario; la IA deja los comandos listos y no aplica SQL.
