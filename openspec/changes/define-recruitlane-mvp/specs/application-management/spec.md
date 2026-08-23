## Purpose

Representar la participación de un candidato en una vacante y controlar su etapa dentro del pipeline asignado a esa vacante.

## ADDED Requirements

### Requirement: La postulación vincula candidato, vacante y etapa
Una Application MUST representar a un Candidate participando en una Vacancy. La etapa MUST pertenecer a la Application, no directamente al Candidate. Un Candidate MUST poder tener postulaciones en varias vacantes distintas.

#### Scenario: Candidato en dos vacantes
- **WHEN** un Recruiter crea postulaciones activas del mismo candidato en dos vacantes distintas que están abiertas
- **THEN** el sistema conserva una Application independiente para cada vacante

### Requirement: Creación de postulación activa
El sistema MUST crear una Application únicamente cuando el Candidate y la Vacancy pertenecen al Recruiter autenticado y la Vacancy está en estado `OPEN`. Al crearla, el sistema MUST asignar automáticamente la primera etapa del pipeline de la Vacancy.

#### Scenario: Creación válida de postulación
- **WHEN** un Recruiter crea una postulación con un candidato y una vacante propios en estado `OPEN`
- **THEN** el sistema crea la postulación en la primera etapa del pipeline de la vacante

#### Scenario: Creación para vacante no abierta
- **WHEN** un Recruiter intenta crear una postulación para una vacante `DRAFT`, `FILLED` o `CANCELLED`
- **THEN** el sistema rechaza la creación

### Requirement: Unicidad de postulación activa por candidato y vacante
El sistema MUST permitir solo una Application activa para la misma combinación Candidate + Vacancy. Una Application eliminada lógicamente MUST dejar de impedir que se cree una nueva Application activa para esa misma combinación. Esta especificación no define la implementación física de esa regla de unicidad.

#### Scenario: Segunda postulación activa para la misma combinación
- **WHEN** un Recruiter intenta crear otra postulación activa con el mismo candidato y la misma vacante
- **THEN** el sistema rechaza la creación

#### Scenario: Nueva postulación tras eliminación lógica
- **WHEN** un Recruiter crea una postulación para una combinación candidato-vacante cuya postulación anterior fue eliminada lógicamente
- **THEN** el sistema permite la nueva postulación si la vacante está `OPEN`

### Requirement: Movimiento libre dentro del pipeline de la vacante
Una Application de una Vacancy `OPEN` MUST poder moverse libremente a cualquier etapa del pipeline de esa Vacancy. El destino MUST pertenecer al mismo pipeline asignado a la Vacancy; MUST NOT existir restricciones de etapas siguiente, anterior ni terminal. Moverla a su `currentStageId` actual MUST ser un no-op exitoso.

#### Scenario: Movimiento entre etapas no consecutivas
- **WHEN** un Recruiter mueve una postulación de una etapa a otra etapa no consecutiva del pipeline de su vacante abierta
- **THEN** el sistema actualiza la etapa de la postulación

#### Scenario: Movimiento a la etapa actual
- **WHEN** un Recruiter mueve una postulación a su `currentStageId` actual
- **THEN** el sistema responde con éxito sin cambiar la etapa

#### Scenario: Etapa de otro pipeline
- **WHEN** un Recruiter intenta mover una postulación a una etapa que no pertenece al pipeline de su vacante
- **THEN** el sistema rechaza el movimiento

### Requirement: Applications de vacantes no abiertas son de solo consulta
Las Applications de vacantes `DRAFT`, `FILLED` o `CANCELLED` MUST poder consultarse, pero MUST NOT poder moverse a otra etapa ni eliminarse lógicamente.

#### Scenario: Movimiento en vacante cerrada operativamente
- **WHEN** un Recruiter intenta mover una postulación de una vacante `FILLED`
- **THEN** el sistema rechaza el movimiento

