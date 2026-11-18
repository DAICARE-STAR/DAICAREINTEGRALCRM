# Backlog fusionado de las propuestas ERP y CRM

Las 117 propuestas de `odoo.md`, `erpnext.md`, `twenty.md`, `monica.md` y `platform.md` (Huly), fusionadas cuando son la misma idea y priorizadas para Bash Logistics. Quedan **73 BL**; seis se parten en dos filas (a y b) porque sus partes van a fases distintas (BL-01, BL-05, BL-12, BL-15, BL-68 y BL-69), así que las tablas tienen 79 filas. Un id de origen aparece en dos BL cuando su propuesta tenía dos partes que van a sitios distintos (TWE-08, TWE-16, PLA-23, MON-17, ERP-15, ODO-13, ODO-20 y ERP-17). Cuatro ids quedan aplazados sin BL (MON-18 a MON-21, ver «Descartado, aplazado y por qué»). El contexto de cada dominio y las decisiones pendientes están en `comparativa.md`; las correcciones de la revisión crítica, en `revision-critica.md`.

## Cómo leer

- **Fase**: 0.2 CRM, núcleo (o registro), 0.7 inventario y compras, 0.8 ventas y pedidos, 0.9 facturación y cartera, 0.10 contabilidad, 0.11 RR. HH., o condicionada a un hecho externo (un módulo portado, una API pública, un pedido de un cliente). El reparto de las fases 0.3 a 0.11 es un supuesto de este análisis hasta que se decida D-14.
- **Valor** para una pyme y **esfuerzo** sobre Postgres con RLS, React y Netlify Functions: alto, medio o bajo. Son estimaciones de las fichas corregidas por la revisión, no medidas.
- **Depende de**: otra BL que debe ir antes; «—» si ninguna. Entre paréntesis, la decisión D-n de `comparativa.md` que hay que tomar antes. Ninguna BL depende de otra de un grupo posterior; al editar este archivo se comprueba con un script que lea la columna.
- BL-02 (contrato base) y BL-08 (moneda) se exigen por prueba a toda tabla nueva y no se repiten en la columna «Depende de».
- Todo cambio de esquema va en un archivo nuevo de `supabase/esquema` (PP-DEC-02); nada toca `21-crm.sql`. Un solo archivo con letra por función y por tanda: si dos BL reescriben la misma función, se escribe el cuerpo final una vez y el archivo cita ambas (ver «Funciones que comparten varias BL»).
- Nada de salud entra en historial, búsqueda, exportación, plantillas, enlaces ni integraciones (PP-DEC-19).
- Toda tabla nueva con datos de personas declara cómo se suprime al borrar la entidad (cascada, anonimización o retención justificada), como hoy hacen `crm_cambios` y `crm_vinculos_externos` (Ley 1581, art. 8; PP-R5). Una retención se registra como decisión o como riesgo aceptado nuevo.
- Toda pantalla nueva con datos de personas usa `campoPersona` y cierra el autorrelleno (PP-DEC-20); lo vigila `formularios-neutros.test.ts`.
- Cuando el texto dice «propio» o «diseño propio», la idea no está en el repo citado: es del producto.

## Orden

1. **Núcleo y registro**: contratos baratos que, si se dejan para después, obligan a migrar tablas de varios módulos (BL-01a, BL-02 a BL-04, BL-05a, BL-06 a BL-10, BL-12a, BL-13, BL-14, BL-15a, BL-16, BL-17).
2. **CRM 0.2**: cierres del CRM que se entregará al primer cliente, que aún no recibe la instalación (BL-11, BL-15b, BL-18 a BL-27, BL-29, BL-31, BL-32, BL-34, BL-36).
3. **Núcleo transversal antes de la 0.7**: piezas que comparten todos los ERP (BL-38, BL-33, BL-12b, BL-28, BL-35, BL-39 a BL-49, BL-69a). BL-38 va primero: BL-33, BL-12b, BL-49, BL-55 y BL-72 usan su tabla.
4. **Por fase**: 0.7 (BL-01b, BL-52 a BL-58), 0.8 (BL-30, BL-59), 0.9 (BL-68a, BL-60, BL-05b, BL-61 a BL-67), 0.10 (BL-68b, BL-69b), 0.11 (BL-70 a BL-73).
5. **Condicionadas**: BL-37 (cuando se porte Calendario), BL-50 (cuando haya API pública), BL-51 (cuando un cliente con varias sedes lo pida).

## Tabla priorizada

