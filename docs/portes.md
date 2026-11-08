# Portes de seguridad entre team-portal y el producto

Regla (PP-DEC-06): todo arreglo de seguridad (autorización, RLS, CSP y cabeceras, secretos, validación de entradas) hecho en un repo se evalúa en el otro. Aquí se registra la revisión del lado del producto.

## Cómo revisar

```
git -C C:\Users\enzov\IA\luce-design\team-portal log <último hash revisado>..main --oneline -- netlify/lib supabase netlify.toml vite.config.ts tools/seguridad
```

Cada commit que salga se anota en la tabla como «portado (hash del commit del producto)» o «no aplica (motivo)», y el último hash revisado se actualiza.

## Último hash de team-portal revisado

9d1524b (2026-11-07), el hash del commit de origen 0.1.19 (N-1). Antes: f3262bc.

## Portes

| Fecha | Commit de team-portal | Qué arregla | Resultado |
|---|---|---|---|
| 2026-11-07 | b545dfa (migración 87) | Funciones nuevas sin EXECUTE para public y anon | portado en 0.1.12 (01-seguridad.sql §1) |
| 2026-11-07 | 241e030 (migración 88) | Borrados solo-admin; «gestores actualizan perfiles» con is_admin() | portado en 0.1.12 (01-seguridad.sql §2 y 00-base.sql §7) |
| 2026-11-07 | 64e951d (migración 89) | Lectura acotada de storage (avatares propios y gestores) | portado en 0.1.20 (09-storage-base.sql §3: avatares propios; la de los gestores de blog y productos llega con esos módulos) |
| 2026-11-07 | bdf5a66 (migración 90) | Perfil ampliado con enlaces validados | portado en 0.1.20 (05-perfiles.sql); el código que lee las columnas llega con el porte de perfiles ampliados (V5) |
| 2026-11-07 | d78d63c (1.12.6) | Cupo de IA cerrado, cuerpos estrictos, errores genéricos, logs limpios, TLS y auditoría | portado en 0.1.19 (commit de origen) para autorizacion, errores, email, ia y las funciones copiadas; las demás funciones lo reciben al portarse desde un hash posterior |
| 2026-11-07 | 5d73353 (1.12.7) | X-Frame-Options, 404 forzado de rutas internas, img-src acotado | ya presente desde 0.1.2 (netlify.toml y vite.config.ts; netlify/__tests__/cabeceras.test.ts) |
| 2026-11-07 | c70a6aa (1.12.8) | Escáner de secretos en hooks y CI, guardarraíl para PowerShell, .env.example clasificado | escáner y .env.example clasificado desde 0.1.2; guardarraíl con matcher Bash y PowerShell desde 0.1.11; paso del escáner en la CI en 0.1.19. Los hooks de git (.githooks) no se portan: el producto no los tiene todavía |
| 2026-11-07 | 52b30d4, 0cc9e4b, b8474e3 (1.12.14 a 1.12.16) | CSP estricta de las apps estáticas y delegación por data-accion | no aplica: el producto no tiene apps estáticas ni CSP de /apps |
| 2026-11-07 | b633266, 1a3e0ed (migraciones 91 a 93) | Catálogo, variantes, listas de precio y documentos de producto | no aplica todavía: llegan con el módulo productos (M-1) |
