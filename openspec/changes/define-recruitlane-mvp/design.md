## Context

RecruitLane es un MVP individual para Recruiters. La motivación y el alcance funcional están en `proposal.md`; los comportamientos obligatorios están en los seis delta specs. Este documento consolida las decisiones técnicas ya aprobadas para implementar esas reglas sin rediseñar el producto.

`User` es la entidad técnica del único actor funcional denominado *Recruiter* en los requisitos. No introduce roles, organizaciones, espacios compartidos ni colaboración. El backend y el contrato HTTP ya están materializados; el frontend solo contiene el bootstrap de Vite y permanece por implementar. El monorepositorio pnpm contiene `front/`, `back/`, `openspec/`, `.agents/`, `compose.yaml`, `pnpm-workspace.yaml`, `package.json` raíz, `pnpm-lock.yaml`, `AGENTS.md`, `readme.md` y `prompts.md`.

## Goals / Non-Goals

**Goals:**

- Implementar el MVP como un monolito modular, con responsabilidades y límites claros, sin ceremonias arquitectónicas innecesarias.
- Preservar el aislamiento por User, las reglas de pipelines, vacantes y Applications, y los contratos de seguridad aprobados.
- Definir persistencia, validación, pruebas y flujo de desarrollo proporcionales al MVP.
- Mantener un despliegue conceptual de mismo origen para reducir superficie de CORS y permitir autenticación mediante cookie.

**Non-Goals:**

- Introducir microservicios, GraphQL, CQRS, eventos, Clean Architecture o Hexagonal Architecture como estructuras obligatorias.
- Crear paquetes compartidos, contratos comunes o un estado global de cliente sin una necesidad concreta.
- Añadir colaboración, organizaciones, historial de etapas, recuperación de eliminaciones, refresh tokens, revocación de tokens o eliminación física de recursos top-level expuesta al usuario en V1.
- Decidir proveedor de despliegue, proxy concreto, versiones de paquetes, scripts pnpm, parámetros Argon2id, secretos, CI/CD o configuración exacta de Docker.

## Decisions

### Monolito modular y límites de transporte

La aplicación usa React SPA, una API NestJS REST, Prisma y PostgreSQL. El flujo conceptual es:

```text
Browser -> React SPA -> REST/JSON (/api/*) -> NestJS -> Prisma -> PostgreSQL
```

Se mantiene un único repositorio y un único despliegue conceptual de aplicación. No hay microservicios de dominio independientes ni comunicación distribuida entre servicios de negocio. El backend es una única aplicación NestJS modular. Los principios de separación de responsabilidades pueden aplicarse cuando ayuden, pero no se crearán capas, interfaces de repositorio, handlers CQRS, clases de caso de uso ni mapeos adicionales solo para seguir un estilo.

Alternativas consideradas: microservicios, GraphQL y arquitecturas con capas obligatorias. Se descartan porque no responden a un requisito del MVP y añaden infraestructura, contratos y coste de evolución prematuros.

### Workspace y organización del frontend

El gestor de paquetes es pnpm y la estrategia de workspace es `pnpm workspace`. Los paquetes iniciales viven en `front/` y `back/`; no se crean `packages/common`, `packages/contracts` ni `shared/` mientras no haya una necesidad futura demostrada.

El frontend usa React, TypeScript, Vite, Tailwind CSS, TanStack Router, TanStack Query, React Hook Form, Vitest, React Testing Library y Playwright. Tailwind y los componentes React propios cubren la interfaz: no se incorpora una librería de componentes. Se usa Open Sans con fallback `sans-serif` e iconografía SVG propia y simple cuando aporte claridad. Se organiza por funcionalidad:

```text
front/src/
  routes/
  features/
    auth/
    candidates/
    pipelines/
    vacancies/
    applications/
  components/
  lib/
  main.tsx
```

Los componentes, hooks, formularios, operaciones API y tipos específicos permanecen en cada feature. `components/` y `lib/` contienen solo preocupaciones realmente transversales. Un `lib/api` pequeño puede centralizar URL base relativa `/api`, credenciales, cabeceras comunes, cabecera CSRF, lectura de respuestas y normalización de errores; las operaciones de cada recurso siguen en su feature.

La responsabilidad del estado es explícita: TanStack Query para estado de servidor, TanStack Router para estado de ruta, React Hook Form para formularios y estado de React (por ejemplo, `useState`) para UI local. No se añade Redux, Zustand, TanStack Start, TanStack Form ni otro almacén global en V1.

