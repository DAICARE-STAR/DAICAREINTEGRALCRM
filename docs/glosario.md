# Glosario de portal-producto

El código, la interfaz y los documentos usan el término canónico. La columna «No decir» evita sinónimos que confunden.

| Término | Definición | No decir |
|---|---|---|
| Instalación | El portal de un cliente: un proyecto Supabase y un sitio Netlify (fila única `instalacion`) | tenant, empresa (en el código) |
| Módulo | Parte del producto que se activa por instalación (`src/lib/modulos.ts`) | app, plugin |
| Núcleo | El módulo siempre activo: miembros, roles, perfiles, avisos, widgets | base, core |
| Límite | Tope entero de un módulo en `modulos_instalacion.limites` (null = sin límite) | cuota, plan |
| Conector | Servicio externo que usa un módulo (correo, calendario) a través del proxy | integración |
| Instalador | `tools/instalar/aplicar.mjs` y `modulos.mjs`, corridos por quien instala | migrador |
| Portes | Revisión cruzada de arreglos de seguridad con el repo de origen (`docs/portes.md`) | sincronización |
| Permiso | Clave `app_<slug>` o verbo_objeto en `roles.permissions` | privilegio |
| Cuenta de servicio | Perfil con `es_servicio`; no cuenta para el límite de miembros | bot, usuario técnico |
