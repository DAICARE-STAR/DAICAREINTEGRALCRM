# Backlog fusionado de las propuestas ERP y CRM

Las 117 propuestas de `odoo.md`, `erpnext.md`, `twenty.md`, `monica.md` y `platform.md` (Huly), fusionadas cuando son la misma idea y priorizadas para TailorSuite. Quedan **73 BL**. Cada BL conserva todos sus ids de origen; un id aparece en dos BL cuando su propuesta tenía dos partes que van a fases distintas (TWE-08, TWE-16, PLA-23, MON-17, ERP-15). Dos ids se descartan (ver «Descartado y por qué»). El contexto de cada dominio y las decisiones pendientes están en `comparativa.md`.

## Cómo leer

- **Fase**: 0.2 CRM, núcleo (o registro), 0.7 inventario y compras, 0.8 ventas y pedidos, 0.9 facturación y cartera, 0.10 contabilidad, 0.11 RR. HH.
- **Valor** para una pyme y **esfuerzo** sobre Postgres con RLS, React y Netlify Functions: alto, medio o bajo. Son estimaciones de las fichas, no medidas.
- **Depende de**: otra BL que debe ir antes; «—» si ninguna.
- **D-n**: decisión de `comparativa.md` que hay que tomar antes de construir esa BL.
- Todo cambio de esquema va en un archivo nuevo de `supabase/esquema` (PP-DEC-02); nada toca `21-crm.sql`. Nada de salud entra en historial, búsqueda, exportación, plantillas, enlaces ni integraciones (PP-DEC-19).

## Orden

1. **Ya, en el núcleo y el registro**: contratos baratos que, si se dejan para después, obligan a migrar tablas de varios módulos (BL-01 a BL-17).
2. **CRM 0.2**: cierres del módulo que ya usa el primer cliente (BL-18 a BL-37).
3. **Núcleo transversal antes de la 0.7**: piezas que comparten todos los ERP (BL-38 a BL-51).
4. **Por fase**: 0.7 (BL-52 a BL-58), 0.8 (BL-59), 0.9 (BL-60 a BL-67), 0.10 (BL-68 y BL-69), 0.11 (BL-70 a BL-73).

## Tabla priorizada

