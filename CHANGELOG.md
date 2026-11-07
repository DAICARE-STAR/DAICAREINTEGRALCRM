# Changelog

Formato: cada commit a `main` es un Paso `Mayor.Fase.Paso — descripción`. La fase en curso va arriba. Al cerrar una fase se etiqueta `vMayor.Fase` con `git push --follow-tags`. Las migraciones se citan como «(migración N)». La viñeta se escribe antes del push, con el hash.

## 0.1 — Arranque (2026-11-07)

- 0.1.1 — Proyecto creado desde la plantilla del sistema IA. (33b997a)
- 0.1.2 — Base técnica: package.json, tsconfigs, Vite con CSP del shell y nombre por VITE_PORTAL_NOMBRE, netlify.toml con cabeceras base y 404 forzados, .env.example clasificado, launch.json (5190 y 4190), escáner de secretos con su prueba, pruebas de contrato de cabeceras y de entorno, AGENTS.md con decisiones PP-DEC-01 a 14, docs/origen.md y docs/portes.md, página mínima. (0d72dda)
- 0.1.3 — Módulos: registro src/lib/modulos.ts (14 módulos del portal y 7 ERP planeados, sintaxis borrable para Node 24) con helpers puros de dependencias, activación, límites, widgets, acciones y tablas, y su prueba.
