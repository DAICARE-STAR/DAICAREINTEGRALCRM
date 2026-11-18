# monica — verificación 2

Verificador con contexto fresco. Repo: `C:\Users\enzov\IA\personal\investigacion-erp\monica`; rutas relativas a él. Se abrió cada archivo citado en los informes `monica-permisos.md` y `monica-integracion.md` y se intentó refutar la afirmación. Veredictos: CONFIRMADO, CORREGIDO (idea cierta, cita o detalle mal; se da la cita buena) o DESCARTADO. Los informes originales no se tocaron.

## Resumen

| Informe | Elementos revisados | Confirmados | Corregidos | Descartados |
|---|---|---|---|---|
| monica-permisos | 20 (A1-A15 y 5 hechos) | 17 | 3 | 0 |
| monica-integracion | 24 (A1-A16 y 8 hechos) | 16 | 7 | 1 |
| Total | 44 | 33 | 10 | 1 |

Hallazgos que cambian una conclusión de los informes:

- Permisos, hecho 8 y sección «No leído»: Monica NO es una cuenta por instalación. El registro crea una cuenta nueva por cada alta (`app/Actions/Fortify/CreateNewUser.php:29` llama a `CreateAccount`; solo se apaga con `APP_DISABLE_SIGNUP`, `config/monica.php:24`), y por eso existe `is_instance_administrator`. Es multicuenta en una misma base con el filtro de cuenta puesto por el código (lo que el informe critica en «No conviene copiar»). La frase «el repo no cubre multiempresa dentro de una misma base» es errónea: lo hace, sin RLS.
- Integración, A3 y hecho 13: la «política de colisión add/replace» no funciona. `behaviour` es un campo obligatorio (`app/Domains/Contact/Dav/Services/ImportVCard.php:83-86`) pero ningún código lo lee; el único uso es pasar `BEHAVIOUR_REPLACE` desde `app/Domains/Contact/Dav/Jobs/UpdateVCard.php:90`. La constante `ERROR_CONTACT_EXIST` (línea 32) nunca se devuelve. Además no hay importación de `.vcf` de cara al usuario: el servicio solo lo usa el job de sincronización DAV.
- Integración, A9 y hecho 2: el middleware `abilities:write` se declara para `['store','update','delete']` (`app/Domains/Vault/ManageVault/Api/Controllers/VaultController.php:24`) pero el método se llama `destroy` (línea 114): el borrado de bóveda no queda sujeto a ningún alcance de token. La idea de alcance por token sigue siendo válida; el ejemplo de Monica tiene ese hueco.

## monica-permisos

