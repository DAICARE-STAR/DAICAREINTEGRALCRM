# Revisión crítica de la comparativa y el backlog

`comparativa.md` y `backlog.md` los escribió un solo agente. El 2026-11-17 pasaron por una revisión adversarial con cinco lentes independientes; un segundo agente verificó cada objeción contra el repo, las fichas y los clones (veredicto CONFIRMADA o PARCIAL; las descartadas no figuran) y un tercero aplicó las correcciones a los dos documentos. Las fichas por repo (`odoo.md`, `erpnext.md`, `twenty.md`, `monica.md`, `platform.md`) no se tocaron: sus correcciones quedan pendientes y se listan al final.

## En resumen

- 87 objeciones verificadas: 8 de gravedad alta, 46 media y 33 baja. Todas quedaron aplicadas en `comparativa.md` y `backlog.md`; 18 piden además corregir una ficha.
- Lo que más cambió: el primer lote (de 12 a 10 BL, con BL-04 dentro y BL-05, BL-06 y BL-08 fuera hasta abrir el primer esquema ERP), la cadena contable (plan de cuentas y fecha de bloqueo antes de la publicación), seis BL partidas en dos filas, seis decisiones nuevas (D-14 a D-19) y D-5 convertida en pregunta al usuario.
- Varias propuestas que el sintetizador atribuía a los repos son diseño propio: numeración fiscal sin huecos, libro de inventario de solo inserción, cartera derivada al leer, guarda del último administrador por conteo, traspaso de cartera al dar de baja, protección de catálogos en uso, criterios de duplicados.
- El backlog sigue en 73 BL (79 filas). Un script comprobó que los 117 ids de origen están en una BL o en la tabla de aplazadas y que ninguna BL depende de otra de un grupo posterior.

## Lentes aplicadas y su cobertura

| Lente | Qué buscaba | Cobertura |
|---|---|---|
| Trazabilidad | Que cada BL conserve el alcance, el valor y el esfuerzo de sus ids de origen y que lo quitado quede registrado | Los 117 ids comprobados por script contra la columna Origen; los 73 BL comparados uno por uno con sus propuestas; dependencias, primer lote y tablas de descarte. No abrió los clones ni el código del producto. |
| Producto | Que lo que se afirma del estado de Bash Logistics sea cierto en el repo | `modulos.ts`, `modulos.mjs`, `21-crm.sql` (tablas, triggers, búsqueda, políticas, catálogos), `00-base.sql`, `04-instalacion-modulos.sql`, librerías y pantallas del CRM (importador, exportador, datos, ajustes), `MembersTab.tsx`, `autorizacion.mts` y `connector-proxy.mts` con sus pruebas, glosario, PP-DEC-01 a 20, HANDOFF, CHANGELOG y git log. |
| Decisiones | Que las recomendaciones respeten las PP-DEC y las decisiones cerradas, y que no falten decisiones | D-1 a D-13 contra PP-DEC-01 a 20, `decisiones-cerradas.md` vigente (incluidas WA-DEC del 2026-11-17), `00-principios.md`, el registro, el glosario, `docs/origen.md` y `docs/seguridad`. No abrió los clones. |
| Prioridad | Que el orden, las dependencias y los esfuerzos se sostengan contra el código | Todo el backlog y la comparativa; `21-crm.sql` desde la línea 105; partes de `00-base.sql`, `modulos.mjs`, el CRM, `autorizacion.mts`, `types.ts` y `AuthContext.tsx`. Esfuerzo contrastado contra el código solo para el primer lote y BL-13, BL-17, BL-20, BL-24 y BL-60. |
| Citas | Que lo atribuido a cada repo esté en el clon | Citas abiertas en `investigacion-erp` para los 12 BL del primer lote original, 12 BL de valor alto y BL-24. Sostenidas sin objeción de fondo: BL-11, BL-12 (salvo PLA-04), BL-30, BL-31, BL-38, BL-43, BL-45, BL-60, BL-64 (salvo un detalle), BL-22, BL-16 (códigos). Los archivos de Twenty revisados no llevan cabecera Enterprise. |