Alternativa considerada: estado global o un paquete de contratos compartidos desde el inicio. Se descarta porque las responsabilidades ya están cubiertas por las bibliotecas elegidas y la duplicación limitada de reglas simples evita acoplar frontend y backend.

### Interfaz, shell y navegación frontend

La UI es sobria: superficies blancas o grises claras, azul como color principal y tonos moderados de verde, ámbar y rojo para éxito, advertencia y error. El contenido principal tiene un ancho máximo aproximado de 1200px, padding aproximado de 16/24/32px por breakpoint, gaps base de 16px y separación principal de 24px. En desktop el shell autenticado mantiene sidebar fija; en tablet la compacta y en móvil la oculta tras un drawer abierto desde la topbar. La topbar muestra `RecruitLane`, nombre y apellido del Recruiter y logout. La sidebar contiene solo `Vacancies`, `Candidates` y `Pipelines`: El item correspondiente a la sección activa se distingue mediante un fondo o realce ligeramente más oscuro que los demás. Applications se gestionan en el detalle de Vacancy. Tablas y Kanban permiten scroll horizontal cuando no caben; Candidates usa un grid responsive de hasta tres cards por fila. Los modales son pequeños para confirmaciones y movimientos, medianos para Candidate y Vacancy, y casi de ancho completo en móvil.

`/login` y `/register` son la zona pública y presentan una card centrada sin el shell autenticado. `/` autenticado y un login correcto llevan a `/vacancies`; sin sesión, `/` lleva a `/login`. Al iniciar, el frontend resuelve `GET /auth/me` y muestra un estado de carga simple antes de decidir la ruta. Un visitante autenticado en login o registro se redirige a `/vacancies`, y una ruta autenticada directa válida se conserva tras resolver la sesión. Un `401` en la zona autenticada invalida la sesión local y redirige a `/login`.

Los controles usan HTML semántico, labels visibles, foco visible, contraste suficiente y áreas de interacción cómodas. La carga muestra texto y spinner cuando corresponde; las mutaciones deshabilitan su botón y muestran un estado textual, como `Saving...`. Los errores de campo tras submit usan borde rojo atenuado y mensaje inline; Los campos requeridos muestran *, excepto en Login; los campos opcionales no muestran un indicador adicional.; los errores generales, de negocio y los éxitos usan un toast centrado arriba, de unos tres segundos y sin apilado. Un error inesperado de mutación mantiene el contexto; uno de carga inicial se muestra inline con `Try again`. Los empty states incluyen CTA cuando corresponde, salvo Pipelines, que siempre dispone de `Default`. Los formularios en modal no se cierran con backdrop ni Escape: solo `×` o `Cancel`, que descartan sin confirmación. Una 404 propia, sencilla y amigable, incluye ilustración propia y CTA a `/vacancies` o `/login` según sesión.

### Flujos de autenticación

Login y Register comparten la presentación pública. Register recoge `firstName`, `lastName`, `email`, `password` y `confirmPassword`; este último solo se valida en frontend. La contraseña es visible/ocultable, se valida entre 15 y 128 caracteres y debe coincidir con la confirmación. Register ofrece Cancel para volver a /login descartando los datos introducidos. Login presenta bajo los inputs el error genérico de credenciales inválidas o de rate limit. Un registro exitoso redirige a login con feedback de éxito; logout no pide confirmación. Estas decisiones consumen el contrato existente y no cambian sus errores, sesión ni controles de seguridad.

### Candidates

Candidates muestra cards no navegables con nombre y apellido, email y teléfono solo si existe; puede usar SVG pequeño para email o teléfono. El footer ofrece `Add to vacancy` y `Edit`; Create y Edit reutilizan el mismo modal. Un teléfono vacío o compuesto por whitespace se transforma a `null`. El listado usa grid responsive de hasta tres columnas, empty state con CTA y paginación simple Previous/Next con `pageSize=10`; V1 no añade búsqueda global ni detalle de Candidate.

`Add to vacancy` abre un modal con combobox de Vacancies `OPEN`, filtrable localmente por título y empresa. Carga las opciones de forma lazy y paginada en bloques de 100 hasta disponer de todas las opciones.

### Pipelines

El listado es una tabla con `Default` primero y los personalizados por nombre; no expone columnas `isDefault` ni `isEditable`. `Default` muestra badge `Default`; un caret expande una representación compacta y visual de sus stages ordenadas, mostrando también su posición mediante etiquetas como Stage 1, Stage 2, etc. `Edit` y `Delete` solo aparecen si `isEditable=true`; `Copy` también está disponible para Default y pipelines no editables, abre creación con `<name> - Copy` y las mismas stages y posiciones como nuevas, y no genera alternativas automáticas si el nombre entra en conflicto. La paginación es Previous/Next y Delete requiere confirmación.

