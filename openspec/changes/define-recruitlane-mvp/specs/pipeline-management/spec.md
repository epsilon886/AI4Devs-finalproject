## Purpose

Definir pipelines de selección propios con etapas ordenadas, incluyendo un pipeline inicial fijo y pipelines personalizados con reglas de inmutabilidad.

## ADDED Requirements

### Requirement: Pipeline predeterminado por Recruiter
El sistema MUST crear automáticamente un único pipeline predeterminado llamado `Default` para cada Recruiter. Sus etapas ordenadas MUST ser: Applied, Screening, Interview, Offer, Hired y Rejected. El Recruiter MUST poder usarlo en vacantes, pero MUST NOT poder editarlo ni eliminarlo.

#### Scenario: Creación automática al registrar un Recruiter
- **WHEN** se crea una cuenta de Recruiter
- **THEN** el sistema crea para ese Recruiter el pipeline predeterminado `Default` con las seis etapas en el orden definido

#### Scenario: Intento de modificar el pipeline predeterminado
- **WHEN** un Recruiter intenta renombrar, reordenar, agregar o eliminar etapas del pipeline predeterminado, o eliminarlo
- **THEN** el sistema rechaza la modificación o eliminación

### Requirement: Creación de pipelines personalizados válidos
El sistema MUST permitir que un Recruiter cree pipelines personalizados propios. Los nombres de Pipeline y PipelineStage MUST normalizarse mediante trim, primera letra en mayúscula y resto en minúscula antes de validarse y persistirse. El nombre normalizado de un Pipeline MUST ser único entre los pipelines activos del mismo Recruiter; un Pipeline eliminado lógicamente MUST NOT impedir reutilizar su nombre. Cada pipeline personalizado MUST tener entre 3 y 10 etapas; cada etapa MUST tener nombre y `position` obligatorios. Las posiciones MUST ser únicas y cubrir exactamente el rango `1..n`; los nombres normalizados de etapa no pueden duplicarse dentro del mismo pipeline. El orden físico del array recibido no determina el orden: `position` es la fuente de verdad.

#### Scenario: Creación de pipeline personalizado válido
- **WHEN** un Recruiter crea un pipeline con nombre y de 3 a 10 etapas con nombres distintos y posiciones completas
- **THEN** el sistema crea el pipeline con las etapas ordenadas por `position`, independientemente del orden del array recibido

#### Scenario: Creación de pipeline con etapas inválidas
- **WHEN** un Recruiter intenta crear un pipeline con menos de 3, más de 10, etapas sin nombre o posición, posiciones duplicadas o fuera del rango completo, o nombres de etapa duplicados
- **THEN** el sistema rechaza la creación

#### Scenario: Reutilización de nombre de pipeline eliminado
- **WHEN** un Recruiter crea un pipeline con el nombre normalizado de otro pipeline propio eliminado lógicamente
- **THEN** el sistema permite crear el nuevo pipeline

### Requirement: Edición antes de la primera asociación con una vacante
Un pipeline personalizado que nunca estuvo asociado con una vacante MUST poder cambiar su nombre, agregar o eliminar etapas, renombrar etapas y reordenarlas, siempre que el resultado siga cumpliendo las reglas de un pipeline personalizado válido. Cuando `PATCH /api/pipelines/:id` incluye `stages`, esa propiedad MUST representar la colección completa resultante: una stage con `id` actualiza una existente, una sin `id` crea una nueva y una stage existente cuyo `id` no aparece se elimina físicamente. La sincronización MUST ser atómica.

#### Scenario: Edición de pipeline personalizado no asociado
- **WHEN** un Recruiter modifica un pipeline personalizado que nunca estuvo asociado a una vacante y el resultado es válido
- **THEN** el sistema guarda la modificación

#### Scenario: Sincronización completa de etapas
- **WHEN** un Recruiter actualiza un pipeline personalizado no asociado con `stages` válidas
- **THEN** el sistema crea, actualiza, reordena y elimina las etapas necesarias como una única operación atómica

#### Scenario: Edición que viola las reglas de etapas
- **WHEN** un Recruiter modifica un pipeline no asociado de forma que queda inválido
- **THEN** el sistema rechaza la modificación

### Requirement: Inmutabilidad tras la asociación con una vacante
Desde la primera asociación de un pipeline personalizado con cualquier vacante, ese pipeline MUST ser completamente inmutable: no se puede cambiar su nombre, agregar, eliminar, renombrar ni reordenar etapas. Esta inmutabilidad MUST mantenerse aunque la vacante cambie de estado.

