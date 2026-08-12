## Purpose

Permitir que cada Recruiter mantenga su propia cartera mínima de candidatos sin exponerla a otros Recruiters.

## ADDED Requirements

### Requirement: Datos mínimos del candidato
El sistema MUST permitir que un Recruiter cree candidatos propios con `first_name`, `last_name` y `email` obligatorios, y `phone` opcional. El MVP MUST NOT incluir CV, habilidades, pretensión salarial, etiquetas, notas, perfiles de LinkedIn ni otros atributos de candidato.

#### Scenario: Creación con datos obligatorios
- **WHEN** un Recruiter crea un candidato con nombre, apellido y correo
- **THEN** el sistema crea el candidato como recurso de ese Recruiter

#### Scenario: Creación sin campo obligatorio
- **WHEN** un Recruiter intenta crear un candidato sin nombre, apellido o correo
- **THEN** el sistema rechaza la creación

### Requirement: Unicidad del correo del candidato por propietario
El correo electrónico de un candidato MUST ser único entre los candidatos del mismo Recruiter. El mismo correo MUST poder usarse para candidatos pertenecientes a Recruiters diferentes.

#### Scenario: Correo repetido para el mismo Recruiter
- **WHEN** un Recruiter crea o actualiza un candidato con un correo ya usado por otro de sus candidatos
- **THEN** el sistema rechaza la operación

#### Scenario: Correo igual para Recruiters distintos
- **WHEN** dos Recruiters distintos crean candidatos con el mismo correo
- **THEN** el sistema permite ambos candidatos independientes

### Requirement: Gestión sin eliminación de candidatos
El sistema MUST permitir que un Recruiter consulte y actualice los campos mínimos de sus propios candidatos. El MVP MUST NOT ofrecer eliminación de candidatos.

#### Scenario: Actualización de candidato propio
- **WHEN** un Recruiter actualiza los campos permitidos de uno de sus candidatos
- **THEN** el sistema conserva los valores actualizados si cumplen las reglas del candidato

#### Scenario: Solicitud de eliminación de candidato
- **WHEN** un Recruiter intenta eliminar un candidato
- **THEN** el sistema no ofrece ni ejecuta la eliminación en el MVP