Create y Edit comparten una página dedicada: nombre arriba y las diez posiciones de stage visibles. Las posiciones 1–3 siempre están activas y son obligatorias; las 4–10 usan switch y deben formar un prefijo continuo, por lo que desactivar una desactiva todas las posteriores. No hay drag & drop ni reordenamiento manual en V1: la posición visual es `position`. Edit conserva internamente los IDs de stages existentes sin mostrarlos. Los errores generales se notifican por toast y marcan los inputs implicados; un nombre duplicado marca todos los campos afectados. Save vuelve a `/pipelines` y refresca los datos; Cancel vuelve descartando cambios.

### Vacancies y detalle

Vacancies lista `title`, `companyName`, `createdAt`, `status` y acciones. Los badges son DRAFT gris oscuro, OPEN verde claro, FILLED ámbar/amarillo oscuro y CANCELLED rojo claro. Las filas no son navegables; las acciones son explícitas y `View` siempre queda al final. El filtro de estado son chips multi-select, donde ninguna selección equivale a All. Create y Edit reutilizan modal: Create contiene title, companyName, description textarea y Pipeline mediante combobox de pipelines activos, con Default primero y preview compacto de sus stages. El combobox carga de forma lazy las páginas necesarias con pageSize=100 hasta disponer de todos los Pipelines activos. Al abrir Edit desde el listado, el frontend resuelve primero el detalle de la Vacancy para obtener los datos que no forman parte de su representación resumida antes de poblar el modal. En Edit el Pipeline queda visible pero deshabilitado y nunca se envía en PATCH. La creación permanece en el listado, las fechas son cortas en el listado y más completas en detalle; hay empty state con CTA y Previous/Next con `pageSize=10`.

El detalle encabeza title, badge, companyName y createdAt. `Edit` está disponible en los cuatro estados. DRAFT ofrece `Open vacancy`; OPEN, `Add application` y `Close vacancy`; FILLED y CANCELLED, `Reopen vacancy`. Open y Reopen solicitan confirmación; Close ofrece `Filled` o `Cancelled` con radio y no pide fecha de cierre. El Pipeline no se muestra como dato separado: sus stages se representan en el Kanban. Los cambios de estado actualizan la cache de TanStack Query sin recargar el navegador. Fuera de OPEN, las Applications son de solo lectura y desaparecen Add, Move y Remove.

### Applications dentro de Vacancy

Applications vive únicamente en `/vacancies/:id`. El Kanban, siempre visible, agrupa cards compactas por stage del Pipeline; cada card muestra nombre del Candidate y `createdAt` corto, y su footer contiene `Move` y `Remove`. El header de cada columna muestra nombre de stage y cantidad cargada; conserva `createdAt DESC` por stage y una columna vacía muestra solo `No applications`. El Kanban permite scroll horizontal.

`Add application` solo se ofrece para una Vacancy OPEN. Desde Vacancy selecciona Candidates en un combobox con búsqueda local por email y nombre visible; desde Candidate selecciona Vacancies OPEN por título y empresa. Ambos cargan lazy páginas de 100 hasta completar sus opciones. Los duplicados se delegan a `APPLICATION_ALREADY_EXISTS`, conservan la selección y muestran toast. Move abre modal con todas las stages salvo la actual y Remove pide confirmación. La carga inicial del Kanban usa `pageSize=100`; si hay más, un control centrado `Load more applications` acumula páginas y muestra `Showing X of Y`. Add, Move y Remove actualizan el Kanban mediante TanStack Query sin reload completo.

### Backend NestJS modular y API REST

NestJS usa su estructura modular estándar con `AuthModule`, `UsersModule`, `CandidatesModule`, `PipelinesModule`, `VacanciesModule`, `ApplicationsModule` y `PrismaModule`. Un área `common` puede contener decoradores, guards, filtros de excepciones e infraestructura transversal; no es un contenedor de código de dominio.

El flujo de responsabilidades es:

```text
Controller -> Service -> PrismaService -> PostgreSQL
```

Los Controllers resuelven HTTP, reciben DTOs ya validados, obtienen contexto de ruta/solicitud, delegan y devuelven respuestas. No contienen reglas de negocio. Los Services aplican reglas de dominio, propiedad, transiciones de estado, consistencia entre entidades y orquestación de persistencia. Prisma se limita al acceso de persistencia mediante `PrismaService` e inyección de dependencias.

