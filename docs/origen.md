# Origen del código

El producto nace de `C:\Users\enzov\IA\luce-design\team-portal` (solo lectura). No hay sincronía byte a byte ni archivos idénticos entre los dos repos: cada paso copia o adapta lo que necesita y anota aquí el hash de team-portal que leyó (`git -C <team-portal> rev-parse --short HEAD`). La regla de portes de arreglos de seguridad vive en `portes.md`.

## Hashes de origen por paso

| Paso | Fecha | Hash de team-portal | Qué se copió o adaptó |
|---|---|---|---|
| 0.1.2 (PR-0) | 2026-11-07 | f3262bc | `tools/seguridad/escanear-secretos.mjs` y `__tests__/escanear-secretos.test.mjs` (adaptados: sin los valores de fábrica de Wazuh ni las rutas permitidas del arnés de servidores). Modelos, no copias: `vite.config.ts` (CSP del shell, origen de Supabase), `netlify.toml` (cabeceras base y 404 forzados de la línea de hardening), `tsconfig.json`, `tsconfig.netlify.json`, `vitest.config.ts`, `.env.example`. |

## Mapa de renombres

Se escribe una sola vez al copiar (PR-2) y vive en `tools/origen/mapa-renombre.json`: primitivas `--ld-*` a `--pal-*`, semánticos `--gold*` a `--acento*`, temas `marfil`, `hueso` y `enfasis` a `claro`, `calido` y `oscuro`, claves de `localStorage` `ld_*` a `pt_*_v1`.

## Portes de módulo

Cada módulo se reescribe en su fase leyendo team-portal en el hash de ese momento.

| Módulo | Fase | Hash de team-portal | Fecha | Notas |
|---|---|---|---|---|
| (ninguno todavía) | | | | |

## Divergencias de esquema

Nombres de tabla y columna que el producto cambia respecto de team-portal (por defecto se conservan).

| Objeto | team-portal | Producto | Motivo |
|---|---|---|---|
| (ninguna todavía) | | | |