### 1. Ya: núcleo y registro

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-01 | Dependencias de los ERP planeados reducidas al modelo que se lee, lo demás en `integra`, un puente declarado por pareja que se aplica cuando coexisten, y `--activar` que ofrece el orden de `dependenciasDe` en vez de solo rechazar (D-2) | ODO-01 | Módulos | registro | alto | bajo | — |
| BL-02 | Contrato base de toda tabla de negocio: `created_by` y `updated_by` sellados por trigger, `origen` (manual, importación, API, regla, sistema) y `archivado_en`, exigido por una prueba de esquema a cada tabla de un módulo con `sql` | TWE-02 | Extensibilidad | núcleo; 0.2 CRM | alto | bajo | — |
| BL-03 | Las filas que siembra un módulo (vistas estándar, catálogos, reglas) llevan un UUID estable y la columna `modulo`, para resembrar sin duplicar y retirar lo del módulo sin tocar lo del cliente | TWE-15 | Módulos | registro | medio | bajo | — |
| BL-04 | Ajustes de cada módulo declarados en el registro como ya se hace con `limites` (clave, tipo, obligatorio, opciones, alcance) y validados por `modulos.mjs` | TWE-12 | Módulos | registro | medio | bajo | — |
| BL-05 | Numeración en la base: tabla de series (prefijo, relleno, actual, tope, vigencia, reinicio) con incremento atómico, modo con huecos para cotizaciones y pedidos, modo sin huecos para lo fiscal y número fiscal asignado al publicar (D-7, D-10) | ODO-06, ERP-01 | Automatización | núcleo | alto | bajo | — |
| BL-06 | Máquina de estados por entidad: estados con categoría fija, tabla de transiciones con su permiso y función `aplicar_transicion` con `UPDATE … WHERE estado = esperado` que exige exactamente una fila afectada y deja registro | PLA-06, TWE-03 | Automatización | núcleo | alto | medio | — |
| BL-07 | Escritura por estado: se edita y se borra solo en borrador; lo publicado no se edita y se revierte con un documento enlazado | ODO-05 | Permisos | núcleo | alto | bajo | BL-06 |
| BL-08 | Moneda como par inseparable (importe `numeric` más código ISO 4217) en todo documento y como tipo de campo propio; nunca un importe sin moneda | TWE-04 | Finanzas | núcleo | alto | bajo | — |
| BL-09 | Control de edición concurrente: la edición envía el `updated_at` leído y se rechaza si la fila cambió entre medias | MON-15 | Permisos | núcleo; 0.2 CRM | medio | bajo | — |
| BL-10 | La instalación nunca queda sin administrador: nadie se quita su propio rol admin ni se borra, y no se retira el último admin (trigger en `user_roles` y `profiles`) | MON-01 | Permisos | núcleo | alto | bajo | — |
| BL-11 | Visibilidad «lo mío o sin asignar» más el permiso `ver_todo_crm`, sembrado en los roles existentes para no quitar acceso a nadie | ODO-03 | Permisos | 0.2 CRM | alto | bajo | — |
| BL-12 | Exportar como permiso propio, comprobado en la exportación y en las lecturas masivas, y exportador común del núcleo que reutiliza el CSV del CRM (BOM y `;` ya existen) con versión asíncrona a Storage | ODO-08, PLA-04 | Permisos e integración | núcleo; 0.2 CRM | alto | bajo | — |
| BL-13 | Prohibiciones explícitas en los roles con la regla «denegar gana» («edita ventas pero no anula», «ve cartera pero no exporta») (D-9) | PLA-11 | Permisos | núcleo | medio | bajo | — |
| BL-14 | Prueba que falla si una acción de `autorizacion.mts` nombra un permiso o módulo que no está en el registro, si un permiso de módulo no exige su módulo o si una acción no declara requisitos | MON-12 | Permisos | núcleo | medio | bajo | — |
| BL-15 | Catálogos con contrato: clave inmutable, nombre editable, color, orden y `activo`; marca de sistema renombrable y no borrable; una clave en uso no se borra (regla en la función que escribe ajustes); etiquetas como catálogo con color y filtro que muestra solo las usadas | TWE-11, MON-11, MON-08 | Extensibilidad | 0.2 CRM; núcleo | medio | bajo | BL-04 |
| BL-16 | Tipo de documento con código DIAN (NIT 31, CC 13, CE 22, pasaporte 41, PEP 47, PPT 48 y otros) guardado aparte del número, con el dígito de verificación separado y validado | ODO-02, PLA-23 | CRM | 0.2 CRM | alto | bajo | — |
| BL-17 | Rotación de la clave de salud: `clave_id` por fila en `crm_salud` y secretos versionados en Vault; se lee con la clave de la fila y se escribe con la vigente | TWE-06 | Permisos | 0.2 CRM | alto | bajo | — |