## Objeciones y qué se cambió

Gravedad: A alta, M media, B baja. Veredicto: C confirmada, P parcial (la objeción era cierta en parte; se aplicó la corrección final del verificador).

### Trazabilidad

| # | Dónde | Problema | Grav. | Ver. | Qué se cambió |
|---|---|---|---|---|---|
| T1 | BL-54 | El aviso de saldo cambiado tras contar se atribuía a ERP-14; es de Odoo | M | P | Se conserva y se atribuye a `odoo.md` |
| T2 | BL-43 | Se perdía el enmascarado de teléfono y correo de ERP-23 | M | C | Fila en «Partes descartadas» con motivo y reapertura |
| T3 | BL-12, BL-41, BL-44 | Se perdían plantillas de exportación (ODO-20), transformación por columna (PLA-04) y exportación reimportable (ERP-17) | M | C | Nueva fila BL-12b con las tres; ODO-20 y ERP-17 en su origen; lista de ids repetidos al día |
| T4 | BL-36 | Se perdía la importación vCard de MON-17 y el valor bajaba sin motivo | B | C | Importación vCard aplazada con motivo; valor bajo justificado |
| T5 | BL-46 | Conflicto de reintentos TWE-18 frente a PLA-16 sin registrar; «tablas vedadas» duplicada con BL-47 | M | C | Nota que adopta PLA-16; «tablas vedadas» solo en BL-47; partes de TWE-18 y ERP-18 descartadas con motivo |
| T6 | BL-50, BL-47 | Rol del token adoptado en silencio; faltaba «sin crear tokens con un token»; fase adelantada sin API | M | P | Decisión de rol declarada; regla añadida; «prefijo visible» se conserva con su fuente; BL-50 a condicionadas; BL-47 con fase condicionada |
| T7 | BL-18 | Sin relación declarada con BL-19; esfuerzo bajo frente a ERP-15 medio; aviso o bloqueo sin constancia | M | C | Dependencias declaradas, aviso por defecto con bloqueo opcional, esfuerzo medio, frase del lote al día |
| T8 | BL-15 | Dependía de BL-04, fuera del lote, sin origen citable | M | C | BL-04 entra al lote con su justificación |
| T9 | BL-28 | PLA-13 (bajo, sin tabla nueva) atado a MON-04 y a BL-02 | M | C | PLA-13 pasa a BL-23; BL-28 solo con MON-04, fase «cada ERP», sin dependencia |
| T10 | BL-33, BL-38 | BL-33 (grupo 2) dependía de BL-38 (grupo 3) y duplicaba su tabla | M | P | BL-33 pasa al grupo 3 tras BL-38 y usa su tabla; recuperar el día perdido (ERP-18) descartado |
| T11 | BL-60, BL-63 | Dos arquitecturas fundidas sin decir cuál; Inventario omitido | M | P | BL-60 declara el modelo de Odoo y la función única de ERP-05 también para Inventario; BL-63 nombra cruces y suma firmada |
| T12 | BL-62 | Las retenciones de ODO-13 no figuraban en su origen | B | C | ODO-13 en BL-61 y BL-62; lista de ids repetidos al día |
| T13 | BL-30 | Motivo de pérdida sin decir si es obligatorio; conversión de prospecto perdida | B | P | Motivo obligatorio (ERP-21); conversión descartada con motivo |
| T14 | BL-41 | Lista de usuarios de PLA-08 perdida sin registro | B | C | Descartada con motivo |
| T15 | Descartes | Fila de sedes inventaba una parte y citaba PP-DEC-01 como choque; fila de WhatsApp sin parte real | M | C | Sedes a «no entran hasta que alguien las pidan»; fila de WhatsApp quitada (aclaración en BL-19 y D-16) |
| T16 | MON-18 a MON-21 | Criterio desigual: dos descartadas, dos dentro de BL-50 | B | C | Las cuatro aplazadas con el mismo criterio |
| T17 | BL-02 | Se omitía el alta automática en historial de TWE-02 | B | C | Explicado: lo hace `crm_registrar_cambio` y BL-28; `created_by` solo en tablas nuevas |
| T18 | BL-32, BL-31 | BL-32 pedía un conteo que ya existe; esfuerzo de BL-31 sin explicar | B | P | Conteo reutilizado; esfuerzo de BL-31 justificado |