### Requirement: Eliminación lógica de Applications en vacantes abiertas
El sistema MUST permitir que un Recruiter elimine lógicamente una Application propia únicamente cuando su Vacancy está en estado `OPEN`. Una Application eliminada lógicamente MUST considerarse ausente de los flujos normales: MUST NOT aparecer en listados normales, estar disponible para consulta, recuperación o uso normal, ni participar en nuevas asociaciones. El MVP MUST NOT ofrecer papelera, restauración ni recuperación. La eliminación lógica MUST liberar la combinación activa Candidate + Vacancy para permitir una nueva Application activa posterior. Esta especificación no define el mecanismo físico de la eliminación lógica.

#### Scenario: Eliminación de postulación en vacante abierta
- **WHEN** un Recruiter elimina una Application propia cuya Vacancy está `OPEN`
- **THEN** el sistema la trata como eliminada, deja de considerarla activa y la excluye de los flujos normales

#### Scenario: Eliminación de postulación en vacante no abierta
- **WHEN** un Recruiter intenta eliminar una Application cuya Vacancy está `DRAFT`, `FILLED` o `CANCELLED`
- **THEN** el sistema rechaza la eliminación

#### Scenario: Intento de recuperar una postulación eliminada
- **WHEN** un Recruiter intenta acceder a una papelera o restaurar una Application eliminada lógicamente
- **THEN** el sistema no ofrece ni ejecuta esa capacidad en el MVP

### Requirement: Contrato HTTP de Applications
El sistema MUST exponer `POST /api/applications`, `GET /api/applications`, `GET /api/applications/:id`, `PATCH /api/applications/:id` y `DELETE /api/applications/:id`. Solo se exponen Applications activas. POST recibe únicamente `candidateId` y `vacancyId`, no acepta `currentStageId`, asigna la stage de posición 1 y responde `201` con el detalle público. Un Candidate o Vacancy no visible o inexistente responde respectivamente `404 CANDIDATE_NOT_FOUND` con `Candidate not found` o `404 VACANCY_NOT_FOUND` con `Vacancy not found`. Una combinación activa duplicada responde `409 APPLICATION_ALREADY_EXISTS` con `An active application already exists for this candidate and vacancy`.

El summary de listado es `{ id, createdAt, candidate: { id, firstName, lastName }, vacancy: { id, title }, currentStage: { id, name, position } }`. El detalle y las respuestas exitosas de POST/PATCH son `{ id, createdAt, candidate: { id, firstName, lastName, email, phone }, vacancy: { id, title, companyName }, pipeline: { name }, currentStage: { id, name, position } }`. La colección está paginada, ordenada por `createdAt` DESC, y acepta únicamente el filtro escalar opcional `vacancyId`; sin ese filtro incluye todas las Applications activas propias. Un `vacancyId` válido pero no visible o inexistente responde `404 VACANCY_NOT_FOUND`.

PATCH recibe únicamente `{ currentStageId }`, permite mover libremente a cualquier stage del Pipeline de la Vacancy y responde `200` con el detalle público; mover a la stage actual es un no-op válido. Un `currentStageId` UUID válido pero inexistente o que no pertenece al Pipeline de la Vacancy responde `400 VALIDATION_ERROR`. DELETE sobre una Application de Vacancy `OPEN` hace eliminación lógica y responde `204` sin body. Una Vacancy no `OPEN` responde `409 VACANCY_NOT_OPEN` con `The vacancy does not allow this operation`; una Application no visible, inexistente o ya eliminada responde `404 APPLICATION_NOT_FOUND`.

#### Scenario: Creación HTTP de Application
- **WHEN** un Recruiter envía Candidate y Vacancy propios de una Vacancy abierta a `POST /api/applications`
- **THEN** la API responde `201` con el detalle público en la primera stage

#### Scenario: Movimiento HTTP de Application
- **WHEN** un Recruiter actualiza `currentStageId` a una stage válida del Pipeline de la Vacancy mediante `PATCH /api/applications/:id`
- **THEN** la API responde `200` con el detalle público y la stage actual resultante

#### Scenario: Eliminación HTTP de Application
- **WHEN** un Recruiter elimina una Application activa de una Vacancy abierta mediante `DELETE /api/applications/:id`
- **THEN** la API responde `204` y la Application deja de exponerse