La API usa REST + JSON, con prefijo global `/api` y grupos conceptuales `/api/auth`, `/api/candidates`, `/api/pipelines`, `/api/vacancies` y `/api/applications`. El navegador siempre llama URL relativas `/api`, no hosts fijos del backend. El contrato HTTP posterior usa OpenAPI 3.1.2, con título `RecruitLane API`, versión `0.1.0`, `servers: [{ url: /api }]` y paths relativos que no repiten `/api`; V1 no usa un prefijo de versionado como `/v1`.

Alternativa considerada: repositorios Prisma, interfaces, casos de uso y capas de mapeo. Se descarta inicialmente: PrismaService y Services cubren el alcance y cualquier abstracción adicional deberá justificar una necesidad concreta.

### Mismo origen, autenticación y autorización

El despliegue conceptual sirve la SPA en `https://<host>/` y enruta `https://<host>/api/*` a NestJS. En desarrollo Vite puede hacer proxy de `/api`; en producción un reverse proxy o la capacidad equivalente de hosting sirve la SPA y enruta la API. Nginx es posible, no obligatorio, y el proveedor queda por decidir.

La autenticación es JWT stateless con vida absoluta de cuatro horas, sin refresh token, almacén de sesiones ni lista de revocación. El payload mínimo es `sub = User.id`, `iat` y `exp`; no incluye datos de perfil mutables, propiedad, pipelines ni permisos. El JWT se guarda en la cookie `session`, `HttpOnly`, `Secure` en producción, `SameSite=Strict`, `Path=/` y sin `Domain` explícito salvo necesidad posterior. React no puede leer ni persistir el token; obtiene al usuario actual mediante `GET /api/auth/me`.

`POST /api/auth/register` crea el User, su Pipeline predeterminado y seis PipelineStages, pero no inicia sesión. `POST /api/auth/login` verifica email normalizado y contraseña con Argon2id, crea el JWT y escribe la cookie. Registro, login y logout no requieren una sesión autenticada válida; logout es idempotente e intenta eliminar siempre la cookie `session`. Un JWT copiado antes del logout sigue siendo válido hasta su expiración de cuatro horas: es el trade-off de V1 aceptado por la arquitectura stateless, no una revocación segura del lado del servidor.

Las contraseñas se hashean con Argon2id, sin truncarlas, con mínimo 15 y máximo 128 caracteres. Se validan exactamente como llegan: no se aplica trim, lowercase ni otra normalización. No se imponen reglas de mayúsculas, números o símbolos. No se emplean SHA-256, cifrado reversible ni bcrypt para almacenamiento de contraseñas.

La aplicación es privada por defecto mediante un AuthGuard global; endpoints públicos se marcan explícitamente, por ejemplo con `@Public()`. La identidad siempre viene del JWT verificado. La autorización sigue el patrón `JWT.sub -> User autenticado -> Service -> consulta filtrada por propiedad`; nunca usa un `user_id` enviado por frontend para decidir propiedad. La protección de rutas de TanStack Router es solo UX, no una barrera de seguridad.

Para un recurso inexistente o de otro User, la respuesta externa es siempre 404, evitando revelar su existencia. El 403 se reserva para una solicitud no autorizada por fallar la validación de Origin o CSRF. Para login, email inexistente y contraseña incorrecta devuelven el mismo 401 y mensaje genérico. Registro permite 201 para éxito y, pragmáticamente, un error como 409 para duplicados, pero el código/mensaje no debe declarar que el email existe. Esta diferencia de estado permite inferencia: la protección contra enumeración de registro es deliberadamente incompleta en V1.

Alternativa considerada: bearer token accesible desde JavaScript, sesiones de servidor o refresh/revocación. Se descartan porque aumentan superficie de exposición o estado de servidor sin un requisito del MVP.

### Seguridad de solicitudes, validación y contrato HTTP

La operación de mismo origen no configura CORS permisivo. Las solicitudes `POST`, `PATCH` y `DELETE` aplican defensa en profundidad: `SameSite=Strict`, `Origin` same-origin y cabecera `X-CSRF-Protection: 1`; same-origin exige coincidencia de scheme, host y port. Las solicitudes `GET` no requieren esa cabecera. Origin y CSRF son requisitos de las operaciones mutantes, no mecanismos de autenticación ni un token CSRF secreto. Si falla Origin o CSRF, la API responde `403` con el código `UNAUTHORIZED_REQUEST` y mensaje `Request could not be verified`. La validación de frontend no se considera un control de seguridad.