### Producto

| # | Dónde | Problema | Grav. | Ver. | Qué se cambió |
|---|---|---|---|---|---|
| P1 | Backlog, orden y lote | «El CRM que ya usa el primer cliente»: el primer cliente aún no recibe la instalación | M | C | Redacción en todo el documento; el lote se justifica por ser barato antes de que haya datos |
| P2 | BL-31 | Consentimientos inmutables, archivos por carpeta, `crm_salud` con llave por cuenta y `crm_cuenta_borrable` impiden el reapunte | M | C | BL-31 reapunta solo contactos, actividades y vínculos; la absorbida se archiva; regla para salud |
| P3 | BL-28 | «Solo anexión» choca con la supresión por entidad (Ley 1581, PP-R5) | M | C | Se suprime por entidad al borrarla |
| P4 | Comparativa, backlog | `crm_vinculos_externos` no la lee ni escribe ningún código | M | C | Nueva tabla «solo en el esquema»; BL-44 la escribe; importador cruza por documento o tipo más nombre |
| P5 | Hueco 6, BL-10 | Se omitía que el shell ya bloquea el caso propio | M | P | Hueco y BL-10 precisan la exposición real (API y baja en Supabase) |
| P6 | BL-14 | Ubicación errónea de las acciones; dos de tres comprobaciones ya existen | M | C | BL-14 reducido a lo que falta; fila de «ya tiene» corregida |
| P7 | BL-11 | Acotar solo `crm_cuentas` deja leer las tablas hijas | M | C | Seis políticas, storage y funciones de salud en BL-11; esfuerzo medio; hueco 9 ampliado |
| P8 | BL-18 | No hay índice de teléfono; el documento ya tiene índice único entre activas | B | C | Precisado en BL-18 y en el lote |
| P9 | BL-16 | El documento se guarda fusionado; separar el DV no es solo una columna | B | C | Migración, índice y normalización en BL-16; frase del lote corregida |
| P10 | Hueco 1, D-1 | Son once módulos sin pantalla; dos sin `sql` se activan sin error | B | P | Hueco 1, resumen y D-1 b ampliados a `rutas.tsx` |
| P11 | BL-08, lote | «Conector `cambio` ya en uso» es falso | B | C | Frase quitada; se cita `src/lib/moneda.ts` |
| P12 | Hueco 11, BL-15 | Las etapas también quedan huérfanas; no existe función que escriba ajustes | B | C | Hueco ampliado; BL-15a crea la regla; esfuerzo medio |
| P13 | Huecos 12 y 13, BL-09 | El shell sí valida la forma; la concurrencia también afecta a `instalacion.ajustes` | B | C | Huecos reescritos; BL-09 ampliada |
| P14 | Hueco 10, BL-12 | Omitía que la exportación ya se registra y que un permiso en el botón no cierra nada | B | P | Hueco reescrito; BL-12a con RPC y tope en la base |
| P15 | BL-25 | No hay flujo de baja en el producto | B | C | BL-25 crea la función de baja; esfuerzo alto |
| P16 | BL-22 | Cambia la definición de Actividad del glosario y la política de edición | B | C | Ambas cosas en BL-22 |
| P17 | BL-15, BL-20 | Dependencia fuera del lote; reemplazar `crm_buscar` no es trivial | B | C | BL-04 al lote; nota en BL-20 y tabla de funciones compartidas |
| P18 | Cabecera de la comparativa | Versión de contraste ambigua | B | P | «0.2.16, `c06243b`; 0.2.17 y 0.2.18 solo documentación» |

