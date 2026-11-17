# Handoff — TailorSuite

Estado vigente al 2026-11-17 (hora de Bogotá). Lo mantiene la sesión directora «TailorSuite»: se actualiza al cerrar cada fase u ola, antes de lanzar la siguiente. Sin secretos ni datos de personas.

## Qué es esta sesión

Directora: orquesta agentes de investigación, desarrollo y pruebas de TailorSuite. No toca el código del portal de origen; eso lo lleva la sesión «Portal hardening, productos y perfiles». Los informes de los agentes van a archivos, no al chat.

## Estado de los repos

| Repo | Carpeta | Estado |
|---|---|---|
| TailorSuite (producto) | `personal/portal-producto` | `main` en 0.2.16 (c06243b). En GitHub hasta 0.2.10. Sin subir: 0.2.11 a 0.2.16. `docs/analisis/` sin versionar. |
| CRM de DAI CARE | `clientes/daicare-crm` | En 0.2.16, ocho pasos sin subir. Su push publica en Netlify: solo con orden explícita. |
| Portal de origen | lo lleva su sesión | 1.12.49 (autocompletado cerrado, 6324fcd) y 1.12.50 publicados. Los ejemplos en gris del perfil siguen. |

## Pendientes heredados

- Base de DAI CARE (los corre el usuario): `npm.cmd run instalar` (aplica 06b), `node --env-file=.env tools/instalar/modulos.mjs --activar crm` (aplica 21b), `--verificar` y la simulación de permisos, que debe dar 96 OK. No consta el resultado.
- Push de `clientes\daicare-crm`: pendiente de orden.
- Push de TailorSuite 0.2.11 a 0.2.16: pendiente de orden.
- Antes de entregar a DAI CARE: Site URL y SMTP de Auth, borrar las cuentas de prueba, texto del consentimiento informado, sitio público y DNS.

## Plan en curso (aprobado el 2026-11-17)

Plan completo: `C:\Users\enzov\.claude\plans\en-la-repo-tailorsuite-peppy-lemon.md`.

| Frente | Qué | Estado |
|---|---|---|
| 0 | Handoff, memoria, commit | hecho (0.2.14 ef53c2c) |
| 2 | Perfil sin sugerencias ni ejemplos | hecho en el producto: 0.2.15 c1e34bf y 0.2.16 c06243b (ayudante campoPersona en src/lib/campos.ts, PP-DEC-20). Traído a clientes/daicare-crm por pull local, batería en verde (1265 pruebas). Falta: prueba del usuario en un Chrome real con autorrelleno guardado; si el teléfono o el correo aún sugieren, cambiar su type. Encargo al portal enviado el 2026-11-17, sin acuse: reenviar si su sesión no lo recoge. |
| 3 | Nombre nuevo | finalistas en docs/analisis/nombre-nuevo.md: Trenza (recomendado), Telar, Trama, Sovia, Medida. Espera la elección del usuario; luego WHOIS y SIC, y el renombre en código como paso propio. |
| 1 | Análisis de odoo, twenty, erpnext, monica y huly. Workflow `analisis-erp-crm` (script en la carpeta de workflows de la sesión, se relanza con args repos). Entregable en `docs/analisis/erp-crm-opensource/` | Ola 1 hecha el 2026-11-17: `odoo.md` (ODO-01 a 25) y `erpnext.md` (ERP-01 a 25), 408 elementos verificados, 40 corregidos, 0 descartados; informes crudos en `crudo/`. Falta la ola 2 (twenty, monica, platform; unos 6 M de tokens, espera al reinicio de la ventana de 5 horas) y la ola 3: `comparativa.md` y `backlog.md`. Hallazgos a decidir: modulos.ts declara esquemas 22 a 26 que no existen en supabase/esquema; las dos fichas piden reabrir para el producto la decisión «las notas crédito parciales no restan de la factura». |

## Reparto de modelos

Lectura masiva y verificación: Sonnet. Mecánico: Haiku. Síntesis, implementación y revisión: Opus. Fable solo en la directora. Reserva del 10 % semanal; se mide el consumo entre olas y, si el semanal pasa de 75 %, lo que falte espera al reinicio del 2026-11-21. Consumo al empezar: semanal 39 %, Fable 28 %. Tras los frentes 2 y 3 (12 agentes, 1,2 M de tokens): semanal 42 %. Ola 1 del frente 1 (23 agentes, 5,8 M de tokens): semanal 49 %, ventana de 5 horas 77 %. Clones del frente 1 listos en personal/investigacion-erp (odoo parcial, erpnext, twenty, monica, platform).

## Reglas que no se olvidan

- No leer `.env`, ni las carpetas de respaldo y claves vetadas en las reglas personales. Las credenciales las teclea el usuario; el DDL lo corre él.
- Push a `main`, deploy y cualquier acción difícil de revertir: solo con orden explícita y confirmada aparte.
- Sin tareas programadas ni polling.
- Las áreas no se mezclan: nada del portal de origen en TailorSuite ni en los clientes. Datos de salud y de personas del cliente, nunca en el chat.
- Un archivo de esquema ya aplicado no se edita: las correcciones van en archivos con letra (06b, 21b).
- En PowerShell, `npm.cmd`. Los scripts con barras invertidas se escriben como archivo, no en heredoc.
