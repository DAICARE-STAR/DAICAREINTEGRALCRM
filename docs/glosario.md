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
| Cuenta | Registro central del CRM: una persona atendida o una empresa (`crm_cuentas.tipo`) | cliente (en el código), lead, account |
| Contacto | Persona vinculada a una cuenta: familiar o responsable de una persona atendida, o contacto de una empresa | lead |
| Actividad | Nota, llamada, reunión, correo o visita registrada sobre una cuenta o un contacto | tarea, evento |
| Etapa | Momento del seguimiento de una cuenta, de la lista configurable de la instalación | estado del deal, pipeline stage |
| Datos de salud | Historia de salud de una persona atendida: cifrada, con permiso propio, segundo factor y registro de accesos | historia clínica (no es una HC legal) |
| Consentimiento | Autorización registrada de la persona para tratar sus datos (y los de salud) | aceptación |