### Decisiones

| # | Dónde | Problema | Grav. | Ver. | Qué se cambió |
|---|---|---|---|---|---|
| D1 | D-5 | Recomendaba reabrir una decisión cerrada sin pedido ni condición; «el contador» sin definir | A | P | D-5 es una pregunta al usuario sin recomendación; BL-60 y BL-63 condicionados; asesor contable por nombrar |
| D2 | D-3 | Atar compras al CRM anula D-2 (Vault, salud, etapa); faltaba la opción c | A | C | Opción c añadida; se decide con D-2; BL-35 sujeto a D-3 |
| D3 | Cabecera del backlog | Solo protegía la salud; varias BL copian datos personales que el borrado no alcanza | A | C | Regla de supresión en «Cómo leer»; supresión explícita en BL-28, BL-31, BL-44, BL-46, BL-49 y BL-71; hueco 17 |
| D4 | BL-70 a BL-73 | Datos de salud y salarios del empleado sin decisión | M | C | D-18; BL-43, BL-70 y BL-72 la citan |
| D5 | BL-24, BL-67 | «Hora de Bogotá» contradice la zona por instalación | M | C | `zona_instalacion()`; festivos por país en BL-38 y BL-72 |
| D6 | BL-02, hueco 12 | `origen` ya existe con otro sentido; `archivado_en` ya existe en el CRM | M | C | Columna `creado_via`; hueco 12 corregido |
| D7 | BL-08 | Falta decidir si hay multimoneda; `moneda_base` y `divisas` existen | M | P | D-15; BL-08 condicionada y fuera del lote |
| D8 | Primer lote, hueco 15 | Fases sin decidir; BL-05, BL-06 y BL-08 sin consumidor; decisiones previas sin marcar | M | C | D-14; lote con decisiones previas; los tres contratos ERP como condicionales |
| D9 | D-9, BL-57 | Sin autoaprobación, una pyme con un solo aprobador queda bloqueada | M | C | Opción c en D-9; BL-57 con autoaprobación configurable |
| D10 | Descartes, BL-19, BL-65, BL-66 | Citaba una versión vieja de la decisión de WhatsApp | M | C | D-16 con WA-DEC-01 y 04; BL-66 con firma de Meta |
| D11 | D-1 | No clasifica qué módulos son del producto y cuáles heredados | M | P | Opción c en D-1; D-2 condiciona la dependencia de productos |
| D12 | BL-61, BL-62, BL-68 | Mercado y mantenimiento normativo sin decidir | M | P | D-17; BL-38, BL-61, BL-62, BL-68b y MON-21 la citan |
| D13 | BL-72, BL-73 | Introducían sedes y ámbitos sin pasar por D-12 | B | P | Festivos por país; BL-73 con la visibilidad por ascendencia a pedido; D-12 ampliada |
| D14 | BL-30, D-4 | Fase 0.2 contra la recomendación de construirla en la 0.8 | B | P | BL-30 a la tabla 0.8 con diseño en 0.2; D-4 fija catálogos y nombre «etapa de venta» |
| D15 | Cabecera del backlog | Faltaba PP-DEC-20 | B | C | Añadida a «Cómo leer» |

### Prioridad