### 1. Núcleo y registro

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-01a | Dependencias de los ERP planeados reducidas al modelo que se lee (y a lo que fije D-19), lo demás en `integra`, y `--activar` que ofrece el orden de `dependenciasDe` en vez de solo rechazar. Respaldo en Odoo: `purchase` solo depende de `account` y `sale` no depende de `stock` | ODO-01 | Módulos | registro | alto | bajo | — (D-2, D-3) |
| BL-02 | Contrato base de toda tabla de negocio nueva de un módulo con `sql`: `created_by` y `updated_by` sellados por trigger, `creado_via` (manual, importación, API, regla, sistema) y `archivado_en`, exigido por una prueba de esquema con una lista explícita de exentas (registros e inmutables: `crm_cambios`, `crm_accesos_salud`, `crm_salud`, `crm_consentimientos`, `crm_vinculos_externos`). No se llama `origen`: `crm_cuentas.origen` es el canal de captación y `crm_vinculos_externos.origen` el sistema externo. En el CRM ya hay `created_by` y `archivado_en` y solo faltan `updated_by` y `creado_via`: se añaden en un archivo 21c que reescribe `crm_preparar` y `crm_registrar_cambio` sin meter esas columnas en el historial, en la misma tanda que BL-23; la autoría de actividades sigue en `autor_id`. Twenty sella en la capa de servicio y respeta un `createdBy` con nombre ya enviado: el trigger sin excepción y la prueba son endurecimiento propio. El alta automática en historial de TWE-02 ya la hace `crm_registrar_cambio` en el CRM y la cubre BL-28 en los ERP | TWE-02 | Extensibilidad | núcleo; 0.2 CRM | alto | bajo | — |
| BL-03 | Las filas que siembra un módulo (vistas estándar, catálogos, reglas) llevan un UUID estable y la columna `modulo`, para resembrar sin duplicar y retirar lo del módulo sin tocar lo del cliente | TWE-15 | Módulos | registro | medio | bajo | — |
| BL-04 | Ajustes de cada módulo declarados en el registro como ya se hace con `limites` (clave, tipo, obligatorio, opciones, alcance) y validados por `modulos.mjs`. BL-15a cambia los catálogos de `instalacion.ajustes.crm` a objetos (clave, nombre, color, orden, activo) y esa forma se declara aquí | TWE-12 | Módulos | registro | medio | bajo | — |
| BL-05a | Numeración en la base: tabla de series (prefijo, relleno, actual, reinicio) con reclamo atómico, modo con huecos y modo sin huecos que espera con un `lock_timeout` corto. Se toma el modelo de serie de `ir.sequence` (Odoo) y la serie con bloqueo de fila de `tabSeries` (ERPNext: `SELECT … FOR UPDATE` y luego `UPDATE`). Sin consumidor hasta el primer esquema con consecutivo | ODO-06, ERP-01 | Automatización | núcleo (al abrir el primer esquema con consecutivo) | alto | bajo | — (D-10) |
| BL-06 | Máquina de estados por entidad: estados con categoría fija (las cinco de Huly), tabla de transiciones con su permiso y función `aplicar_transicion` con `UPDATE … WHERE estado = esperado` que exige exactamente una fila afectada (como el `affected === 1` de Twenty) y deja registro. La tabla de transiciones con permiso y la función son diseño propio: `TTransition` de Huly no lleva permiso y su control optimista opera sobre la ejecución de un proceso, no sobre una entidad de negocio. Se construye con su primera entidad real, no antes | TWE-03, PLA-06 | Automatización | núcleo (al abrir la 0.7) | alto | medio | — |
| BL-07 | Escritura por estado: se edita y se borra solo en borrador; lo publicado no se edita y se revierte con un documento enlazado | ODO-05 | Permisos | núcleo (al abrir la 0.7) | alto | bajo | BL-06 |
| BL-08 | Moneda como par: importe `numeric` más código ISO 4217, con NOT NULL conjunto y CHECK en la base, en todo documento y como tipo de campo propio (BL-42). Entregable: una comprobación en la prueba de esquema de BL-02 que exige una columna de código de moneda junto a cada `numeric` de importe. Twenty guarda importe y código en un tipo compuesto y valida el código en la API, pero no obliga a que existan los dos (ambos `isRequired: false`): la invariante es propia. `instalacion.moneda_base` y `instalacion.divisas` ya existen y `src/lib/moneda.ts` formatea el dinero con su código; hoy ninguna tabla guarda importes | TWE-04 | Finanzas | núcleo (al abrir el primer esquema con importes) | alto | bajo | — (D-15) |
| BL-09 | Control de edición concurrente: la edición envía el `updated_at` leído y se rechaza si la fila cambió entre medias. También la escritura de `instalacion.ajustes`, que `guardarAjustesCrm` reescribe entera (comparar su `updated_at` o actualizar solo la rama del módulo) | MON-15 | Permisos | núcleo; 0.2 CRM | medio | bajo | — |
| BL-10 | Guarda del último administrador en la base: un trigger en `user_roles` y `profiles` que cuenta solo administradores con `es_servicio = false` y rechaza, con mensaje y hint claros, quitar o borrar al último; se salta cuando actúa la service role (desmontaje de pruebas y borrado desde Auth, que cae en cascada); la cuenta admin de `tools/instalar/cuentas-prueba.mjs` se marca `es_servicio` o se excluye del conteo; caso nuevo en `supabase/pruebas/rls-simulacion.sql`. El shell ya impide quitarse el propio rol (`MembersTab.tsx`); la API y la baja desde el panel de Supabase no. Monica solo aplica «no sobre uno mismo»; el conteo es propio | MON-01 | Permisos | núcleo | alto | bajo | — |
| BL-12a | Exportar como permiso propio aplicado en la base: permiso `exportar_crm` (registro, `src/types.ts`, listas del servidor), RPC `crm_exportar` con tope de filas y fila en auditoría como única vía de la pantalla Exportar, y tope de volumen en las lecturas directas de `crm_cuentas` y `crm_contactos`, porque sin él quien lee recorre la lista por PostgREST o con `crm_buscar`. Un permiso solo en el botón no cierra nada. Hoy la exportación se registra desde el cliente (`crm.exportar`) sin limitarla. El permiso viene de ODO-08 (`group_allow_export`); Huly solo exige el rol Owner | ODO-08, PLA-04 | Permisos | 0.2 CRM | alto | medio | — |
| BL-13 | Prohibiciones explícitas en los roles con la regla «denegar gana» («edita ventas pero no anula», «ve cartera pero no exporta»). Cambia a la vez las tres uniones de permisos (`has_perm` en `00-base.sql`, la de `netlify/lib/autorizacion.mts` y `hasPerm` del shell), la matriz de roles, `roles_guard_escalada` y `rolesEscalan` de `invitar-miembro`, con una prueba que compare las tres con el mismo conjunto de roles | PLA-11 | Permisos | núcleo | medio | medio | — (D-9) |
| BL-14 | Prueba que falla si un permiso nombrado en los requisitos de una acción (`netlify/lib/modulos/*.mts`, compuestas en `connector-proxy.mts`) no está en el registro, o si un permiso de módulo no exige su módulo. Que la acción figure en el registro y tenga su entrada de `REQUISITOS` ya se prueba (`componer` y `connector-proxy.test.ts`). Hoy solo el núcleo aporta acciones; las de los demás módulos declaradas en el registro no tienen implementación | MON-12 | Permisos | núcleo | medio | bajo | — |
| BL-15a | Catálogos con contrato: etapas, orígenes, tipos de empresa y relaciones como objetos con clave inmutable, nombre editable, color, orden y `activo`; marca de sistema no borrable. Una clave en uso no se borra ni se renombra: hay que crear la regla (trigger sobre `instalacion` o RPC con revoke que recorre cuentas, contactos y campos propios), porque hoy `guardarAjustesCrm` hace un `update` directo desde el navegador y la pantalla deja editar la clave de una etapa. De Monica se toma el nombre editable sobre una clave y la bandera `can_be_deleted` que sus servicios de módulos y tipos de relación hacen cumplir; proteger lo que está en uso es propio: en Monica borrar una plantilla en uso deja el espacio sin plantilla y borrar una etiqueta arrastra sus asignaciones | TWE-11, MON-11 | Extensibilidad | 0.2 CRM | medio | medio | BL-04 |
| BL-16 | Tipo de documento con código DIAN (NIT 31, CC 13, CE 22, pasaporte 41, PEP 47, PPT 48 y otros) guardado aparte del número, y dígito de verificación aparte validado con el módulo 11 DIAN. Archivo nuevo con `tipo_documento` (nullable) y `digito_verificacion`; `crm_preparar` deja de fusionar el guion del NIT; el índice único `crm_cuentas_documento_unico` pasa a `(coalesce(tipo_documento, ''), documento)` y cambia el check; cambian importador, formulario, exportador y búsqueda. Hoy el documento se guarda fusionado («900123456-7» queda «9001234567») y sin el tipo no se sabe si el último dígito es el DV: los ya guardados quedan con tipo desconocido y una vista de revisión, o se limpian con las cuentas de prueba antes de la entrega. De Odoo (`l10n_co`) solo vienen los códigos; el DV aparte es propio. BL-18 y BL-44 usan la clave (tipo, documento) | ODO-02, PLA-23 | CRM | 0.2 CRM | alto | medio | — |
| BL-17 | Rotación de la clave de salud: `clave_id` por fila en `crm_salud` y secretos versionados en Vault; se lee con la clave de la fila y se escribe con la vigente. Hoy el secreto es único, `crm_salud_clave()` está revocada incluso a la service role y la verificación comprueba el secreto actual | TWE-06 | Permisos | 0.2 CRM | alto | medio | — |

