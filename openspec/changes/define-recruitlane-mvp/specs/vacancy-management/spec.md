## Purpose

Permitir que cada Recruiter gestione vacantes propias con un pipeline fijo y un ciclo de vida de selección claramente delimitado.

## ADDED Requirements

### Requirement: Creación de vacantes en estado DRAFT
El sistema MUST permitir que un Recruiter cree y consulte vacantes propias con `title`, `company_name`, `description` y `pipeline` obligatorios. `company_name` MUST ser únicamente texto descriptivo y el MVP MUST NOT crear entidades Company, Organization, Client, Workspace ni equivalentes. Cada vacante MUST usar exactamente un pipeline propio del Recruiter y MUST crearse automáticamente en estado `DRAFT`; el Recruiter MUST NOT elegir el estado inicial.

#### Scenario: Creación de vacante con estado inicial automático
- **WHEN** un Recruiter crea una vacante con título, texto de compañía, descripción y un pipeline propio
- **THEN** el sistema crea la vacante con exactamente ese pipeline y estado `DRAFT`

#### Scenario: Creación con dato o pipeline inválido
- **WHEN** un Recruiter intenta crear una vacante sin un campo obligatorio o con un pipeline que no le pertenece
- **THEN** el sistema rechaza la creación

### Requirement: Pipeline inmutable de la vacante
Después de crear una vacante, `title`, `company_name` y `description` MUST poder actualizarse en cualquier estado de la vacante. El pipeline seleccionado MUST permanecer inmutable y el estado MUST cambiar únicamente mediante una transición de ciclo de vida permitida.

#### Scenario: Actualización de campos editables
- **WHEN** un Recruiter actualiza el título, texto de compañía o descripción de una vacante en cualquier estado
- **THEN** el sistema guarda los campos actualizados sin cambiar el pipeline ni el estado

#### Scenario: Intento de sustituir el pipeline
- **WHEN** un Recruiter intenta cambiar el pipeline de una vacante existente
- **THEN** el sistema rechaza el cambio de pipeline

### Requirement: Estados y transiciones de vacante
Una vacante MUST tener uno de estos estados: `DRAFT`, `OPEN`, `FILLED` o `CANCELLED`. El sistema MUST permitir exclusivamente las transiciones `DRAFT` a `OPEN`, `OPEN` a `FILLED`, `OPEN` a `CANCELLED`, `FILLED` a `OPEN` y `CANCELLED` a `OPEN`, y MUST rechazar cualquier otra transición distinta de conservar el mismo estado. Un PATCH que solicita el estado actual MUST ser un no-op exitoso.

#### Scenario: Transición permitida
- **WHEN** un Recruiter cambia una vacante de `OPEN` a `FILLED`
- **THEN** el sistema actualiza el estado a `FILLED`

#### Scenario: Solicitud del estado actual
- **WHEN** un Recruiter solicita mediante PATCH el mismo estado que ya tiene una vacante
- **THEN** el sistema responde con éxito sin cambiar el estado

#### Scenario: Transición no permitida
- **WHEN** un Recruiter intenta cambiar una vacante de `DRAFT` a `FILLED`
- **THEN** el sistema rechaza el cambio de estado

### Requirement: Proceso de selección condicionado por estado
Solo una vacante en estado `OPEN` MUST poder recibir nuevas postulaciones y permitir movimientos de sus postulaciones entre etapas. Las vacantes `DRAFT`, `FILLED` y `CANCELLED` MUST seguir siendo consultables, pero su proceso de selección no puede modificarse.

#### Scenario: Vacante abierta recibe una postulación
- **WHEN** un Recruiter crea una postulación para una vacante en estado `OPEN`
- **THEN** el sistema permite la creación si se cumplen las demás reglas de postulación

#### Scenario: Vacante no abierta conserva visibilidad
- **WHEN** un Recruiter consulta una vacante `DRAFT`, `FILLED` o `CANCELLED`
- **THEN** el sistema permite consultarla pero no permite crear postulaciones ni mover sus postulaciones de etapa

### Requirement: Sin eliminación ni publicación de vacantes
El MVP MUST NOT ofrecer eliminación de vacantes ni estados o conceptos de publicación, publicado o no publicado.

#### Scenario: Solicitud fuera de alcance
- **WHEN** un Recruiter intenta eliminar una vacante o cambiar una publicación de vacante
- **THEN** el sistema no ofrece ni ejecuta esa operación en el MVP

### Requirement: Contrato HTTP de Vacancies
El sistema MUST exponer `POST /api/vacancies`, `GET /api/vacancies`, `GET /api/vacancies/:id` y `PATCH /api/vacancies/:id`; V1 no ofrece DELETE. POST requiere `title`, `companyName`, `description` y `pipelineId`, crea la Vacancy en `DRAFT` y responde `201`. `description` se recorta solo en los extremos, debe conservar al menos un carácter y tener como máximo 1500 caracteres, preservando whitespace y saltos de línea internos. Un `pipelineId` válido que no es visible, no existe o fue eliminado lógicamente responde `404 PIPELINE_NOT_FOUND`.

El detalle público y las respuestas exitosas de POST/PATCH son `{ id, title, companyName, description, status, createdAt, pipeline: { name, stages: [{ id, name, position }] } }`; no expone `pipelineId` y sus stages se ordenan por `position` ASC. PATCH tiene dos modos mutuamente excluyentes: descriptivo con `title`, `companyName` y/o `description`, o de estado con solo `{ status }`. `{}`, combinar `status` con otro campo o enviar `pipelineId` es `400 VALIDATION_ERROR`. Solicitar el estado actual es un no-op válido con `200`; una transición no permitida o una operación del proceso de selección con la Vacancy no abierta responde `409 VACANCY_NOT_OPEN` con `The vacancy does not allow this operation`. Una Vacancy no visible o inexistente responde `404 VACANCY_NOT_FOUND`.

El summary del listado es `{ id, title, companyName, createdAt, status, pipelineName }`. La colección está paginada y, antes de paginar, se ordena por prioridad de estado `OPEN`, `DRAFT`, `FILLED`, `CANCELLED`; dentro de cada estado por `LOWER(title)` ASC y, ante empate, por `id` ASC. Acepta los filtros opcionales `status` y `title`. Los valores múltiples de `status` se expresan repitiendo `status`, tienen semántica OR y los repetidos se deduplican. `title` es escalar, no repetible, se recorta en sus extremos y debe tener entre 1 y 200 caracteres; busca coincidencias parciales sin distinguir mayúsculas/minúsculas sobre el título, interpretando `%` y `_` literalmente. Cuando ambos filtros están presentes se combinan mediante AND. El filtrado y conteo son globales antes de paginar; un `title` vacío, inválido o repetido, o cualquier `status` inválido, invalida toda la request con `400`.

#### Scenario: Creación HTTP de Vacancy
- **WHEN** un Recruiter envía a `POST /api/vacancies` los cuatro campos requeridos con un Pipeline propio visible
- **THEN** la API responde `201` con el detalle público en estado `DRAFT`

#### Scenario: Actualización descriptiva de Vacancy
- **WHEN** un Recruiter envía un PATCH descriptivo válido a `PATCH /api/vacancies/:id`
- **THEN** la API responde `200` con la representación pública actualizada

#### Scenario: Listado filtrado y ordenado de Vacancies
- **WHEN** un Recruiter consulta `GET /api/vacancies` con `status` repetido con estados válidos y/o un `title` válido
- **THEN** la API responde `200` con el summary paginado de las Vacancies que cumplen los filtros globales, con OR entre estados, AND con título cuando existe y el orden contractual aplicado antes de paginar