| # | Dónde | Problema | Grav. | Ver. | Qué se cambió |
|---|---|---|---|---|---|
| R1 | BL-15, lote | BL-15 dependía de BL-04, fuera del lote | A | C | BL-04 entra al lote delante de BL-15a |
| R2 | BL-11, BL-18 | Con BL-11 el importador deja de ver cuentas ajenas y el lote falla por el índice único | A | C | BL-18 con función definer que solo dice si existe; BL-11 depende de BL-18 y va después |
| R3 | BL-11, BL-25 | Esfuerzo subestimado; al retirar un miembro su cartera queda visible para todos | M | C | BL-11 esfuerzo medio con lo que toca; regla mínima de BL-25 entra con BL-11 |
| R4 | BL-02 | `origen` colisiona; consentimientos inmutables; historial con ruido; «a cada tabla» incumplible | A | C | `creado_via`, lista de exentas, 21c con BL-23, BL-23 depende de BL-02 |
| R5 | BL-05 | Mezclaba la serie con la asignación fiscal de la 0.9 | M | P | BL-05a (serie, D-10) y BL-05b (fiscal, 0.9, tras BL-60) |
| R6 | BL-06, BL-08 | Sin consumidor ni entregable; «montos que migrar» no existen | M | P | Entregables definidos; ambos fuera del lote hasta el primer esquema ERP |
| R7 | BL-60, BL-68, BL-69 | Dependencia circular: la publicación valida cuentas y periodos que nacían después | A | C | BL-68a y BL-69a antes de BL-60; D-19; BL-01a la cita |
| R8 | BL-53 | El cierre que necesita existía dos fases después; dependencias sin declarar | M | P | BL-69a pasa al núcleo antes de la 0.7 y BL-53 depende de ella; BL-52 cita D-1; regla de BL-02 y BL-08 en «Cómo leer» |
| R9 | BL-33, BL-37 | Dependían de piezas de grupos posteriores o de un módulo sin portar | M | C | BL-33 al grupo 3; BL-37 a condicionadas; regla y comprobación por script |
| R10 | BL-49, BL-72, BL-12 | Usaban la tabla de BL-38 sin declararlo | M | P | BL-72 y BL-49 dependen de BL-38; BL-12b depende de BL-38 |
| R11 | BL-12 | Un permiso solo en la pantalla es cosmético; esfuerzo bajo | M | P | BL-12a con RPC, tope y auditoría; esfuerzo medio; asíncrono en BL-12b |
| R12 | BL-18 | Índices sin teléfono; criterio de teléfono duplicado con BL-19 | M | P | Teléfono con BL-19; esfuerzo medio; dependencias declaradas |
| R13 | BL-16 | Migración de documentos guardados y cambio de índice | M | P | Esfuerzo medio con el plan de migración |
| R14 | BL-15 | No existe función que escriba ajustes; etiquetas son otra pieza | M | P | BL-15a (en el lote, esfuerzo medio) y BL-15b (etiquetas, fuera) |
| R15 | BL-01 | Faltaba D-3; los puentes no tienen mecanismo ni caso hasta la 0.7 | M | C | BL-01a (lote, D-2 y D-3) y BL-01b (0.7) |
| R16 | BL-20, BL-22, BL-23 | Actividades futuras contarían como última actividad; la fusión borra etapas | B | P | BL-20 cuenta solo las hechas; BL-23 no funde cambios de etapa |
| R17 | BL-02, 11, 16, 20, 23, 24, 34 | Varias BL reescriben las mismas funciones sin coordinarse | M | C | Tabla «Funciones que comparten varias BL» (en lugar de una columna, para no alargar cada fila) y regla en «Cómo leer» |
| R18 | BL-10 | La guarda cae en cascada y la cuenta de prueba la enmascara | B | P | BL-10 con conteo sin cuentas de servicio, salto para la service role y caso de prueba |
| R19 | BL-13 (y BL-17) | «Denegar gana» cambia tres implementaciones; BL-47, BL-57 y BL-69 no la declaraban | M | P | BL-13 esfuerzo medio con prueba de equivalencia; BL-47, BL-57 y BL-69a dependen de BL-13. La nota del verificador hablaba de BL-17: también se aplicó (esfuerzo medio y motivo en «Siguen») |

### Citas