### 2. CRM 0.2

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-11 | Visibilidad «lo mío o sin asignar» más el permiso `ver_todo_crm` (registrado en `modulos.ts`, `src/types.ts` y las listas del servidor) y sembrado en los roles existentes para no quitar acceso a nadie. Toca las políticas de lectura de `crm_cuentas`, `crm_contactos`, `crm_actividades`, `crm_cambios`, `crm_vinculos_externos` y `crm_consentimientos` (todas usan hoy `puede_ver_app('crm')`: acotar solo la cuenta deja leer sus hijas), la política de storage de consentimientos y las funciones definer de salud, que comprueban la cuenta saltándose la RLS. El importador y el aviso de duplicados usan la función de BL-18, no la lectura bajo RLS. Entra con la regla mínima de BL-25 | ODO-03 | Permisos | 0.2 CRM | alto | medio | BL-18; BL-25 (regla mínima) |
| BL-15b | Etiquetas como catálogo con color y filtro que muestra solo las usadas, sin migrar los `text[]` de cada fila | MON-08 | Extensibilidad | 0.2 CRM | medio | bajo | BL-15a |
| BL-18 | Aviso de duplicados al crear o editar cuenta o contacto, con una sola función de base (security definer, que solo dice si existe una cuenta activa o archivada con ese documento, correo o nombre cercano, sin devolver la fila ni el responsable) para el formulario y el importador; el importador deja de cruzar en el navegador contra `cuentasParaImportar`. Criterios por entidad como datos: documento (tipo más número, BL-16), correo y nombre por trigramas con puntaje; hasta BL-19 lee la columna `email` actual, y el teléfono en dígitos y los correos múltiples entran con BL-19 (hoy el teléfono es texto libre sin índice). Los índices trigrama ya cubren nombre, documento y correo de cuentas y nombre y correo de contactos. Entre cuentas activas el documento ya tiene un índice único parcial: el aviso añade valor frente a las archivadas, con oferta de reactivar. Aviso por defecto y bloqueo opcional según `instalacion.ajustes.crm` (ERP-15; PLA-01 y el patrón 4 de `comparativa.md` lo dejan en aviso). Criterios, normalización y puntaje son diseño propio: ERPNext solo bloquea por correo exacto al crear y reduce el teléfono a dígitos para buscar llamadas; Huly compara canales por igualdad exacta y el nombre con `$like` | ODO-19, ERP-15, TWE-05, PLA-01 | CRM | 0.2 CRM | alto | medio | BL-16; BL-19 (parcial: teléfono y correos múltiples) |
| BL-19 | Varios teléfonos, correos y WhatsApp por cuenta y contacto como filas tipadas (tipo, valor normalizado, principal, verificado, archivado), con protocolo por tipo que arma el enlace para abrir el chat, rellenadas desde las columnas actuales. El enlace no es una integración de mensajería (D-16). Monica da las filas tipadas y el protocolo; Huly, el canal como fila hija y, en `SocialId`, la clave normalizada, el verificado y el borrado lógico; «principal» es propio | MON-02, PLA-20 | CRM | 0.2 CRM | alto | medio | — |
| BL-20 | Última actividad por cuenta calculada al leer en `crm_buscar` (cuando llegue BL-22, solo las hechas, no las programadas sin cerrar) y filtro «sin actividad hace N días», que se reexpresa como un modo de BL-24 cuando exista. Implica reemplazar `crm_buscar`: cambiar las columnas de un `returns table` exige `drop function`, nuevos grants en un archivo nuevo y actualizar su comprobación por firma en la verificación de 21 y en `esquema.test.ts` | TWE-01 | CRM | 0.2 CRM | alto | bajo | — |
| BL-21 | Estancamiento: `dias_estancada` por etapa en el catálogo, fecha del último cambio de etapa y tiempo por etapa derivado de `crm_cambios` (BL-23 no funde cambios de etapa) | ODO-04 | CRM | 0.2 CRM | alto | bajo | BL-15a |
| BL-22 | Actividades programadas: vencimiento, responsable, estado calculado (vencida, hoy, planificada), cierre con retroalimentación que pasa al historial y siguiente sugerida; el nombre del autor se guarda también como texto (patrón de las tareas de Monica; su feed no lo tiene). Exige una entrada nueva en `docs/glosario.md` (hoy Actividad es lo «registrado» y «tarea» está prohibida) y cambiar la política de edición de `crm_actividades` para que el responsable pueda cerrarla (hoy solo su autor con `edit_crm` o un administrador) | ODO-10, MON-07 | CRM | 0.2 CRM | alto | medio | — |
| BL-23 | Historial con menos ruido: fundir los cambios seguidos del mismo autor sobre la misma entidad dentro de diez minutos, salvo los de etapa (BL-21 los necesita); lista de columnas no auditadas (incluye `updated_by` y `creado_via` de BL-02); y una lectura legible de cada cambio («pasó de Valoración a Propuesta») que mezcla `crm_actividades` y `crm_cambios` | TWE-10, PLA-13 | CRM | 0.2 CRM | medio | bajo | BL-02 (columnas no auditadas) |
| BL-24 | Modos de fecha con nombre en los filtros (vencido, hoy, esta semana, este mes, próximos, sin fecha, rango) evaluados en la zona de la instalación (`zona_instalacion()`), con una tabla de operandos por tipo compartida entre shell y servidor | PLA-02, TWE-08 | Extensibilidad | núcleo; 0.2 CRM | alto | bajo | — |
| BL-25 | Crear la función de baja de miembro, que pide a quién pasa su cartera (cuentas y pendientes) antes de dar de baja. Hoy las bajas se hacen en el panel de Supabase, fuera del producto, y dejan la cartera sin responsable (`responsable_id` es `on delete set null`); la baja directa desde el panel sigue evitando el traspaso. Regla mínima, que entra con BL-11: un trigger impide borrar a un miembro con cuentas asignadas. Diseño propio: Monica no reasigna, destruye los espacios donde el usuario era el único gestor (`DestroyUser.php`) | propio (MON-06 como contraejemplo) | Permisos | núcleo; 0.2 CRM | alto | alto | — |
| BL-26 | «Mis cuentas»: seguidores automáticos (quien crea y el responsable) con aviso de cambio de etapa y de actividad nueva, más favoritos y frecuentes por usuario | PLA-12, MON-10 | CRM | 0.2 CRM | medio | bajo | — |
| BL-27 | Relaciones entre cuentas con tipo directo e inverso nombrados (acudiente de y a cargo de, matriz y filial, refirió a), catálogo en ajustes y par único | MON-09 | CRM | 0.2 CRM | medio | bajo | BL-15a |
| BL-29 | Ficha de cuenta armada por bloques que declara cada módulo en el registro (componente, lateral o pestaña, registros por página), con orden guardado por instalación | MON-05 | Extensibilidad | registro; 0.2 CRM | alto | medio | — |
| BL-31 | Fusión de cuentas en una función transaccional: cuenta prioritaria, elección campo por campo, simulación, reapunte de contactos, actividades y vínculos externos, negativa si se pierden datos que el usuario no puede leer, `edit_salud` y MFA si hay salud, y fila de traza propia que se suprime con la cuenta. Los consentimientos y sus archivos no se reapuntan (inmutables por trigger y atados a la carpeta de su cuenta): la cuenta absorbida se archiva y los conserva; si ambas tienen `crm_salud` (`cuenta_id` es la llave primaria) la fusión se niega o elige una; la absorbida no se puede borrar mientras tenga salud o consentimientos (`crm_cuenta_borrable`). Esfuerzo medio por la lista cerrada de tablas (TWE-17, PLA-21); ERP-15 lo estimaba alto con reapuntado por introspección | TWE-17, PLA-21, ERP-15 | CRM | 0.2 CRM | medio | medio | BL-18 |
| BL-32 | Tablero kanban por etapa (el conteo por etapa ya existe en `contadoresEtapa` y se reutiliza), columnas con orden y visibilidad guardados y orden manual por rango entre vecinos; la suma de valor por columna llega con la oportunidad en la 0.8 (BL-30) | TWE-19, PLA-14 | CRM | 0.2 CRM; 0.8 | medio | medio | — |
| BL-34 | Obligatorio condicional en campos propios («obligatorio si etapa = X»), declarado en `crm_campos_def` y comprobado en el trigger que ya valida los campos | TWE-21 | Extensibilidad | 0.2 CRM | medio | medio | — |
| BL-36 | Descargar una cuenta o un contacto como `.vcf`. Valor bajo porque es solo la descarga: la ficha calificaba medio la propuesta entera, cuya importación vCard se aplaza | MON-17 | Integración | 0.2 CRM | bajo | bajo | — |