### 2. CRM 0.2

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-18 | Aviso de duplicados al crear o editar cuenta o contacto: criterios por entidad como datos (documento, correo, teléfono en dígitos, nombre por trigramas con puntaje), también contra las archivadas con oferta de reactivar, aviso o bloqueo según ajuste y una sola función para el formulario y el importador | ODO-19, ERP-15, TWE-05, PLA-01 | CRM | 0.2 CRM | alto | bajo | — |
| BL-19 | Varios teléfonos, correos y WhatsApp por cuenta y contacto como filas tipadas (tipo, valor normalizado, principal, verificado, archivado) con protocolo por tipo que arma el enlace, rellenadas desde las columnas actuales | MON-02, PLA-20 | CRM | 0.2 CRM | alto | medio | — |
| BL-20 | Última actividad por cuenta calculada al leer (en `crm_buscar`) y filtro «sin actividad hace N días» | TWE-01 | CRM | 0.2 CRM | alto | bajo | — |
| BL-21 | Estancamiento: `dias_estancada` por etapa en el catálogo, fecha del último cambio de etapa y tiempo por etapa derivado de `crm_cambios` | ODO-04 | CRM | 0.2 CRM | alto | bajo | BL-15 |
| BL-22 | Actividades programadas: vencimiento, responsable, estado calculado (vencida, hoy, planificada), cierre con retroalimentación que pasa al historial y siguiente sugerida; el nombre del autor se guarda también como texto | ODO-10, MON-07 | CRM | 0.2 CRM | alto | medio | — |
| BL-23 | Historial con menos ruido: fundir los cambios seguidos del mismo autor sobre la misma entidad dentro de diez minutos y lista de columnas no auditadas | TWE-10 | CRM | 0.2 CRM | medio | bajo | — |
| BL-24 | Modos de fecha con nombre en los filtros (vencido, hoy, esta semana, este mes, próximos, sin fecha, rango) evaluados en hora de Bogotá, con una tabla de operandos por tipo compartida entre shell y servidor | PLA-02, TWE-08 | Extensibilidad | núcleo; 0.2 CRM | alto | bajo | — |
| BL-25 | Retirar a un miembro pidiendo a quién pasa su cartera (cuentas y pendientes) antes de la baja, en vez de dejarla sin responsable | MON-06 | Permisos | núcleo; 0.2 CRM | alto | medio | — |
| BL-26 | «Mis cuentas»: seguidores automáticos (quien crea y el responsable) con aviso de cambio de etapa y de actividad nueva, más favoritos y frecuentes por usuario | PLA-12, MON-10 | CRM | 0.2 CRM | medio | bajo | — |
| BL-27 | Relaciones entre cuentas con tipo directo e inverso nombrados (acudiente de y a cargo de, matriz y filial, refirió a), catálogo en ajustes y par único | MON-09 | CRM | 0.2 CRM | medio | bajo | BL-15 |
| BL-28 | Línea de tiempo común de la cuenta: tabla de eventos de solo anexión que llenan los triggers de cada módulo, mezclada con actividades y cambios y con una lectura legible («pasó de Valoración a Propuesta») | MON-04, PLA-13 | CRM | 0.2 CRM; cada ERP | alto | medio | BL-02 |
| BL-29 | Ficha de cuenta armada por bloques que declara cada módulo en el registro (componente, lateral o pestaña, registros por página), con orden guardado por instalación | MON-05 | Extensibilidad | registro; 0.2 CRM | alto | medio | — |
| BL-30 | Oportunidad como entidad aparte de la cuenta: monto con moneda, cierre esperado, etapa, probabilidad; perdida es archivada con motivo de catálogo y no se pierde con una cotización vigente; la etapa de la cuenta se conserva para seguimiento (D-4) | ODO-09, ERP-21 | CRM y ventas | 0.2 CRM; 0.8 | alto | medio | BL-08, BL-15 |
| BL-31 | Fusión de cuentas en una función transaccional: cuenta prioritaria, elección campo por campo, simulación, reapunte de una lista cerrada de tablas hijas, negativa si se pierden datos que el usuario no puede leer, `edit_salud` y MFA si hay salud, y fila de traza propia | TWE-17, PLA-21, ERP-15 | CRM | 0.2 CRM | medio | medio | BL-18 |
| BL-32 | Tablero kanban por etapa con conteo por columna (suma de valor si hay oportunidad), columnas con orden y visibilidad guardados y orden manual por rango entre vecinos | TWE-19, PLA-14 | CRM | 0.2 CRM; 0.8 | medio | medio | BL-30 para la suma |
| BL-33 | Recordatorios por cuenta, de una vez o cada N días, meses o años, con programación separada de envíos y procesador que aísla el fallo de cada aviso | MON-03 | Automatización | 0.2 CRM | alto | medio | BL-38 |
| BL-34 | Obligatorio condicional en campos propios («obligatorio si etapa = X»), declarado en `crm_campos_def` y comprobado en el trigger que ya valida los campos | TWE-21 | Extensibilidad | 0.2 CRM | medio | medio | — |
| BL-35 | Cliente y proveedor como roles de la cuenta (tabla satélite), asignados a demanda al primer pedido o compra, en lugar de tablas de terceros por módulo (D-3) | PLA-10 | CRM y ventas | 0.2 CRM; 0.7 a 0.9 | alto | medio | — |
| BL-36 | Descargar una cuenta o un contacto como `.vcf` | MON-17 | Integración | 0.2 CRM | bajo | bajo | — |
| BL-37 | Publicar las actividades programadas en el feed iCal por usuario de Calendario | MON-14 | Integración | 0.2 CRM | medio | bajo | BL-22; Calendario portado |