Los strings de negocio requeridos se recortan en sus extremos, deben conservar al menos un carácter tras ese trim y respetan los máximos físicos aprobados. Los emails de User y Candidate son la excepción de normalización específica: se recortan, se convierten a minúsculas y se valida la sintaxis normalizada antes de almacenar, buscar y comparar. No se aplican reglas específicas de proveedores como quitar puntos de Gmail o reescribir aliases `+`. Los nombres de Pipeline y PipelineStage se normalizan con trim, primera letra en mayúscula y resto en minúscula antes de validar y persistir. La otra excepción es password, que se valida sin normalización.

Registro recibe como máximo tres requests por IP en una ventana de una hora; cuentan todas, tengan éxito o fallen, y un registro exitoso no reinicia el contador. Login recibe como máximo tres intentos fallidos por diez minutos, usando la combinación IP + email normalizado como clave; solo cuentan los fallos y un login exitoso reinicia el contador de esa combinación. Ambos límites responden `429` con el código `RATE_LIMIT_EXCEEDED`, sin `Retry-After`, cantidad de intentos restantes ni detalles de la política para el frontend.

Los IDs generados por RecruitLane son UUID v7. Los IDs recibidos se validan con el mecanismo UUID estándar del stack, sin exigir versión ni casing específico: uno mal formado responde `400 VALIDATION_ERROR`; uno válido que refiere a un recurso inexistente, ajeno o eliminado lógicamente responde el 404 específico del recurso, salvo que una operación defina expresamente otra regla de dominio.

La validación ocurre en varios límites:

- Frontend: feedback inmediato orientado a UX con React Hook Form.
- HTTP: DTOs con `class-validator` y ValidationPipe global de Nest con `whitelist`, rechazo de propiedades inesperadas y transformación de entradas válidas cuando corresponda. Las propiedades desconocidas de body y los query params no contemplados se rechazan con `400 VALIDATION_ERROR`; no se normalizan silenciosamente los valores de path o query.
- Services: invariantes de negocio, propiedad, transiciones y consistencia entre entidades.
- PostgreSQL: claves foráneas, unicidades, nullabilidad y restricciones físicas soportadas.

Los DTOs Nest no se comparten directamente con React; la duplicación limitada de validaciones simples es aceptable. Los query params escalares no aceptan múltiples valores; los arrays solo se expresan repitiendo el parámetro, nunca con coma ni `[]`. Un parámetro presente sin valor es inválido y los enums de query son case-sensitive. Los query params enteros solo aceptan representación decimal canónica positiva (`1`, `2`, `10`, `100`); se rechazan `01`, `+1`, `1.0`, `1e2`, valores con espacios o contenido no numérico. Tras validar ese formato, se convierten al tipo entero y se aplican las restricciones del campo. La validación de query mantiene tipos estrictos. Prisma recibe valores parametrizados; no se construye SQL concatenando entradas HTTP.

Las operaciones con body requieren JSON y aceptan `application/json` con parámetros válidos de media type, como `charset=utf-8`. Un media type no soportado responde `415 UNSUPPORTED_MEDIA_TYPE` con el mensaje `Content type is not supported`.

La API usa 200, 201 y 204 para éxito; 400 para validación, 401 para autenticación ausente/inválida/expirada, 403 para fallos de Origin o CSRF, 404 para inexistencia/no visibilidad, 409 para conflictos de dominio/estado y 429 para rate limiting. Errores inesperados devuelven 500; 503 queda disponible si se modela indisponibilidad explícita. Los fallos esperados de negocio no usan 500. Los códigos y mensajes comunes son: `UNAUTHORIZED` / `Authentication required` (401), `INVALID_CREDENTIALS` / `Invalid email or password` (401), `REGISTRATION_CONFLICT` / `Unable to create account with the provided information` (409), `RATE_LIMIT_EXCEEDED` / `Too many requests. Please try again later.` (429) e `INTERNAL_SERVER_ERROR` / `An unexpected error occurred` (500).