### 3. Núcleo transversal antes de la 0.7

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-38 | Tabla única de eventos programados y esperas: alta por upsert, cancelación por prefijo, reclamo atómico marcado en la misma transacción, barrido por `pg_cron` o función programada, «N días después de un campo» que se reprograma si el campo cambia, festivos por país de la instalación como dato (D-17) y espera con tiempo máximo. La usan BL-33, BL-12b, BL-49, BL-55 y BL-72 | TWE-07, PLA-07 | Automatización | núcleo | alto | medio | — (D-8) |
| BL-33 | Recordatorios por cuenta, de una vez o cada N días, meses o años, con procesador que aísla el fallo de cada aviso. Es cliente de la tabla de BL-38: la tabla de programación propia de MON-03 se sustituye por la de BL-38 | MON-03 | Automatización | CRM, tras BL-38 | alto | medio | BL-38 |
| BL-12b | Exportador común del núcleo que reutiliza el CSV del CRM, con transformación por columna (omitir, renombrar, encabezado calculado), plantillas de exportación guardadas y exportación reimportable que cierra el círculo con BL-44, más versión asíncrona a Storage con aviso | ODO-08, PLA-04, ODO-20, ERP-17 | Integración | núcleo | medio | medio | BL-12a, BL-38 |
| BL-28 | Tabla de eventos común de la cuenta que llenan los triggers de cada módulo (o reutilización de `crm_cambios`): se anexa solo por la API y se suprime por entidad al borrarla físicamente, como hoy los cambios y vínculos (Ley 1581, art. 8; PP-R5). Monica aporta la forma (feed polimórfico con acción de lista cerrada, entidad y autor nulo), que escribe a mano desde cada servicio y borra en cascada con el contacto; el CHECK de acciones y el llenado por triggers son propios | MON-04 | CRM | cada ERP (0.7 a 0.11) | alto | medio | — |
| BL-35 | Cliente y proveedor como roles de un tercero, asignados a demanda al primer pedido o compra, en lugar de tablas de terceros por módulo. Dónde vive el tercero (satélite de `crm_cuentas` o tercero neutral enlazable a la cuenta) lo fija D-3 | PLA-10 | CRM y ventas | núcleo o CRM según D-3; antes de la 0.7 | alto | medio | — (D-3) |
| BL-39 | Plantillas de aviso y de mensaje editables por instalación con marcadores de una lista cerrada por entidad, valor por defecto, escape según destino, validación al guardar, sin envío si el asunto queda vacío y preferencia por tipo y canal | TWE-13, PLA-15 | Automatización | núcleo | medio | bajo | — |
| BL-40 | Canal de aviso con contador de fallos, bitácora de envíos con el error y desactivación tras N fallos, visible para el miembro | MON-13 | Automatización | núcleo | medio | bajo | — |
| BL-41 | Vistas guardadas en el servidor: vista oficial que siembra cada módulo, columnas por usuario y filtros con nombre privados o de equipo (dos visibilidades, TWE-08; publicar exige permiso), saneados contra los campos vigentes al cargar; columnas de kanban bloqueadas en estados calculados | ODO-20, ERP-20, TWE-08, PLA-08 | Extensibilidad | núcleo | alto | medio | BL-03, BL-24 |
| BL-42 | Campos propios generalizados: más tipos (moneda, fecha y hora, etiquetas, relación, NIT con DV), otras entidades, registro de tipos en el shell (editor, celda, filtro, validador), listas de opciones compartidas y purga de valores al borrar un campo | ODO-22, PLA-23 | Extensibilidad | núcleo | medio | medio | BL-15a |
| BL-43 | Permiso por campo que solo resta: lectura por vista o función sin la columna, escritura vigilada por un trigger que compara OLD y NEW, e historial filtrado con la misma lista (costos, márgenes, salarios; el tratamiento de salarios lo fija D-18) | ERP-23, TWE-09, PLA-22 | Permisos | núcleo | alto | medio | — |
| BL-44 | Importador general: simulacro que termina en ROLLBACK, todos los errores por fila antes de insertar, mapeo de columnas sugerido y recordado, mapeo de valores, cuenta con contactos en un archivo, lotes con reanudación, clave (tipo, documento) de BL-16, manejadores por módulo con orden y lo no mapeado como nota visible que se suprime con su entidad. `crm_vinculos_externos` como id externo: hoy solo existe la tabla, que ningún código lee ni escribe y que `authenticated` solo puede leer; el importador la escribe desde una función con service role o una RPC y cruza por ella al reimportar | ODO-18, ERP-17, PLA-18, MON-17 | Integración | núcleo | alto | alto | BL-16, BL-18 |
| BL-45 | Aprobación genérica: solicitud sobre cualquier documento con aprobadores, regla «n de m», acciones al aprobar y al rechazar de un catálogo cerrado, cancelación de pendientes al primer rechazo y columna `bloqueado` que la base hace cumplir | PLA-05, PLA-03 | Automatización | núcleo | alto | medio | BL-06 |
| BL-46 | Motor único de reglas: disparadores y acciones de catálogo cerrado, condición como árbol JSON, cola en la misma transacción con `SKIP LOCKED`, profundidad máxima, prueba en seco, `last_run` fijado al crear, errores aislados por regla con estado «con error» hasta reintento manual, versiones con una sola activa, ejecución con copia congelada (con retención y supresión declaradas) y tarjeta de salud. Reintentos: se adopta PLA-16, una regla con error no se reintenta sola porque repetiría correos o tareas; se descartan el reintento automático de 0 a 3 y «continuar si falla» de TWE-18 | ODO-25, ERP-18, TWE-18, PLA-16 | Automatización | núcleo | alto | alto | BL-38, BL-39 |
| BL-47 | Cuando la IA o una regla lean o escriban datos, actúan con la intersección entre el rol del miembro y un rol limitante, y nunca sobre roles, auditoría, salud, consentimientos ni las demás tablas vedadas | TWE-14 | Permisos | núcleo, cuando la IA o una regla actúe sobre datos | medio | bajo | BL-46, BL-13 |
| BL-48 | Enlace público revocable con vencimiento obligatorio y restricciones para compartir cotización, pedido o estado de cuenta: hash del token y lectura por función de una vista mínima | PLA-09 | Integración | núcleo; 0.8 | alto | medio | — |
| BL-49 | Webhooks salientes sobre una lista explícita de entidades: fila de salida en la misma transacción (suprimida con su entidad), HMAC con marca de tiempo, bitácora, reintento escalonado y apagado con aviso tras fallos programados en la tabla de BL-38 (el contador de fallos se comparte con BL-40 solo si el canal es el mismo), bloqueo SSRF y rol que filtra los eventos | ERP-25, TWE-16 | Integración | núcleo | medio | medio | BL-38 |
| BL-69a | Fecha de bloqueo global y de impuestos, con rol exento nombrado y sin paso libre del administrador (D-9). Vive en el núcleo para que la use el inventario (0.7) antes que la publicación contable (0.9) | ODO-21, ERP-11 | Finanzas y permisos | núcleo (antes de la 0.7) | alto | bajo | BL-13 (D-9) |