| # | Dónde | Problema | Grav. | Ver. | Qué se cambió |
|---|---|---|---|---|---|
| C1 | BL-25 (MON-06) | Monica no reasigna: destruye los espacios del gestor único | A | C | Origen «propio (MON-06 como contraejemplo)» |
| C2 | BL-05 (ODO-06, ERP-01) | `no_gap` no numera facturas en el clon; ERPNext no usa `ON CONFLICT` en su camino principal | M | C | Serie y bloqueo atribuidos; fiscal sin huecos como propio; D-10 y patrón 1 precisados |
| C3 | BL-08 (TWE-04) | Twenty no obliga al par | M | P | Invariante como propia; validación del código en la API reconocida |
| C4 | BL-15 (MON-11) | Monica no protege lo que está en uso | M | P | Separado lo que Monica demuestra de lo propio |
| C5 | BL-06 (PLA-06) | `TTransition` no lleva permiso; el control optimista es sobre procesos | M | C | TWE-03 como cita principal; transición con permiso como propia |
| C6 | BL-18 (ERP-15, PLA-01) | Teléfono por dígitos es de la búsqueda de llamadas; Huly no normaliza | M | C | Criterios y puntaje como propios |
| C7 | BL-63 | Ninguno deriva el saldo al leer | M | P | Atribución corregida; esfuerzo «medio (por medir)»; patrón 26 |
| C8 | BL-10 (MON-01) | Monica no cuenta administradores; cita a `GrantVaultAccessToUser` ajena | B | C | «No sobre uno mismo»; conteo propio |
| C9 | BL-16 (ODO-02) | `l10n_co` no guarda el DV aparte | B | C | Solo los códigos vienen de Odoo |
| C10 | BL-28 (MON-04) | El feed de Monica se escribe a mano y no es de solo anexión | B | P | Monica aporta la forma; triggers y CHECK propios |
| C11 | BL-22 (MON-07) | El nombre del autor como texto está en tareas, no en el feed | B | P | Precisado en BL-22 (el error de cita está en la ficha) |
| C12 | BL-19 | Ningún repo tiene el conjunto de columnas; «principal» es propio | B | C | Atribución campo por campo |
| C13 | BL-64 | ERPNext rechaza la diferencia al confirmar, no al guardar | B | C | «No se confirma con diferencia»; ajuste por deducción a decidir |
| C14 | BL-53 | Ninguno es de solo inserción | B | P | Libro y reverso como propios; patrón 24 |
| C15 | BL-01 (ODO-01) | `stock` tiene más dependencias; el clon no trae puentes | B | C | Puente como propio; comparativa al día |
| C16 | BL-02 (TWE-02) | Twenty sella en la capa de servicio | B | P | Trigger y prueba como endurecimiento propio |
| C17 | BL-12 (PLA-04) | BOM y `;` no son de Huly; Huly solo exige rol Owner | B | P | Precisado en BL-12a y en «ya tiene» |

## Decisiones tomadas al aplicar

Cuando el verificador dejaba dos salidas, o dos correcciones chocaban, se eligió así:

- **BL-04 y BL-15** (T8, P17, R1, D8): BL-04 entra al lote en lugar de quitar la dependencia, porque BL-15a cambia la forma de los ajustes y esa forma se declara en el registro.
- **BL-05, BL-06 y BL-08** (R5, R6, D7, D8): la prioridad pedía BL-05a en el lote y BL-06 con una entidad piloto; la lente de decisiones pedía marcarlos condicionales. Se sacan los tres del lote a un bloque «al abrir el primer esquema ERP»: la entidad piloto propuesta (`crm_actividades` con estados) exige BL-22, que no está en el lote, y ninguno tiene consumidor hoy.
- **Fecha de bloqueo** (R7, R8): la prioridad ponía BL-69a en la 0.9 y a la vez pedía que el inventario de la 0.7 dependiera de ella. BL-69a pasa al núcleo antes de la 0.7, así ninguna BL depende de otra posterior.
- **MON-18 a MON-21** (T6, T16): las cuatro van a «Ideas aplazadas» y BL-50 pasa a condicionada «cuando haya API pública».
- **Reintentos de reglas y modelo contable** (T5, T11): se resuelven con una nota en BL-46 y en BL-60 y BL-63, sin abrir una D nueva.
- **Importación vCard** (T4): se aplaza en lugar de meterla en BL-36.
- **Exportación** (T3, R10, R11): BL-12 se parte en 12a (permiso en la base, lote) y 12b (exportador común con plantillas, transformación, reimportable y asíncrono, tras BL-38).