La representación de error es estable y pequeña. Para validación usa exactamente:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "errors": [{ "field": "...", "message": "..." }]
}
```

`errors` solo aparece cuando corresponde. Los campos anidados usan dot notation con índice, por ejemplo `stages.1.position`, y los problemas globales de payload usan `field: "body"`. El frontend identifica errores por `field`, no por el orden de `errors` ni por el texto exacto de sus mensajes. No se fija precedencia contractual entre capas de validación. Los fallos inesperados entregan información genérica al cliente; stack traces, SQL, Prisma y detalles internos solo se registran en el servidor. No se añaden reglas propias para routing, métodos inexistentes o detalles de parsing ya resueltos razonablemente por Nest y su adapter HTTP.

Las fechas públicas usan ISO 8601 en UTC. `createdAt` se expone solo en Vacancy y Application. Todo PATCH no vacío y válido puede ser un no-op y responder 200 con la representación pública actual cuando ninguna regla de dominio lo impida.

Salvo las operaciones especiales de autenticación, POST de recurso responde `201` con su representación pública completa, PATCH `/:id` responde `200` con ella, DELETE `/:id` responde `204` sin body, GET de detalle responde `200` con ella y GET de colección responde `200` con una respuesta paginada.

La paginación de Candidates, Pipelines, Vacancies y Applications usa `page` (default 1, mínimo 1) y `pageSize` (default 10, mínimo 10, máximo 100). Una página sintácticamente válida fuera del rango disponible responde 200 con una colección vacía y metadata correcta. Cada respuesta tiene la forma `{ "<resourcePlural>": [], "page": 1, "pageSize": 10, "totalItems": 0, "totalPages": 0 }`.

### Modelo físico, nombres e integridad

Las seis entidades aprobadas son `User`, `Candidate`, `Pipeline`, `PipelineStage`, `Vacancy` y `Application`. Prisma usa modelos PascalCase y campos camelCase; PostgreSQL usa tablas plurales y campos snake_case. Por ejemplo, `PipelineStage`, `currentStageId`, `createdAt` se mapean a `pipeline_stages`, `current_stage_id`, `created_at`.

Los identificadores son UUID v7 conceptuales, generados por Prisma y almacenados como tipo físico PostgreSQL `uuid`. Las fechas usan `timestamptz` en UTC, con `createdAt` y `updatedAt` no nulos; al crear un registro, `updatedAt` es la marca inicial de versión. `deletedAt` es nullable donde hay eliminación lógica.

| Entidad | Campos y límites físicos relevantes |
| --- | --- |
| `User` | `id`, `firstName` (100), `lastName` (100), `email` (200), `passwordHash` (255), timestamps |
| `Candidate` | `id`, `userId`, `firstName` (100), `lastName` (100), `email` (200), `phone` (30, nullable), timestamps |
| `Pipeline` | `id`, `userId`, `name` (100), `isDefault`, `deletedAt`, timestamps |
| `PipelineStage` | `id`, `pipelineId`, `name` (100), `position`, timestamps |
| `Vacancy` | `id`, `userId`, `pipelineId`, `title` (200), `companyName` (200), `description` (1500), `status`, timestamps |
| `Application` | `id`, `vacancyId`, `candidateId`, `currentStageId`, `deletedAt`, timestamps |

El límite de `description` no sustituye la validación, codificación de salida ni cualquier sanitización necesaria. `Vacancy.status` es el único enum de este diseño: `DRAFT`, `OPEN`, `FILLED`, `CANCELLED`. PipelineStage no usa enum porque los nombres de etapas no son tipos técnicos.

Se aplican claves foráneas con comportamiento defensivo equivalente a `onDelete: Restrict`; no hay cascadas destructivas. Las unicidades físicas son `User.email`, `Candidate(userId, email)`, `PipelineStage(pipelineId, name)` y `PipelineStage(pipelineId, position)`. La unicidad de Pipeline activo se materializa con un índice único parcial sobre `(user_id, name)` donde `deleted_at IS NULL`, permitiendo reutilizar el nombre de un Pipeline eliminado lógicamente. Pipeline y Application son los únicos recursos con borrado lógico (`deletedAt IS NULL` para filas activas); User, Candidate, Vacancy y PipelineStage no lo tienen, y V1 no expone borrado físico. Las consultas normales de Pipeline y Application deben excluir expresamente las filas eliminadas; no se incorpora middleware Prisma mágico para ello. `PipelineStage.position` es obligatoria y, junto con su unicidad física, los Services validan que las posiciones cubran exactamente `1..n`.

La unicidad de Application activa se materializa en PostgreSQL con un índice único parcial sobre `(candidate_id, vacancy_id)` donde `deleted_at IS NULL`. No se modela como `UNIQUE(candidate_id, vacancy_id, deleted_at)`. Prisma continúa siendo el camino principal, pero el índice parcial se incorpora en una migración Prisma revisada con el SQL mínimo necesario, sin depender de capacidades preview de índices parciales.

Cada User tiene funcionalmente un único Pipeline predeterminado. Registro y su transacción lo garantizan; no se añade una restricción parcial adicional para `isDefault`, pues V1 no permite reemplazarlo. Las invariantes `Vacancy.pipeline.userId == Vacancy.userId`, Candidate y Vacancy de una Application pertenecen al mismo User, y `Application.currentStage.pipelineId == Vacancy.pipelineId` se validan en Services. No se agregan triggers ni campos redundantes para forzarlas en SQL.

Alternativa considerada: delegar todas las invariantes al motor o todos los controles a la aplicación. Se descarta: PostgreSQL protege la integridad relacional y Prisma actúa como capa de persistencia, mientras los Services tienen el contexto necesario para las reglas transversales y de ciclo de vida.

### Operaciones atómicas, consultas e índices

Registro ejecuta una transacción que crea User, el Pipeline predeterminado `Default` y las seis etapas ordenadas `Applied`, `Screening`, `Interview`, `Offer`, `Hired`, `Rejected`; ante cualquier fallo no persiste ninguna parte. La creación de un Pipeline personalizado también es una transacción: crea el Pipeline y entre tres y diez etapas; un fallo de etapa revierte todo. Las posiciones son la fuente de verdad de las etapas; el orden físico del array recibido no influye. Cuando `PATCH /api/pipelines/:id` recibe `stages`, sincroniza atómicamente la colección completa: una stage con `id` actualiza una existente, una sin `id` crea una nueva y una existente cuyo `id` no aparece se elimina físicamente. La editabilidad se deriva de las reglas de asociación ya definidas; no se persiste un campo `isEditable`. Otras transacciones se añaden solo ante una necesidad real de atomicidad o concurrencia.

Las reglas funcionales existentes se preservan: el Pipeline predeterminado no se edita/elimina; uno personalizado queda inmutable tras asociarse por primera vez a cualquier Vacancy; una Vacancy mantiene su Pipeline; Application se crea, mueve y elimina lógicamente solo con Vacancy `OPEN`; una Application nueva inicia en la primera etapa de ese Pipeline. No se introduce historial de etapas, adyacencia, terminalidad ni recuperación de recursos eliminados.

Los índices explícitos iniciales son `Vacancy(userId, status)` y `Application(vacancyId, currentStageId)`, además de claves primarias, unicidades y el índice parcial activo. No se añade un índice separado `Application(candidateId)`, ya que el índice parcial que empieza por `candidate_id` sirve a la consulta primaria de Applications activas. Todo índice adicional debe responder a patrones de consulta reales.

### Estrategia de pruebas

Se usa TDD pragmático: RED con el test mínimo significativo que falla por la razón esperada, GREEN con la mínima implementación y REFACTOR manteniendo los tests relevantes. No se exige TDD para detalles presentacionales triviales ni se usa porcentaje de cobertura como objetivo; solo puede observarse como diagnóstico. Cada test debe justificarse por requisito/escenario OpenSpec, regla de negocio, contrato HTTP, restricción de persistencia, riesgo de seguridad, regresión, comportamiento UI significativo o flujo E2E representativo.

- Unitarias backend: Jest, principalmente Services y reglas aisladas; mocks de infraestructura y sin PostgreSQL. Se prueba el uso de JWT, Argon2 y Prisma por RecruitLane, no las librerías internamente.
- Integración: Jest, Prisma real, PostgreSQL real y Testcontainers. La suite inicia un contenedor, aplica migraciones reales, limpia datos entre tests y lo destruye. Cada test crea sus fixtures mínimos; no usa seed ni transacción por test inicialmente. Cubre transacciones, FKs, unicidades, índice parcial, soft delete y comportamiento PostgreSQL/Prisma real.
- API: Jest y Nest testing application con routing, Guards, ValidationPipe, Controllers, Services y mapeo de errores reales; se simula la frontera Prisma. Cubre estados HTTP, error/response contracts, autenticación, propiedad y validación, sin duplicar garantías específicas de base de datos.
- Componentes frontend: Vitest y React Testing Library con React, React Hook Form y validación real; se puede simular la mutación/borde API. Se observa mensajes, habilitación de acciones, submit y datos de mutación, no detalles internos.
- E2E: Playwright contra Browser -> React -> Nest -> Prisma -> PostgreSQL. Prepara estado mínimo directamente con Prisma cuando el setup no es lo evaluado; la registración puede partir vacía. Usa pocos flujos representativos y nunca el seed de demo como dependencia.

### Docker, configuración, migraciones, seed y despliegue

Docker es el flujo oficial de desarrollo. La composición prevista contiene `front`, `back`, `postgres` y un servicio/tarea de migración de una sola ejecución. Los contenedores soportan desarrollo iterativo y hot reload mediante montajes/watch apropiados. No se documenta un segundo flujo oficial con React y Nest corriendo en host y solo PostgreSQL en Docker.

V1 usa un único contrato de variables. `.env` contiene valores reales y está ignorado; `.env.example` se versiona y enumera nombres sin secretos. `DATABASE_URL`, `JWT_SECRET`, credenciales PostgreSQL y `DEMO_USER_PASSWORD` son secretos de backend/infraestructura y nunca se exponen como `VITE_*`. El frontend requiere configuración mínima porque usa `/api` relativo.

Crear migraciones es una acción explícita de desarrollo: se revisan y versionan. Las migraciones aprobadas se aplican automáticamente al iniciar el stack, en orden PostgreSQL -> health check -> migración one-shot exitosa -> backend. El backend no crea esquema automáticamente a partir de cambios Prisma no revisados.

El seed es explícito, nunca parte del arranque normal. Sirve a desarrollo/demostración, es ficticio, determinista y razonablemente repetible; no sirve como fixture de test. La contraseña demo llega por entorno y se hashea con Argon2id al ejecutar el seed; no se hardcodea, versiona ni usa como credencial fija de producción.

El despliegue final es agnóstico al proveedor: HTTPS sirve React, enruta `/api/*` a Nest y mantiene PostgreSQL privado/no público. La elección posterior evalúa coste/free tier, compatibilidad Docker, PostgreSQL, TLS/HTTPS, seguridad y facilidad de despliegue temporal del curso. Cualquier restricción temporal para la instancia demo (por ejemplo, dominio de email) es configuración de despliegue, no lógica de negocio de RecruitLane.

### Principios de implementación

SOLID se aplica cuando mejora límites de responsabilidad; DRY solo cuando se duplica el mismo conocimiento; KISS y YAGNI orientan la solución más pequeña que cumple los requisitos. OWASP guía las decisiones durante todo el desarrollo, no solo una etapa final de endurecimiento. Ninguno de estos principios justifica abstracciones, dependencias o funciones especulativas.

## Risks / Trade-offs

- [JWT robado antes de logout sigue válido hasta cuatro horas] -> Cookies HttpOnly, HTTPS, SameSite estricto, protección CSRF y vida absoluta limitada; V1 acepta la falta de revocación.
- [La cookie exige defensas CSRF y mismo origen] -> Verificar Origin y usar cabecera CSRF personalizada, sin CORS permisivo.
- [Registro puede permitir inferencia de cuentas por su estado de respuesta] -> Código y mensaje no revelan explícitamente la causa; se documenta como trade-off hasta que exista verificación de email u otro requisito.
- [Las invariantes entre tablas no caben todas en una FK] -> Services ejecutan comprobaciones de propiedad, Pipeline y etapa dentro de operaciones coherentes; integración prueba los casos críticos.
- [Soft delete puede filtrarse a flujos normales o bloquear falsamente una nueva Application] -> Consultas explícitas de activas y prueba de índice parcial/migración real; no middleware implícito.
- [El SQL mínimo para índice parcial no es expresable de forma portable por Prisma] -> Mantenerlo aislado, revisado y versionado en la migración PostgreSQL requerida.
- [Los límites físicos no previenen contenido inseguro] -> Mantener validación de entrada y codificación/sanitización según el contexto de salida.
- [Docker añade complejidad al arranque local] -> Health check y servicio de migración ordenan dependencias, manteniendo un solo flujo oficial reproducible.

## Migration Plan

No hay usuarios ni esquema de una versión anterior que migrar. La primera implementación crea y revisa el esquema Prisma y sus migraciones, incluyendo el SQL mínimo de los índices únicos parciales de Pipeline activo `(user_id, name) WHERE deleted_at IS NULL` y Application activa `(candidate_id, vacancy_id) WHERE deleted_at IS NULL`. El arranque de Docker espera PostgreSQL saludable, ejecuta migraciones aprobadas y solo entonces inicia el backend.

Si una migración versionada falla, backend no inicia y la causa se corrige mediante una nueva migración revisada o el rollback específico que corresponda antes de desplegar. No se ejecutan cambios de esquema no revisados en el arranque. Al no existir datos previos ni despliegue definido, no se prescribe una reversión concreta adicional.

## Open Questions

- Proveedor de despliegue y mecanismo concreto de proxy/reverse proxy.
- CI/CD.
- Parámetros Argon2id, generación de `JWT_SECRET` y cadencia final de ejecución de tests.