### 4. Fase 0.7: inventario y compras

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-01b | Puente declarado por pareja (compras con inventario, ventas con inventario, facturación con ventas) que el instalador aplica cuando coexisten; exige tocar `archivosDeModulo` en `tools/instalar/modulos.mjs`, que hoy elige archivos solo por el número de `Modulo.sql`. Diseño propio sobre el mecanismo `auto_install` y `must_install` de Odoo: el clon (18 addons) no trae ningún puente entre módulos de negocio | ODO-01 | Módulos | 0.7 (primer par real) | medio | medio | BL-01a |
| BL-52 | Unidad base única por producto; cada línea de orden, recepción o movimiento guarda unidad, factor y cantidad convertida, que no cambian si luego se corrige el factor | ERP-04 | Operaciones | 0.7 (catálogo de productos) | alto | bajo | Productos portado (D-1) |
| BL-53 | Inventario como movimientos entre ubicaciones (proveedor, cliente, ajuste y producción como virtuales), saldo por producto, bodega y lote materializado con bloqueo de fila, «almacenable» separado de lote o serie, costo promedio, bodegas en árbol y, como diseño propio, libro de solo inserción, anulación por reverso y sin movimientos anteriores a la fecha de bloqueo (D-11). ERPNext marca `is_cancelled` y reprocesa; Odoo actualiza el saldo en sitio con `try_lock_for_update`, que falla sin esperar: de las fuentes se toman las ubicaciones virtuales y el bloqueo de fila, no su costo | ODO-17, ERP-16 | Operaciones | 0.7 | alto | alto | BL-06, BL-52, BL-69a |
| BL-54 | Conteo físico como documento (apertura, conciliación, ajuste) que genera movimientos por la diferencia y avisa si el saldo cambió después de contar; es la carga inicial de cada instalación. La advertencia de saldo cambiado es un detalle de Odoo (`odoo.md`, sección Operaciones), no de ERP-14 | ERP-14 | Operaciones | 0.7 | alto | medio | BL-53 |
| BL-55 | Existencias proyectadas calculadas en una vista y reposición mínimo-máximo contra la proyección, con reglas por producto y bodega, cantidad manual que pisa la sugerida y trabajo programado que genera solicitudes | ODO-15, ERP-03 | Operaciones | 0.7 | alto | medio | BL-53, BL-38 |
| BL-56 | Avance derivado de las líneas (recibido, entregado, facturado en porcentaje), política de facturación por producto (lo pedido o lo recibido) y estado del documento derivado por una tabla de reglas ordenadas | ODO-14, ERP-12 | Operaciones y ventas | 0.7; 0.8; 0.9 | alto | medio | BL-06 |
| BL-57 | Reglas de autorización por monto o descuento (documento, base, umbral, aprobador por rol o usuario, prioridad usuario, rol, global); la orden de compra pasa a «por aprobar» sobre el umbral; autoaprobación configurable por instalación: prohibida si hay más de un aprobador, registrada si es el único (D-9) | ERP-02, ODO-07 | Automatización | 0.7; 0.8 | alto | bajo | BL-45, BL-13 |
| BL-58 | Recepción con cantidad aceptada y rechazada, bodega de rechazo, recepción parcial con pendiente y tolerancia de sobrerrecepción global y por producto | ERP-19 | Operaciones | 0.7 | medio | bajo | BL-53 |