### 3. Núcleo transversal antes de la 0.7

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-38 | Tabla única de eventos programados y esperas: alta por upsert, cancelación por prefijo, reclamo atómico marcado en la misma transacción, barrido por `pg_cron` o función programada, «N días después de un campo» que se reprograma si el campo cambia, festivos colombianos como dato y espera con tiempo máximo (D-8) | TWE-07, PLA-07 | Automatización | núcleo | alto | medio | — |
| BL-39 | Plantillas de aviso y de mensaje editables por instalación con marcadores de una lista cerrada por entidad, valor por defecto, escape según destino, validación al guardar, sin envío si el asunto queda vacío y preferencia por tipo y canal | TWE-13, PLA-15 | Automatización | núcleo | medio | bajo | — |
| BL-40 | Canal de aviso con contador de fallos, bitácora de envíos con el error y desactivación tras N fallos, visible para el miembro | MON-13 | Automatización | núcleo | medio | bajo | — |
| BL-41 | Vistas guardadas en el servidor: vista oficial que siembra cada módulo, columnas por usuario y filtros con nombre privados o de equipo (publicar exige permiso), saneados contra los campos vigentes al cargar; columnas de kanban bloqueadas en estados calculados | ODO-20, ERP-20, TWE-08, PLA-08 | Extensibilidad | núcleo | alto | medio | BL-03, BL-24 |
| BL-42 | Campos propios generalizados: más tipos (moneda, fecha y hora, etiquetas, relación, NIT con DV), otras entidades, registro de tipos en el shell (editor, celda, filtro, validador), listas de opciones compartidas y purga de valores al borrar un campo | ODO-22, PLA-23 | Extensibilidad | núcleo | medio | medio | BL-08, BL-15 |
| BL-43 | Permiso por campo que solo resta: lectura por vista o función sin la columna, escritura vigilada por un trigger que compara OLD y NEW, e historial filtrado con la misma lista (costos, márgenes, salarios) | ERP-23, TWE-09, PLA-22 | Permisos | núcleo | alto | medio | — |
| BL-44 | Importador general: simulacro que termina en ROLLBACK, todos los errores por fila antes de insertar, mapeo de columnas sugerido y recordado, mapeo de valores, cuenta con contactos en un archivo, lotes con reanudación, `crm_vinculos_externos` como id externo, manejadores por módulo con orden y lo no mapeado como nota visible | ODO-18, ERP-17, PLA-18, MON-17 | Integración | núcleo | alto | alto | BL-02, BL-18 |
| BL-45 | Aprobación genérica: solicitud sobre cualquier documento con aprobadores, regla «n de m», acciones al aprobar y al rechazar de un catálogo cerrado, cancelación de pendientes al primer rechazo y columna `bloqueado` que la base hace cumplir | PLA-05, PLA-03 | Automatización | núcleo | alto | medio | BL-06 |
| BL-46 | Motor único de reglas: disparadores y acciones de catálogo cerrado, condición como árbol JSON, cola en la misma transacción con `SKIP LOCKED`, profundidad máxima, prueba en seco, `last_run` fijado al crear, errores aislados por regla con estado «con error» hasta reintento manual, versiones con una sola activa, ejecución con copia congelada, tarjeta de salud, retención y tablas vedadas | ODO-25, ERP-18, TWE-18, PLA-16 | Automatización | núcleo | alto | alto | BL-38, BL-39 |
| BL-47 | Cuando la IA o una regla lean o escriban datos, actúan con la intersección entre el rol del miembro y un rol limitante, y nunca sobre roles, auditoría, salud ni consentimientos | TWE-14 | Permisos | núcleo (ia) | medio | bajo | BL-46 |
| BL-48 | Enlace público revocable con vencimiento obligatorio y restricciones para compartir cotización, pedido o estado de cuenta: hash del token y lectura por función de una vista mínima | PLA-09 | Integración | núcleo; 0.8 | alto | medio | — |
| BL-49 | Webhooks salientes sobre una lista explícita de entidades: fila de salida en la misma transacción, HMAC con marca de tiempo, bitácora con reintento escalonado, bloqueo SSRF, apagado con aviso tras fallos y rol que filtra los eventos | ERP-25, TWE-16 | Integración | núcleo | medio | medio | — |
| BL-50 | Tokens de API por miembro: hash y prefijo visible, vigencia hasta 365 días, revocación comprobada en cada llamada, tope de vigentes, alcance de solo lectura probado por método, el token actúa con el rol de su dueño; convenciones de la API (tope de `limit`, códigos de error propios, enlace `self`) | PLA-19, MON-20, TWE-16, MON-18 | Integración | núcleo | medio | medio | — |
| BL-51 | Ámbitos por sede o bodega separados del rol (lista de miembros, valor por defecto, modo estricto) y compartir un registro puntual, en RLS; solo a pedido de un cliente (D-12) | ERP-22, PLA-25 | Permisos | núcleo | medio | alto | BL-11 |
### 4. Fase 0.7: inventario y compras

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-52 | Unidad base única por producto; cada línea de orden, recepción o movimiento guarda unidad, factor y cantidad convertida, que no cambian si luego se corrige el factor | ERP-04 | Operaciones | 0.7 (catálogo de productos) | alto | bajo | Productos portado |
| BL-53 | Inventario como libro de solo inserción de movimientos entre ubicaciones (proveedor, cliente, ajuste y producción como virtuales), saldo por producto, bodega y lote materializado con bloqueo de fila, anulación por reverso, «almacenable» separado de lote o serie, costo promedio, sin movimientos anteriores al último cierre y bodegas en árbol (D-11) | ODO-17, ERP-16 | Operaciones | 0.7 | alto | alto | BL-06, BL-52 |
| BL-54 | Conteo físico como documento (apertura, conciliación, ajuste) que genera movimientos por la diferencia y avisa si el saldo cambió después de contar; es la carga inicial de cada instalación | ERP-14 | Operaciones | 0.7 | alto | medio | BL-53 |
| BL-55 | Existencias proyectadas calculadas en una vista y reposición mínimo-máximo contra la proyección, con reglas por producto y bodega, cantidad manual que pisa la sugerida y trabajo programado que genera solicitudes | ODO-15, ERP-03 | Operaciones | 0.7 | alto | medio | BL-53, BL-38 |
| BL-56 | Avance derivado de las líneas (recibido, entregado, facturado en porcentaje), política de facturación por producto (lo pedido o lo recibido) y estado del documento derivado por una tabla de reglas ordenadas | ODO-14, ERP-12 | Operaciones y ventas | 0.7; 0.8; 0.9 | alto | medio | BL-06 |
| BL-57 | Reglas de autorización por monto o descuento (documento, base, umbral, aprobador por rol o usuario, prioridad usuario, rol, global); la orden de compra pasa a «por aprobar» sobre el umbral; sin autoaprobación y sin paso libre del administrador (D-9) | ERP-02, ODO-07 | Automatización | 0.7; 0.8 | alto | bajo | BL-45 |
| BL-58 | Recepción con cantidad aceptada y rechazada, bodega de rechazo, recepción parcial con pendiente y tolerancia de sobrerrecepción global y por producto | ERP-19 | Operaciones | 0.7 | medio | bajo | BL-53 |