### Adoptable para Bash Logistics

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 Entero ordenado en la tabla puente | CONFIRMADO | `app/Models/Vault.php:19-23`, `app/Services/BaseService.php:190-195` | 300 ver, 200 editar, 100 gestionar; `wherePivot('permission', '<=', ...)` en la línea 194. |
| A2 Espacio como frontera de datos | CONFIRMADO | `app/Models/Contact.php:44` (solo `vault_id` en `$fillable`), `app/Providers/AuthServiceProvider.php:36-54` | Cita mejor para la columna: `database/migrations/2020_04_25_133132_create_contacts_table.php:25` (FK con cascada). Las puertas consultan la fila puente del usuario. |
| A3 Doble capa ruta y servicio | CONFIRMADO | `app/Services/BaseService.php:96-119`, `app/Domains/Contact/ManageContact/Services/DestroyContact.php:27-35` | La API (`VaultController` de API usa `CreateVault`, `UpdateVault`, `DestroyVault`) y el import DAV (`ImportVCard.php:96-104`) pasan por servicios con la misma lista. |
| A4 Permisos desconocidos y prerrequisitos | CONFIRMADO | `app/Services/BaseService.php:41-67`, `:102-108`, `:114-116` | Mapa de dependencias, excepción «requires» y excepción «Unknown permission». |
| A5 Pertenencia del hijo al padre | CONFIRMADO | `app/Providers/AuthServiceProvider.php:56-65`, `app/Services/BaseService.php:205-214` | `contact-owner` compara `vault_id` con el de la URL; el servicio busca el contacto dentro de `$this->vault->contacts()`. |
| A6 Anti-autolesión | CONFIRMADO | `GrantVaultAccessToUser.php:67-69`, `DestroyUser.php:63-67`, `RemoveAdministratorPrivilege.php:45-47` | Rutas completas como en el informe. También lo repiten `RemoveVaultAccess.php:63-65` y `ChangeVaultAccess.php:64-66`. |
| A7 Escalar exige más que repartir | CONFIRMADO | `ChangeVaultAccess.php:33-41` frente a `GrantVaultAccessToUser.php:36-43` | Cambiar nivel pide `author_must_be_account_administrator` y gestor; conceder solo gestor. |
| A8 Borrado que conserva lo que otros gestionan | CONFIRMADO | `DestroyUser.php:70-90` | El informe cita 70-86; el método completo llega a la 90. Solo borra bóvedas donde no queda otro gestor. |
| A9 Línea de tiempo con acción tipificada | CORREGIDO | `database/migrations/2021_10_19_022411_create_contact_feed_table.php:16-23`; `app/Models/ContactFeedItem.php:19-93` | Las 38 constantes van de la línea 19 a la 93, no a la 75. La estructura de la tabla es la descrita. |
| A10 Valor anterior y nuevo | CONFIRMADO | `app/Domains/Contact/ManageNotes/Services/UpdateNote.php:79-80`, `CreateContact.php:123-127` | La carencia se confirma: `description` recorta a 10 palabras y no hay columnas de valores. |
| A11 Autor con ON DELETE SET NULL | CONFIRMADO | `create_contact_feed_table.php:18` | `nullable()->constrained('users')->nullOnDelete()`. |
| A12 Lista blanca de serialización | CONFIRMADO | `app/Models/User.php:110-132` | `$hidden` 110-115 y `$visible` 122-132. |
| A13 Cifrar solo el secreto de integración | CONFIRMADO | `app/Models/AddressBookSubscription.php:128-134` | `encrypt` en el setter (132) y `decrypt` en el getter (131); no hay otro `encrypt(` ni `Crypt::` en `app`. |
| A14 Segundo factor y tokens opcionales | CONFIRMADO | `database/migrations/2014_10_12_200000_add_two_factor_columns_to_users_table.php:17-31`, `database/migrations/2019_03_29_163611_create_webauthn_keys.php`, `database/migrations/2025_05_05_101750_webauthn_used_at.php:15` | Rango del informe (16-28) algo corto; el contenido es el correcto. |
| A15 Integraciones con el mismo filtro | CONFIRMADO | `app/Domains/Contact/Dav/Web/Backend/GetVaults.php:15-24` | `wherePivot('permission', '<=', $permission)`; `CardDAVBackend.php` lo usa en 80, 259, 288, 315 y 439. |

### Muestra de «Cómo lo resuelve»

| Hecho | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| 3 Comparación por orden numérico | CONFIRMADO | `BaseService.php:190-195`; `AuthServiceProvider.php:42-54` | Las puertas editor y gestor usan 200 y 100 en las líneas 46 y 52. |
| 8 Aislamiento de cuenta por validación | CORREGIDO | `BaseService.php:159-163`, `:180-184`, `:205-214` | Las búsquedas son las citadas. Falso: «es una cuenta por instalación». Monica admite varias cuentas por instalación (`CreateNewUser.php:29`, `config/monica.php:24`); el filtro lo pone el código, sin RLS. |
| 13 Historial sin valores anteriores | CORREGIDO | `create_contact_feed_table.php:16-23`; `ContactFeedItem.php:19-93`; `CreateContact.php:123-127`; `UpdateNote.php:79-80` | Idea y recuento de 38 constantes correctos; el rango 19-75 debe ser 19-93. |
| 15 Cifrado mínimo y `$hidden` | CONFIRMADO | `AddressBookSubscription.php:128-134`; `User.php:110-115`, `:122` | Sin cifrado por campo en notas ni contactos. |
| 17 DAV respeta los permisos | CONFIRMADO | `GetVaults.php:15-24`; `CardDAVBackend.php:80,259,288` | El backend CardDAV hereda el trait y parte de la lista filtrada. |

Comprobados además, sin discrepancia: hechos 1 (booleanos en `create_users_table.php:31` y `add_instance_administrator.php:15`; no hay tabla de roles), 2, 4, 5 (rutas en `routes/web.php:199, 250, 485, 580`), 6, 7, 9 a 12, 14 (`create_logs_table.php:14-27`, uso en `UpdateVCard.php:68,102`), 16 y 18 (`MoveContactToAnotherVault.php:36-44` y `:67-75`).

