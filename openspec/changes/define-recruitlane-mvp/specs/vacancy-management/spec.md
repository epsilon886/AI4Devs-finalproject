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
Una vacante MUST tener uno de estos estados: `DRAFT`, `OPEN`, `FILLED` o `CANCELLED`. El sistema MUST permitir exclusivamente las transiciones `DRAFT` a `OPEN`, `OPEN` a `FILLED`, `OPEN` a `CANCELLED`, `FILLED` a `OPEN` y `CANCELLED` a `OPEN`, y MUST rechazar cualquier otra transición.

#### Scenario: Transición permitida
- **WHEN** un Recruiter cambia una vacante de `OPEN` a `FILLED`
- **THEN** el sistema actualiza el estado a `FILLED`

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
