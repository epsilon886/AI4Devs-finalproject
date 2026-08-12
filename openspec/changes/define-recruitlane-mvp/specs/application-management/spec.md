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
Una Application de una Vacancy `OPEN` MUST poder moverse libremente a cualquier etapa del pipeline de esa Vacancy. El destino MUST pertenecer al mismo pipeline asignado a la Vacancy; no MUST haber restricciones de etapas siguiente, anterior ni terminal.

#### Scenario: Movimiento entre etapas no consecutivas
- **WHEN** un Recruiter mueve una postulación de una etapa a otra etapa no consecutiva del pipeline de su vacante abierta
- **THEN** el sistema actualiza la etapa de la postulación

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