## monica-integracion

### Adoptable para Bash Logistics

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 Contactos y fechas por CardDAV/CalDAV | CONFIRMADO | `app/Providers/DAVServiceProvider.php:63-92`, `app/Domains/Contact/Dav/Web/Backend/CalDAV/CalDAVDates.php:21-47` | Plugins CardDAV, VCF, CalDAV, ICS, sync y ACL; calendario de fechas importantes por bóveda (`CalDAVBackend.php:26-29` suma tareas). |
| A2 Feed iCal con token por usuario | CONFIRMADO | `DAVServiceProvider.php:75`, `CalDAVDates.php:21-40` | Cita respalda la exportación ICS; el token por URL es adaptación propia: en Monica el acceso va por la sesión de Laravel. |
| A3 Importación vCard con política agregar o reemplazar e informe por fila | DESCARTADO | `app/Domains/Contact/Dav/Services/ImportVCard.php:23-46`, `:83-86`, `:133-138`; `app/Domains/Contact/Dav/Jobs/UpdateVCard.php:90` | `behaviour` se valida y nunca se lee; `ERROR_CONTACT_EXIST` nunca se devuelve; no hay importación de `.vcf` para el usuario ni informe agregado. Lo rescatable es solo el resultado de error nombrado por tarjeta (`ImportVCard.php:135-137`, `:176-178`). |
| A4 Importadores y exportadores ordenados | CONFIRMADO | `app/Domains/Contact/Dav/Order.php:9-27`, `ImportContact.php:22`, `ExportTimestamp.php:13`, `ImportVCard.php:257-267` | Los descubre por reflexión (`subClasses`) y ordena con `Order::get`; hay manejadores en cinco dominios. |
| A5 Doble identidad local y de origen | CONFIRMADO | `database/migrations/2020_04_25_133132_create_contacts_table.php:41-44`, `app/Domains/Contact/Dav/Importer.php:81-88`, `ImportContact.php:62-72` | Con origen externo el UID no se adopta como id (línea 83); se guardan `distant_uuid`, `distant_etag`, `distant_uri`. |
| A6 ETag por hash del contenido | CORREGIDO | `app/Domains/Contact/Dav/Services/GetEtag.php:56` (iCal) y `:67` (vCard) | El informe cita 68-71 (que es el `else` con la excepción); el `return` con SHA-256 y prioridad a `distant_etag` está en la 67. El uso como `If-Match` es adaptación. |
| A7 Sincronización por token y borrado lógico | CONFIRMADO | `app/Domains/Contact/Dav/Web/Backend/SyncDAVBackend.php:131-199`, `database/migrations/2018_12_29_135516_create_synctokens.php:18-27` | Token desconocido devuelve `null` (138-141); añadidos, modificados y borrados por timestamp. |
| A8 Purga de tokens | CONFIRMADO | `app/Domains/Contact/Dav/Jobs/CleanSyncToken.php:19-53`, `config/dav.php:24`, `routes/console.php:28` | Borra los anteriores al máximo por usuario y nombre y a la ventana de 30 días. |
| A9 Tokens con alcance read o write | CORREGIDO | `app/Domains/Vault/ManageVault/Api/Controllers/VaultController.php:23-24`, `:114` | El middleware de escritura nombra `delete` pero el método es `destroy`: el borrado queda sin alcance. Idea válida; verificar el alcance en cada endpoint. |
| A10 Convenciones de API | CONFIRMADO | `app/Http/Controllers/ApiController.php:20-31`, `config/api.php:13` y `:43`, `app/Http/Resources/VaultResource.php:20-29` | Líneas exactas del tope y del código 30: 13 y 43 (el informe da 12 y 42, adyacentes). |
| A11 Documentación generada | CONFIRMADO | `VaultController.php:34-36`, `:49-51`, `config/scribe.php:47` | Atributos `QueryParam`, `BodyParam`, `ResponseFromApiResource`; tipo `laravel`. |
| A12 Canal con contador de fallos | CONFIRMADO | `app/Notifications/ReminderTriggered.php:34-44`, `database/migrations/2024_05_12_170430_add_fails_to_notification_channels.php:14-19` | La desactivación tras N fallos está en `ProcessScheduledContactReminders.php:71-74` (`monica.max_notification_failures`, 10 por defecto). |
| A13 Procesador de recordatorios que aísla fallos | CONFIRMADO | `app/Domains/Contact/ManageReminders/Jobs/ProcessScheduledContactReminders.php:30-79`, `routes/console.php:27` | Try/catch por aviso que registra y sigue (54-77); cada minuto. |
| A14 Idioma por usuario | CONFIRMADO | `config/localizer.php:9-12`, `:26-35`, `StoreLocale.php:23-28` | 29 locales; validación con `Rule::in(config('localizer.supported_locales'))`. |
| A15 Traducciones por cadena y extractor | CONFIRMADO | `config/localizator.php:8-21`, `:30-35` | JSON por locale y archivos cortos; escanea `app`, `config`, `resources/js`, `resources/views`. |
| A16 Webhook entrante con 202 ante ruido | CONFIRMADO | `app/Domains/Settings/ManageNotificationChannels/Web/Controllers/TelegramWebhookController.php:19-63`, `routes/web.php:177-182` | 202 ante mensaje ausente o fuera de patrón; token desconocido devuelve 404 (esa rama sí provoca reintento). |