### 5. Fase 0.8: ventas y pedidos

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-30 | Oportunidad como entidad aparte de la cuenta: monto con moneda, cierre esperado, etapa de venta, probabilidad; perdida es archivada con motivo obligatorio de catálogo (ERP-21; en Odoo no es obligatorio) y no se pierde con una cotización vigente; la etapa de la cuenta se conserva para seguimiento. Catálogos de la oportunidad (etapas de venta, motivos de pérdida) en `instalacion.ajustes.crm`. Se diseña en la 0.2 y se construye con la 0.8 o cuando un cliente venda a empresas (D-4) | ODO-09, ERP-21 | CRM y ventas | 0.8 (diseño en 0.2) | alto | medio | BL-15a |
| BL-59 | Cadena documental trazable e idempotente (oportunidad, cotización, pedido, factura): cada destino guarda el id de origen con índice único parcial y una función tipada por par copia lo necesario. Si la cotización es parte de ventas o del módulo `cotizador` lo fija D-2 | ERP-13 | CRM y ventas | 0.8 | alto | medio | BL-06, BL-30 |

### 6. Fase 0.9: facturación y cartera

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-68a | Tabla de cuentas contables y cuentas por defecto (cobrar, pagar, IVA, redondeo) en los ajustes, que la publicación necesita para validar | ERP-10 | Finanzas | 0.9 | alto | bajo | — (D-19) |
| BL-60 | Documento contable único (factura, nota, asiento) con saldo firmado, CHECK en las líneas, una sola función de publicación que valida cuadre con tolerancia y línea de redondeo, fecha de bloqueo (BL-69a) y cuenta habilitada (BL-68a); líneas sin UPDATE ni DELETE y anulación por reverso. El modelo es el de Odoo (la factura es el documento contable); de ERP-05 se toma la función única de publicación, también para los movimientos de Inventario cuando exista Contabilidad; se descarta el libro auxiliar separado de los documentos. El efecto de la nota crédito en el saldo depende de D-5 (D-6) | ODO-11, ERP-05 | Finanzas | 0.9 (lo usa 0.10) | alto | medio | BL-05a, BL-07, BL-68a, BL-69a (D-5) |
| BL-05b | Número fiscal asignado al publicar, con resolución DIAN, rango, tope y vigencia, en una única función que escribe número y documento en la misma transacción. Diseño propio: en el clon de Odoo `no_gap` solo numera pagos agrupados y las facturas numeran con `sequence_mixin`, que su ficha marca «no copiar» | ODO-06, ERP-01 | Finanzas | 0.9 | alto | medio | BL-05a, BL-60 (D-7) |
| BL-61 | Impuestos como filas del documento (sobre neto, sobre fila previa, incluido en precio) con cuenta, plantilla por producto y regla que la elige según el tercero, sembrados con tarifas colombianas verificadas y vigencia, no copiadas, y actualizables por instalación (D-17). La parte de retenciones de ODO-13 va a BL-62 | ODO-13, ERP-08 | Finanzas | 0.9 (el cotizador la reutiliza) | alto | medio | BL-60 |
| BL-62 | Retenciones (RteFte, RteIVA, RteICA) como filas con porcentaje negativo, por concepto con tasa por vigencia, base mínima en UVT y cuenta, y un registro por retención aplicada que alimenta los certificados (D-17) | ODO-13, ERP-09 | Finanzas | 0.9 | alto | medio | BL-61 |
| BL-63 | Cartera derivada: tabla de cruces parciales entre líneas débito y crédito (ODO-12) y saldo como suma firmada por documento de origen (ERP-06), sin tabla de saldos; estado de pago y vencimiento derivados en una vista o función con RLS; antigüedad con rangos configurables. Odoo guarda saldo y estado como campos almacenados que recalcula al cruzar y ERPNext suma un libro de pagos aparte y guarda `outstanding_amount`: derivarlo al leer es propio y su costo está por medir. Hasta que se responda D-5 cruza solo pagos y anticipos | ODO-12, ERP-06 | Finanzas | 0.9 | alto | medio (por medir) | BL-60 (D-5) |
| BL-64 | Recibo de pago con asignación a varias facturas, saldo sin asignar como anticipo y deducciones (retenciones que practica el cliente) a su cuenta; no se confirma con diferencia (el borrador puede tenerla) y se puede deshacer. Falta decidir si la diferencia se ajusta contra una cuenta de deducción, como el `write_off_difference_amount` de ERPNext | ERP-07 | Finanzas | 0.9 | alto | medio | BL-63 |
| BL-65 | Estado de cuenta por cliente enviado en lote con su ciclo y cobranza escalonada por niveles con estado derivado del saldo (D-13, D-16) | ERP-24 | Finanzas y automatización | 0.9 | medio | medio | BL-63, BL-46, BL-39 |
| BL-66 | Webhooks entrantes (pagos, WhatsApp por Cloud API con el esquema de firma de Meta, factura electrónica) con HMAC y marca de tiempo, idempotencia por id de evento y 2xx ante lo que no se procesa (D-16) | MON-16 | Integración | 0.9 | medio | bajo | — |
| BL-67 | Gráficas agregadas en la base con `date_trunc` y `generate_series` en la zona de la instalación (`zona_instalacion()`), días sin datos en cero y topes de barras, grupos y puntos | TWE-20 | Automatización (informes) | 0.9 (y Gerencia) | medio | medio | Gerencia portado |