### 5. Fase 0.8: ventas y pedidos

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-59 | Cadena documental trazable e idempotente (oportunidad, cotización, pedido, factura): cada destino guarda el id de origen con índice único parcial y una función tipada por par copia lo necesario | ERP-13 | CRM y ventas | 0.8 | alto | medio | BL-06, BL-30 |

### 6. Fase 0.9: facturación y cartera

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-60 | Documento contable único (factura, nota, asiento) con saldo firmado, CHECK en las líneas, una sola función de publicación que valida cuadre con tolerancia y línea de redondeo, periodo abierto y cuenta habilitada; líneas sin UPDATE ni DELETE y anulación por reverso (D-6) | ODO-11, ERP-05 | Finanzas | 0.9 (lo usa 0.10) | alto | medio | BL-05, BL-07 |
| BL-61 | Impuestos como filas del documento (sobre neto, sobre fila previa, incluido en precio) con cuenta, plantilla por producto y regla que la elige según el tercero, sembrados con tarifas colombianas verificadas y vigencia, no copiadas | ODO-13, ERP-08 | Finanzas | 0.9 (el cotizador la reutiliza) | alto | medio | BL-60 |
| BL-62 | Retenciones por concepto con tasa por vigencia, base mínima en UVT y cuenta, y un registro por retención aplicada que alimenta los certificados | ERP-09 | Finanzas | 0.9 | alto | medio | BL-61 |
| BL-63 | Cartera derivada: cruces parciales entre líneas débito y crédito, saldo, estado de pago y vencimiento derivados, antigüedad con rangos configurables y ninguna tabla de saldos que cuadrar (D-5) | ODO-12, ERP-06 | Finanzas | 0.9 | alto | medio | BL-60 |
| BL-64 | Recibo de pago con asignación a varias facturas, saldo sin asignar como anticipo y deducciones (retenciones que practica el cliente) a su cuenta; no se guarda con diferencia y se puede deshacer | ERP-07 | Finanzas | 0.9 | alto | medio | BL-63 |
| BL-65 | Estado de cuenta por cliente enviado en lote con su ciclo y cobranza escalonada por niveles con estado derivado del saldo (D-13) | ERP-24 | Finanzas y automatización | 0.9 | medio | medio | BL-63, BL-46, BL-39 |
| BL-66 | Webhooks entrantes (pagos, WhatsApp, factura electrónica) con HMAC y marca de tiempo, idempotencia por id de evento y 2xx ante lo que no se procesa | MON-16 | Integración | 0.9 | medio | bajo | — |
| BL-67 | Gráficas agregadas en la base con `date_trunc` y `generate_series` en hora de Bogotá, días sin datos en cero y topes de barras, grupos y puntos | TWE-20 | Automatización (informes) | 0.9 (y Gerencia) | medio | medio | Gerencia portado |