### Muestra de «Cómo lo resuelve»

| Hecho | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| 2 Permisos de token por abilities | CORREGIDO | `VaultController.php:23-24`, `UserController.php:20` | Falta decir que `destroy` queda fuera de `abilities:write` (ver A9). |
| 8 Sincronización incremental con tokens | CONFIRMADO | `SyncDAVBackend.php:19-42`, `:131-199`; `create_synctokens.php:18-27` | Token nuevo si algún objeto cambió tras el último (37-39). |
| 11 ETag derivado del contenido | CONFIRMADO | `GetEtag.php:56`, `:67` | Reutiliza `distant_etag` y si no hace SHA-256 del texto (ver nota de A6 sobre la línea). |
| 16 Cliente CardDAV con suscripciones | CORREGIDO | `database/migrations/2023_07_03_230200_create_addressbook_subscription.php:18-40`; `app/Models/AddressBookSubscription.php:20-26`, `:132`; `UpdateAddressBooks.php:19-44`; `routes/console.php:26` | La migración tiene 49 líneas: la cita 57-78 no existe; las columnas están en 18-40. El mismo error está en la tabla del modelo de datos del informe. El resto es correcto. |
| 22 Webhook entrante de Telegram | CONFIRMADO | `TelegramWebhookController.php:19-63`, `routes/web.php:177-182` | Secreto en la URL, patrón de 36 caracteres, activa el canal. |

Discrepancias halladas fuera de la muestra, por afectar a la lectura:

| Hecho | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| 9 Borrado lógico como base | CORREGIDO | `app/Domains/Contact/Dav/VCardResource.php:22` (trait `SoftDeletes`), `CardDAVBackend.php:313-320` | `VCardResource.php` tiene 23 líneas: la cita 60-64 no existe. |
| 13 Importación con política de colisión | CORREGIDO | `ImportVCard.php:83-86`, `:135-137` | Ver A3: se exige `behaviour` pero no se usa; los errores nombrados sí existen. |
| 17 Sincronización por lotes | CORREGIDO | `AddressBookSynchronizer.php:30-53`, `:66-92`, `:97-130`, `:135-162` | El token local se actualiza solo si la suscripción envía (`isWayPush`, líneas 44-46), no siempre. Lotes con fallos permitidos y modo forzado por UUID, correctos. |

Comprobados además, sin discrepancia: hechos 3 (`ApiController.php:16-33`, `:54-65`), 4, 5, 6 (`DAVServiceProvider.php:42-92`, `bootstrap/app.php:22-23`, `routes/web.php:164-165`), 7 (`AuthBackend.php:32-39`, `:58-66`), 10, 12 (importadores con `#[Order]` en `ManageContact`, `ManageContactImportantDates`, `ManageContactInformation`, `ManageGroups` y `ManageTasks`), 14, 15, 18 (las seis funciones de `DavClient.php` están en las líneas citadas), 19, 20, 21 (líneas reales 30-79, no 40-70), 23 (29 locales) y 24 (`lang/en.json` 1442 líneas, `lang/es.json` 1493).
