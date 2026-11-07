# Portes de seguridad entre team-portal y el producto

Regla (PP-DEC-06): todo arreglo de seguridad (autorización, RLS, CSP y cabeceras, secretos, validación de entradas) hecho en un repo se evalúa en el otro. Aquí se registra la revisión del lado del producto.

## Cómo revisar

```
git -C C:\Users\enzov\IA\luce-design\team-portal log <último hash revisado>..main --oneline -- netlify/lib supabase netlify.toml vite.config.ts tools/seguridad
```

Cada commit que salga se anota en la tabla como «portado (hash del commit del producto)» o «no aplica (motivo)», y el último hash revisado se actualiza.

## Último hash de team-portal revisado

f3262bc (2026-11-07). Nada que portar: el producto nace en este hash.

## Portes

| Fecha | Commit de team-portal | Qué arregla | Resultado |
|---|---|---|---|
| (ninguno todavía) | | | |