### 7. Fase 0.10: contabilidad

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-68 | Plan de cuentas como plantilla anidada (número, tipo semántico, tipo raíz) sembrada con el PUC simple reconstruido desde la norma pública, y cuentas por defecto (cobrar, pagar, IVA, redondeo) en los ajustes | ERP-10 | Finanzas | 0.10 | alto | medio | BL-60 |
| BL-69 | Cierre por fecha de bloqueo global y de impuestos y por periodo y tipo de documento, con rol exento nombrado, excepciones temporales por usuario con motivo y vencimiento, y sin paso libre del administrador (D-9) | ODO-21, ERP-11 | Finanzas y permisos | 0.10 (aplica a 0.7 a 0.9) | alto | medio | BL-60 |

### 8. Fase 0.11: RR. HH.

| BL | Propuesta | Origen | Dominio | Fase | Valor | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|---|
| BL-70 | Empleado en dos capas: tabla privada para RR. HH. y vista pública de solo lectura; más campos para el jefe según la cadena de mando; cumpleaños solo si el empleado lo autoriza | ODO-16 | RR. HH. | 0.11 | alto | medio | BL-43 |
| BL-71 | Versiones fechadas del empleado (un cambio copia la vigente) y contrato en tabla propia con exclusión de solapes | ODO-23 | RR. HH. | 0.11 | medio | medio | BL-70 |
| BL-72 | Ausencias: tipos editables con banderas y factor firmado, saldo calculado desde asignaciones, transiciones por rol, descripción privada, fechas en `date` y festivos por sede como dato compartido con BL-38 | ODO-24, PLA-17 | RR. HH. | 0.11 | medio | medio | BL-06, BL-70 |
| BL-73 | Departamentos en árbol con líder, gestores y raíz no borrable; permiso por ascendencia en RLS con consulta recursiva, sin miembros materializados; meses pasados cerrados salvo para administración | PLA-24 | RR. HH. | 0.11 | medio | medio | BL-70 |

## Primer lote recomendado

Doce BL que caben en una fase corta (0.3 o un cierre de la 0.2): todas son de esfuerzo bajo salvo BL-06, ninguna depende de un módulo sin portar y fijan contratos que después costaría migrar.

1. **BL-01** Dependencias blandas y puentes: es editar el registro y sus pruebas, y desbloquea el diseño de los ERP para una pyme de servicios.
2. **BL-02** Contrato base de tabla: si cada ERP nace sin `updated_by` ni `origen`, habrá que migrar todas sus tablas.
3. **BL-05** Numeración en la base: la primera tabla con consecutivo (cotización o pedido) la necesita y la DIAN exige el modo sin huecos.
4. **BL-06** Máquina de estados con transición atómica: es la pieza que compras, ventas, facturación y RR. HH. usarán igual; mejor una que cuatro.
5. **BL-08** Moneda como par: decidirla antes del primer importe evita migrar montos con el conector `cambio` ya en uso.
6. **BL-10** Guarda del último administrador: un trigger, y evita que un cliente sin área de sistemas quede fuera de su instalación.
7. **BL-11** «Lo mío o sin asignar»: el CRM en uso hoy muestra todas las cuentas a quien tenga `app_crm`.
8. **BL-12** Exportar como permiso: hoy basta leer para descargar toda la base de cuentas.
9. **BL-15** Catálogos con clave inmutable: renombrar un origen o una etiqueta deja huérfanos los registros del primer cliente.
10. **BL-16** Tipo de documento DIAN: la factura electrónica lo exige y es una columna antes de que haya miles de cuentas.
11. **BL-18** Aviso de duplicados: los índices trigrama ya están; falta la función y la llamada desde el formulario.
12. **BL-20** Última actividad: un `max(fecha)` sobre un índice que ya existe y un filtro que el equipo de seguimiento usa a diario.