### 7. Fase 0.10: contabilidad

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-68b | Plan de cuentas como plantilla anidada (número, tipo semántico, tipo raíz) sembrada con el PUC simple reconstruido desde la norma pública y actualizable por instalación (D-17) | ERP-10 | Finanzas | 0.10 | alto | medio | BL-68a |
| BL-69b | Cierre por periodo y tipo de documento, con excepciones temporales por usuario con motivo y vencimiento, y sin paso libre del administrador (D-9) | ODO-21, ERP-11 | Finanzas y permisos | 0.10 | alto | medio | BL-69a |

### 8. Fase 0.11: RR. HH.

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-70 | Empleado en dos capas: tabla privada para RR. HH. y vista pública de solo lectura; más campos para el jefe según la cadena de mando; cumpleaños solo si el empleado lo autoriza. Salarios y datos de salud según D-18 | ODO-16 | RR. HH. | 0.11 | alto | medio | BL-43 (D-18) |
| BL-71 | Versiones fechadas del empleado (un cambio copia la vigente) y contrato en tabla propia con exclusión de solapes; las versiones copian datos personales y declaran su supresión | ODO-23 | RR. HH. | 0.11 | medio | medio | BL-70 |
| BL-72 | Ausencias: tipos editables con banderas y factor firmado, saldo calculado desde asignaciones, transiciones por rol, descripción privada, fechas en `date` y festivos por país de la instalación compartidos con BL-38 (sin sedes: D-12). El motivo médico se trata según D-18 | ODO-24, PLA-17 | RR. HH. | 0.11 | medio | medio | BL-06, BL-70, BL-38 (D-18) |
| BL-73 | Departamentos en árbol con líder, gestores y raíz no borrable; meses pasados cerrados salvo para administración. El permiso por ascendencia en RLS (consulta recursiva, sin miembros materializados) es un ámbito de visibilidad como BL-51: el árbol entra con la 0.11 y la visibilidad por ascendencia solo si el cliente la pide (D-12) | PLA-24 | RR. HH. | 0.11 | medio | medio | BL-70 |

### 9. Condicionadas a un hecho externo

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-37 | Publicar las actividades programadas en el feed iCal por usuario de Calendario | MON-14 | Integración | cuando se porte Calendario | medio | bajo | BL-22; Calendario portado |
| BL-50 | Tokens de API por miembro: hash y prefijo visible (`erpnext.md`, «Qué no copiar»), vigencia hasta 365 días, revocación comprobada en cada llamada, tope de vigentes, sin crear tokens con un token, alcance de solo lectura probado por método. El token actúa con el rol de su dueño (PLA-19); TWE-16 proponía un rol propio filtrado por la tabla de roles: se decide al construir la API | PLA-19, TWE-16 | Integración | núcleo, cuando haya API pública | medio | medio | — |
| BL-51 | Ámbitos por sede o bodega separados del rol (lista de miembros, valor por defecto, modo estricto) y compartir un registro puntual, en RLS; solo a pedido de un cliente con varias sedes (D-12) | ERP-22, PLA-25 | Permisos | núcleo, a pedido | medio | alto | BL-11 |

## Funciones que comparten varias BL

El archivo aplicado no se edita: cada archivo con letra copia el cuerpo vigente de la función y la prueba de esquema lo compara con el anterior (patrón de `21b`). Antes de escribir el primer archivo de una tanda se fija por escrito el cuerpo final de cada función compartida.

| Función o política | BL que la reescriben | Nota |
|---|---|---|
| `crm_buscar` | BL-11, BL-20, BL-24 | `returns table`: cambiar columnas exige `drop function`, nuevos grants y actualizar `esquema.test.ts` y la verificación de 21 |
| `crm_preparar` | BL-02, BL-16 | Normalización del documento (BL-16) y sellado de `updated_by` y `creado_via` (BL-02) |
| `crm_registrar_cambio` | BL-02, BL-23 | Columnas no auditadas y fusión por autor |
| `crm_validar_campos` | BL-34, BL-42 | Obligatorio condicional y tipos nuevos |
| Políticas de lectura del CRM y storage de consentimientos | BL-11, BL-12a | Visibilidad por responsable y tope de lectura masiva |
| `has_perm`, unión de `autorizacion.mts` y `hasPerm` | BL-13 | Las tres uniones de permisos cambian juntas |

## Primer lote recomendado

Diez BL para una fase propia (0.3 o un cierre de la 0.2), no un paso corto: cinco son de esfuerzo medio. Todas tienen consumidor hoy (el registro, el CRM que se entregará al primer cliente o la administración de la instalación), ninguna depende de un módulo sin portar ni de una BL que no esté antes en el lote, y es más barato hacerlas antes de que haya datos cargados.

Decisiones previas: D-2 y D-3 (para BL-01a). Antes de escribir los archivos del lote se fija la firma final de `crm_buscar` (BL-11, BL-20) y el cuerpo final de `crm_preparar` (BL-02, BL-16).

1. **BL-01a** Dependencias reducidas y `--activar` con orden: es editar el registro y sus pruebas, y desbloquea el diseño de los ERP para una pyme de servicios.
2. **BL-02** Contrato base de tabla nueva: si cada ERP nace sin `updated_by` ni `creado_via`, habrá que migrar todas sus tablas. En el lote entra la regla con su prueba; el reajuste del CRM (21c) va con BL-23.
3. **BL-04** Ajustes declarados en el registro: BL-15a cambia la forma de los catálogos y esa forma se declara aquí.
4. **BL-15a** Catálogos con clave protegida: hoy renombrar la clave de una etapa o un origen deja huérfanos los registros que cargue el primer cliente.
5. **BL-10** Guarda del último administrador en la base: la interfaz ya bloquea el caso propio, pero la API y la baja en Supabase no; evita que un cliente sin área de sistemas quede fuera por esas vías.
6. **BL-16** Tipo de documento DIAN: la factura electrónica lo exige; es más barato migrar el documento antes de que haya cuentas cargadas, pero implica cambiar el índice único y la normalización, no solo añadir una columna.
7. **BL-18** Aviso de duplicados con una función de base: el importador deja de depender de lo que el usuario ve; el teléfono llega después con BL-19.
8. **BL-11** «Lo mío o sin asignar» con la regla mínima de BL-25: el CRM tal como se entregará muestra todas las cuentas, contactos, actividades, consentimientos e historial a quien tenga `app_crm`.
9. **BL-12a** Exportar como permiso aplicado en la base: hoy basta leer para descargar la base de cuentas, y un permiso solo en el botón no lo cambia.
10. **BL-20** Última actividad: un `max(fecha)` barato de hacer antes de la entrega; implica reemplazar `crm_buscar`.

