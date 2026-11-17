# Handoff — TailorSuite

Estado vigente al 2026-11-17 (hora de Bogotá). Lo mantiene la sesión directora «TailorSuite»: se actualiza al cerrar cada fase u ola, antes de lanzar la siguiente. Sin secretos ni datos de personas.

## Qué es esta sesión

Directora: orquesta agentes de investigación, desarrollo y pruebas de TailorSuite. No toca el código del portal de origen; eso lo lleva la sesión «Portal hardening, productos y perfiles». Los informes de los agentes van a archivos, no al chat.

## Estado de los repos

| Repo | Carpeta | Estado |
|---|---|---|
| TailorSuite (producto) | `C:\Users\enzov\IA\personal\portal-producto` | `main` en 0.2.13 (f0a1616). En GitHub hasta 0.2.10 (2ea0b0c). Sin subir: 0.2.11 a 0.2.13 (cabeceras, de otra sesión). `docs/analisis/crm-trycompai.md` sin versionar, de otra sesión. |
| CRM de DAI CARE | `C:\Users\enzov\IA\clientes\daicare-crm` | En 0.2.10, dos pasos sin subir (0.2.9 y 0.2.10). Su push publica en Netlify: solo con orden explícita. |
| Portal de origen | lo lleva su sesión | 1.12.49 (autocompletado cerrado, 6324fcd) y 1.12.50 publicados. Los ejemplos en gris del perfil siguen. |

## Pendientes heredados

- Base de DAI CARE (los corre el usuario): `npm.cmd run instalar` (aplica 06b), `node --env-file=.env tools/instalar/modulos.mjs --activar crm` (aplica 21b), `--verificar` y la simulación de permisos, que debe dar 96 OK. No consta el resultado.
- Push de `clientes\daicare-crm`: pendiente de orden.
- Push de TailorSuite 0.2.11 a 0.2.13: pendiente de orden.
- Antes de entregar a DAI CARE: Site URL y SMTP de Auth, borrar las cuentas de prueba, texto del consentimiento informado, sitio público y DNS.

## Plan en curso (aprobado el 2026-11-17)

Plan completo: `C:\Users\enzov\.claude\plans\en-la-repo-tailorsuite-peppy-lemon.md`.

| Frente | Qué | Estado |
|---|---|---|
| 0 | Handoff, memoria, commit; el usuario compacta con `/compact` | hecho el handoff |
| 2 | Perfil sin sugerencias ni ejemplos: comprobar si Chrome ignora `autoComplete="off"` en nombre, teléfono y dirección; quitar los `placeholder` del perfil; ayudante único; ampliar `formularios-neutros.test.ts`. Luego `git pull` en DAI CARE y encargo al portal. | pendiente |
| 3 | Nombre nuevo, corto: tres generadores, filtro, tres verificadores (software homónimo, dominios, GitHub, marcas), un juez; cinco finalistas para que elija el usuario. El renombre en código es un paso posterior. | pendiente |
| 1 | Análisis de odoo, twenty, erpnext, monica y huly: clones parciales en `C:\Users\enzov\IA\personal\investigacion-erp\`, ola A lectura, ola B verificación, ola C síntesis. Entregable en `docs/analisis/erp-crm-opensource/`. Se estudian ideas y patrones; no se copia código (LGPL, GPL, AGPL, EPL). | pendiente |

## Reparto de modelos

Lectura masiva y verificación: Sonnet. Mecánico: Haiku. Síntesis, implementación y revisión: Opus. Fable solo en la directora. Reserva del 10 % semanal; se mide el consumo entre olas y, si el semanal pasa de 75 %, lo que falte espera al reinicio del 2026-11-21. Consumo al empezar: semanal 39 %, Fable 28 %.

## Reglas que no se olvidan

- No leer `.env`, ni las carpetas de respaldo y claves vetadas en las reglas personales. Las credenciales las teclea el usuario; el DDL lo corre él.
- Push a `main`, deploy y cualquier acción difícil de revertir: solo con orden explícita y confirmada aparte.
- Sin tareas programadas ni polling.
- Las áreas no se mezclan: nada del portal de origen en TailorSuite ni en los clientes. Datos de salud y de personas del cliente, nunca en el chat.
- Un archivo de esquema ya aplicado no se edita: las correcciones van en archivos con letra (06b, 21b).
- En PowerShell, `npm.cmd`. Los scripts con barras invertidas se escriben como archivo, no en heredoc.