## Pendiente en las fichas

Las correcciones de las lentes de citas y decisiones que tocan las fichas no se aplicaron (esta pasada solo podía editar la comparativa y el backlog). Quedan para la próxima sesión:

- `odoo.md`: fila ODO-06 (`no_gap` solo en pagos agrupados; facturas con `sequence_mixin`); línea 21 (`stock` depende de `product`, `barcodes_gs1_nomenclature` y `digest`; el clon no trae puentes); fila ODO-02 (solo códigos DIAN, sin DV aparte).
- `erpnext.md`: fila ERP-01 (la rama principal es `SELECT … FOR UPDATE` y `UPDATE`); fila ERP-15 (al crear un lead solo bloquea por correo exacto; los dígitos del teléfono son de la búsqueda de llamadas); fila ERP-06 (la cita respalda el libro paralelo que la ficha marca «no copiar»); fila ERP-07 (no se confirma con diferencia).
- `monica.md`: fila MON-06 y su nota (contraejemplo: destruye los espacios del gestor único) y la sección «Baja de usuario sin huérfanos»; fila MON-11 (sin regla de «en uso»); fila MON-04 (el feed no es de solo anexión); fila MON-07 (cita a `create_contact_tasks_table.php`); fila MON-02 («tipo principal no borrable» son los tipos teléfono y correo); fila MON-01 (quitar `GrantVaultAccessToUser`); líneas 110-111 y 141 (cita antigua de la decisión de WhatsApp, y «no hay guarda en el shell», que es falso).
- `platform.md`: fila PLA-06 (`TTransition` sin permiso; control optimista sobre procesos); fila PLA-01 (igualdad exacta de canal y `$like`, sin `pg_trgm`); fila PLA-04 (sin BOM ni `;`); fila PLA-20 (qué campo viene de `TChannel` y cuál de `SocialId`).
- `twenty.md`: fila TWE-04 (ambas propiedades `isRequired: false`); fila TWE-02 y línea 138 (sellado en la capa de servicio; la columna `origen` choca con la del CRM).

## Lo que quedó sin revisar

- Las citas de los BL 07, 09, 13, 14, 17, 21, 23, 26, 27, 29, 32 a 37, 39 a 42, 44, 46 a 52, 54 a 59, 61, 62 y 65 a 73; las de PLA-13, PLA-23, PLA-21 (MergePersons de Huly) y ODO-05. Tampoco se resolvió si el `value` de una opción de Twenty es inmutable (TWE-11): un comentario del clon dice que una app puede renombrarlo al sincronizar.
- El esfuerzo de las BL 19, 21 a 23, 26 a 32, 34, 36, 39 a 48, 50 y 54 a 73 contra el código: sigue siendo la estimación de las fichas.
- `01-seguridad.sql`, `02-auditoria.sql`, `05` a `09`, el resto de `21-crm.sql` (funciones de salud, storage y verificación final, salvo lo citado), `aplicar.mjs`, `comun.mjs`, `rls-simulacion.sql` y las funciones de Netlify fuera de `autorizacion.mts` y `connector-proxy.mts`.
- Cómo alimenta Gerencia las facturas desde el conector `facturacion` (hueco 5): `26-gerencia.sql` no existe.
- Si `pg_cron` está disponible en el proyecto Supabase de cada cliente (D-8).
- El estado real de la base del primer cliente: si un archivo 21c ya contaría como posterior a la primera venta para PP-DEC-02.
- La fidelidad de la tabla por dominio de la comparativa frente a las fichas, más allá de las celdas que tocaban las objeciones.
- Ninguna lente ejecutó código de los repos ni del producto.