Al abrir el primer esquema ERP, y no antes (sin consumidor chocan con «sin abstracciones para un solo uso»; se adelantan solo porque migrar tablas luego cuesta más): BL-05a (D-10), BL-06 con su primera entidad real, BL-07 y BL-08 (D-15).

Siguen, si sobra tiempo: BL-09 (concurrencia, incluida la escritura de `instalacion.ajustes`) y BL-17 (rotación de la clave de salud). BL-17 queda fuera porque añadir `clave_id` con un valor inicial más tarde es un `ADD COLUMN` sin migrar datos; se sube si el cliente exige rotación antes de la entrega.

## Descartado, aplazado y por qué

### Ideas aplazadas

`monica.md` deja las cuatro «anotadas para cuando lleguen»; se tratan igual.

| Origen | Propuesta | Motivo y cuándo se reabre |
|---|---|---|
| MON-18 | Convenciones de API pública (tope de `limit`, códigos de error propios, enlace `self`) | Sin API pública no hay consumidor; se reabre con BL-50. |
| MON-19 | Endpoint «cambios desde» con token de sincronización y lápidas | No hay app móvil ni conector que lo consuma; Supabase ya da lectura por `updated_at`. Se reabre si llega una app fuera de línea. |
| MON-20 | Tokens de API con alcance | Lo cubre BL-50 cuando haya API pública. |
| MON-21 | Idioma por miembro entre una lista de locales | El mercado del producto es Colombia (D-17); se reabre con clientes fuera. |

### Partes descartadas de una propuesta

| Origen | Parte | Motivo y cuándo se reabre |
|---|---|---|
| ERP-23 (parte, BL-43) | Casilla de enmascarar teléfono y correo separada de leer, con restauración del valor real, y «cupos» | Es otra idea distinta de restar una columna y no hay consumidor hoy; se reabre si un cliente pide ocultar contactos a ciertos roles. |
| MON-17 (parte, BL-36) | Importar vCard | La importación masiva la cubren ODO-18 y ERP-17 (BL-44) y Monica no tiene importación vCard para el usuario; se reabre si un cliente migra desde libretas de contactos. |
| TWE-18 (parte, BL-46) | Reintentos automáticos de 0 a 3 y «continuar si falla» | Choca con PLA-16: repetiría avisos. |
| TWE-18 (parte, BL-46) | Guardar los disparos rechazados como ejecuciones fallidas | La tarjeta de salud cubre los fallos de ejecución; se reabre cuando haya disparos externos (webhooks entrantes que activen reglas). |
| ERP-18 (parte) | Recurrencias que recuperan el día perdido | Sin consumidor en la 0.2; se reabre con la cobranza (BL-65). |
| ODO-09 (parte, BL-30) | Crear o enlazar la cuenta al convertir el prospecto | No aplica: la oportunidad cuelga de una cuenta ya existente (ERP-21, D-4 opción b). |
| PLA-08 (parte, BL-41) | Filtro compartido con una lista de usuarios | Complejidad de RLS frente a dos visibilidades; se reabre si un cliente la pide. |

### Partes que el producto ya tiene

| Origen | Parte quitada | Dónde está ya |
|---|---|---|
| PLA-04 (BL-12a, BL-12b) | CSV con BOM UTF-8, separador `;` y defensa contra fórmulas (no vienen de Huly) | `src/modulos/crm/lib/csv.ts` (`escribirCsv`, `neutralizar`) |
| ODO-18, ERP-17, PLA-18 (BL-44) | Tope de filas, alias de encabezados, detección de separador y BOM, plan por fila crear, actualizar o error, clave por documento normalizado o por tipo más nombre normalizado | `src/modulos/crm/lib/importador.ts` y `csv.ts` |
| TWE-02 (BL-02) | `created_by` sellado por la base sin excepción en el CRM | `crm_preparar` en `21-crm.sql` |
| MON-01 (BL-10) | Que un administrador no se quite su propio rol desde la interfaz | `src/pages/admin/MembersTab.tsx` |
| MON-12 (BL-14) | Que una acción figure en el registro, sin repetir y con su entrada de `REQUISITOS` | `componer` en `netlify/functions/connector-proxy.mts`, acciones en `netlify/lib/modulos/nucleo.mts`, `connector-proxy.test.ts`; `autorizacion.mts` define `Requisitos` y `cumpleRequisitos` |
| TWE-19 (BL-32) | Conteo de cuentas por etapa | `contadoresEtapa` en `src/modulos/crm/lib/vistas.ts` |
| ODO-22, PLA-23 (BL-42) | Clave estable separada de la etiqueta y tipos texto, número, fecha, lista y booleano con `filtrable` | `crm_campos_def` |

### Partes que solo existen en el esquema

| Origen | Parte | Estado |
|---|---|---|
| ODO-18 (BL-44) | Identificador externo estable para reimportar sin duplicar | `crm_vinculos_externos (origen, entidad, id_externo)` existe en `21-crm.sql`, pero ningún código la lee ni la escribe y `authenticated` solo tiene `select`: BL-44 la escribe. |

### Partes que chocan con una decisión

| Origen | Parte | Decisión | Qué hacer |
|---|---|---|---|
| ODO-12, ERP-06 (BL-63) | Que la nota crédito parcial reste del saldo de la factura | Decisión cerrada global «Las notas crédito parciales no restan de la factura» (2026-10-14), tomada para la Gerencia del portal de la empresa de origen | Pregunta abierta al usuario (D-5). Hasta la respuesta, BL-63 cruza solo pagos y anticipos y BL-60 se lee como borrador en ese punto. |
| PLA-10 (BL-35) | Mover las cuentas al núcleo | PP-DEC-18 | La reabriría; la opción c de D-3 (tercero neutral enlazable a la cuenta) no la reabre. |

### Partes que no entran hasta que alguien las pida

| Origen | Parte | Por qué | Cuándo |
|---|---|---|---|
| ERP-22, PLA-25 (BL-51 entero) | Ámbitos por sede o bodega | Ninguna decisión lo cierra (D-12 no reabre PP-DEC-01: un ámbito no es una razón social); la ficha de Odoo lo desaconseja | Cuando un cliente con varias sedes lo pida. |

Las ideas que cada ficha ya rechazó en su sección «Qué no copiar» (DDL en caliente, multiempresa, código evaluado, motores de abastecimiento, sincronización IMAP, PDF con Chrome dentro de una función, IA de pago fuera de Gemini) no son propuestas y no se repiten aquí.