#### Scenario: Modificación de pipeline previamente asociado
- **WHEN** un Recruiter intenta modificar un pipeline personalizado que ya estuvo asociado a una vacante
- **THEN** el sistema rechaza la modificación

### Requirement: Eliminación lógica de pipelines personalizados no asociados
Un pipeline personalizado MUST poder eliminarse únicamente si nunca estuvo asociado con una vacante. La eliminación MUST ser lógica. Un pipeline eliminado lógicamente MUST considerarse ausente de los flujos normales: MUST NOT aparecer en listados normales, estar disponible para consulta, recuperación o uso normal, ni poder seleccionarse para una nueva asociación con una vacante. El MVP MUST NOT ofrecer papelera, restauración ni recuperación. Esta especificación no define su mecanismo físico de persistencia.

#### Scenario: Eliminación de pipeline personalizado no asociado
- **WHEN** un Recruiter elimina un pipeline personalizado que nunca estuvo asociado con una vacante
- **THEN** el sistema lo trata como eliminado, lo excluye de los flujos normales y no permite seleccionarlo para una vacante nueva

#### Scenario: Intento de recuperar un pipeline eliminado
- **WHEN** un Recruiter intenta acceder a una papelera o restaurar un pipeline eliminado lógicamente
- **THEN** el sistema no ofrece ni ejecuta esa capacidad en el MVP

#### Scenario: Eliminación de pipeline asociado
- **WHEN** un Recruiter intenta eliminar un pipeline personalizado que ya estuvo asociado con una vacante
- **THEN** el sistema rechaza la eliminación

### Requirement: Contrato HTTP de Pipelines
El sistema MUST exponer `POST /api/pipelines`, `GET /api/pipelines`, `GET /api/pipelines/:id`, `PATCH /api/pipelines/:id` y `DELETE /api/pipelines/:id`. El Pipeline público es `{ id, name, isDefault, isEditable, stages: [{ id, name, position }] }`; `isEditable` se calcula y no se persiste. Toda respuesta que incluya `stages` las ordena por `position` ASC. POST recibe `name` y entre tres y diez stages `{ name, position }`; el orden físico del array no importa y las posiciones deben cubrir exactamente `1..n`. POST responde `201` con el Pipeline público.

PATCH admite `name` y/o `stages`; `{}` es inválido. Si incluye `stages`, representa la colección final completa: una stage existente incluye `id`, una nueva no lo incluye y una existente omitida se elimina físicamente. La creación, actualización, reordenamiento y eliminación es atómica y `position` es la fuente de verdad. IDs de stage duplicados, posiciones duplicadas o nombres duplicados después de la normalización responden `400 VALIDATION_ERROR`. Un `stages[].id` UUID válido pero inexistente o perteneciente a otro Pipeline responde `404 PIPELINE_STAGE_NOT_FOUND` con `Pipeline stage not found`; cualquier fallo aborta la sincronización. PATCH válido puede ser no-op y responde `200` con la representación actual.

Un Pipeline no visible, inexistente o eliminado lógicamente responde `404 PIPELINE_NOT_FOUND` con `Pipeline not found`. Intentar modificar o eliminar uno no editable responde `409 PIPELINE_NOT_EDITABLE` con `This pipeline can no longer be modified`; un nombre repetido activo responde `409 PIPELINE_NAME_CONFLICT` con `A pipeline with this name already exists`. DELETE permitido realiza eliminación lógica y responde `204` sin body. La colección está paginada, ordena el Default primero y luego los custom por `name` ASC sin distinguir mayúsculas/minúsculas.

#### Scenario: Creación HTTP de Pipeline
- **WHEN** un Recruiter envía un Pipeline custom válido a `POST /api/pipelines`
- **THEN** la API responde `201` con sus stages ordenadas por posición

#### Scenario: Sincronización HTTP de stages
- **WHEN** un Recruiter actualiza un Pipeline editable con `stages` válidas en `PATCH /api/pipelines/:id`
- **THEN** la API responde `200` con la colección resultante ordenada y sin cambios parciales

#### Scenario: Eliminación HTTP de Pipeline editable
- **WHEN** un Recruiter elimina un Pipeline custom editable mediante `DELETE /api/pipelines/:id`
- **THEN** la API responde `204` y el Pipeline deja de estar disponible en los flujos normales