Siguen, si sobra tiempo: BL-09 (concurrencia), BL-17 (rotación de la clave de salud) y BL-07 (escritura por estado, sobre BL-06).

## Descartado y por qué

### Ideas descartadas

| Origen | Propuesta | Motivo |
|---|---|---|
| MON-19 | Endpoint «cambios desde» con token de sincronización y lápidas | No hay app móvil ni conector que lo consuma; Supabase ya da lectura por `updated_at`. Se reabre si llega una app fuera de línea. |
| MON-21 | Idioma por miembro entre una lista de locales | El producto trabaja en español de Colombia y no hay clientes fuera; las fichas tampoco proponen traducir. |

### Partes que el producto ya tiene

Ninguna propuesta estaba cubierta entera; estas partes se quitaron de su BL porque ya existen:

| Origen | Parte descartada | Dónde está ya |
|---|---|---|
| PLA-04 (BL-12) | CSV con BOM UTF-8, separador `;` y defensa contra fórmulas | `src/modulos/crm/lib/csv.ts` (`escribirCsv`, `neutralizar`) |
| ODO-18, ERP-17, PLA-18 (BL-44) | Tope de filas, alias de encabezados, detección de separador y BOM, plan por fila crear, actualizar o error, clave por documento normalizado | `src/modulos/crm/lib/importador.ts` y `csv.ts` |
| ODO-18 (BL-44) | Identificador externo estable para reimportar sin duplicar | `crm_vinculos_externos (origen, entidad, id_externo)` |
| TWE-02 (BL-02) | `created_by` sellado por la base sin excepción | `crm_preparar` en `21-crm.sql` |
| MON-12 (BL-14) | Requisitos por acción y negativa ante un módulo desconocido | `netlify/lib/autorizacion.mts` (`Requisitos`, `cumpleRequisitos`) |
| TWE-19 (BL-32) | Conteo de cuentas por etapa | `contadoresEtapa` en `src/modulos/crm/lib/vistas.ts` |
| ODO-22, PLA-23 (BL-42) | Clave estable separada de la etiqueta y tipos texto, número, fecha, lista y booleano con `filtrable` | `crm_campos_def` |

### Partes que chocan con una decisión y no entran

| Origen | Parte | Decisión | Si valdría reabrirla |
|---|---|---|---|
| ODO-12, ERP-06 (BL-63) | Que la nota crédito parcial reste del saldo de la factura | Decisión cerrada global «Las notas crédito parciales no restan de la factura» (2026-10-14) | Sí, solo para el producto y con el contador (D-5). Mientras no se reabra, BL-63 cruza solo pagos y anticipos. |
| PLA-10 (BL-35), opción de mover las cuentas al núcleo | Cuentas fuera del módulo `crm` | PP-DEC-18 | No por ahora (D-3): solo si un cliente pide compras sin CRM. |
| PLA-25, ERP-22 (BL-51) | Ámbito por sede como columna en todas las tablas desde ya | Ninguna; la ficha de Odoo lo desaconseja y PP-DEC-01 fija una empresa por instalación | No mientras ningún cliente con varias sedes lo pida (D-12). |
| MON-02, PLA-20 (BL-19) | Integración de mensajería por WhatsApp | Decisión cerrada global sobre Evolution API y el número comercial | No hace falta: BL-19 solo arma el enlace para abrir el chat. |

Las ideas que cada ficha ya rechazó en su sección «Qué no copiar» (DDL en caliente, multiempresa, código evaluado, motores de abastecimiento, sincronización IMAP, PDF con Chrome dentro de una función, IA de pago fuera de Gemini) no son propuestas y no se repiten aquí.
