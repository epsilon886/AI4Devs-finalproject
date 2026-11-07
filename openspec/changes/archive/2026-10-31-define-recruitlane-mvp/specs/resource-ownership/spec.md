## Purpose

Garantizar el aislamiento funcional de todos los recursos de RecruitLane entre Recruiters independientes.

## ADDED Requirements

### Requirement: Propiedad de recursos por Recruiter
Los Candidates, Pipelines, Vacancies y Applications MUST pertenecer a un único Recruiter. El sistema MUST aislar esos recursos por propietario y MUST aplicar la propiedad en toda consulta, modificación, asociación y operación de eliminación permitida.

#### Scenario: Acceso a recurso de otro Recruiter
- **WHEN** un Recruiter intenta consultar o modificar un candidato, pipeline, vacante o postulación que pertenece a otro Recruiter
- **THEN** el sistema deniega la operación y no expone el recurso ajeno

### Requirement: Asociaciones exclusivamente propias
El sistema MUST impedir que un Recruiter combine recursos de propietarios distintos. En particular, MUST impedir usar un pipeline ajeno en una vacante, crear una Application con candidato o vacante ajenos, mover una Application ajena y seleccionar una etapa de un pipeline ajeno.

#### Scenario: Creación de postulación con recurso ajeno
- **WHEN** un Recruiter intenta crear una postulación con un candidato o una vacante de otro Recruiter
- **THEN** el sistema rechaza la operación

#### Scenario: Selección de etapa ajena
- **WHEN** un Recruiter intenta mover una postulación propia a una etapa perteneciente a un pipeline de otro Recruiter
- **THEN** el sistema rechaza el movimiento

### Requirement: Sin ámbito compartido de usuarios
El MVP MUST operar sin organizaciones, equipos, workspaces, roles, permisos configurables, invitaciones ni colaboración entre Recruiters.

#### Scenario: Intento de operación colaborativa
- **WHEN** un Recruiter intenta compartir o delegar el acceso a sus recursos a otro Recruiter
- **THEN** el sistema no ofrece ni ejecuta esa capacidad en el MVP
