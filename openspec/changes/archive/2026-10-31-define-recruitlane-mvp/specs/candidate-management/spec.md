## Purpose

Permitir que cada Recruiter mantenga su propia cartera mínima de candidatos sin exponerla a otros Recruiters.

## ADDED Requirements

### Requirement: Datos mínimos del candidato
El sistema MUST permitir que un Recruiter cree candidatos propios con `firstName`, `lastName` y `email` obligatorios, y `phone` opcional. La representación pública de un Candidate MUST incluir siempre `phone`: como string cuando existe y como `null` cuando no existe. El MVP MUST NOT incluir CV, habilidades, pretensión salarial, etiquetas, notas, perfiles de LinkedIn ni otros atributos de candidato.

#### Scenario: Creación con datos obligatorios
- **WHEN** un Recruiter crea un candidato con nombre, apellido y correo
- **THEN** el sistema crea el candidato como recurso de ese Recruiter

#### Scenario: Creación sin campo obligatorio
- **WHEN** un Recruiter intenta crear un candidato sin nombre, apellido o correo
- **THEN** el sistema rechaza la creación

### Requirement: Unicidad del correo del candidato por propietario
El correo electrónico de un candidato MUST normalizarse mediante trim y lowercase antes de almacenarse y evaluarse. El valor normalizado MUST ser único entre los candidatos del mismo Recruiter. El mismo correo normalizado MUST poder usarse para candidatos pertenecientes a Recruiters diferentes.

#### Scenario: Correo repetido para el mismo Recruiter
- **WHEN** un Recruiter crea o actualiza un candidato con un correo ya usado por otro de sus candidatos
- **THEN** el sistema rechaza la operación

#### Scenario: Correo igual para Recruiters distintos
- **WHEN** dos Recruiters distintos crean candidatos con el mismo correo
- **THEN** el sistema permite ambos candidatos independientes

### Requirement: Gestión sin eliminación de candidatos
El sistema MUST permitir que un Recruiter consulte y actualice los campos mínimos de sus propios candidatos. En PATCH, `phone: null` MUST eliminar el teléfono actual y la ausencia de `phone` MUST conservar su valor. El MVP MUST NOT ofrecer eliminación de candidatos.

#### Scenario: Actualización de candidato propio
- **WHEN** un Recruiter actualiza los campos permitidos de uno de sus candidatos
- **THEN** el sistema conserva los valores actualizados si cumplen las reglas del candidato

#### Scenario: Actualización de teléfono del candidato propio
- **WHEN** un Recruiter actualiza un Candidate propio con `phone: null` o sin enviar `phone`
- **THEN** el sistema elimina el teléfono en el primer caso y conserva el valor existente en el segundo

#### Scenario: Solicitud de eliminación de candidato
- **WHEN** un Recruiter intenta eliminar un candidato
- **THEN** el sistema no ofrece ni ejecuta la eliminación en el MVP

### Requirement: Contrato HTTP de Candidates
El sistema MUST exponer `POST /api/candidates`, `GET /api/candidates`, `GET /api/candidates/:id` y `PATCH /api/candidates/:id`; V1 no ofrece DELETE. El Candidate público es `{ id, firstName, lastName, email, phone }`, sin `userId` ni timestamps. POST requiere `firstName`, `lastName` y `email`; `phone` puede omitirse o ser `null`, en cuyo caso se representa como `null`. PATCH admite los mismos campos permitidos y no vacío; `phone` omitido conserva el valor y `phone: null` lo elimina. Un PATCH válido puede ser no-op y responde `200` con la representación actual. Si `phone` es string, tras trim debe tener `+` opcional solo al inicio, luego solo dígitos, entre seis dígitos y 30 caracteres totales, sin espacios internos, paréntesis ni guiones. El conflicto de email normalizado responde `409 CANDIDATE_EMAIL_CONFLICT` con `A candidate with this email already exists`; un Candidate no visible o inexistente responde `404 CANDIDATE_NOT_FOUND` con `Candidate not found`.

La colección está paginada, ordenada por `lastName` ASC y después `firstName` ASC sin distinguir mayúsculas/minúsculas, y no tiene filtros en V1.

#### Scenario: Creación HTTP de Candidate
- **WHEN** un Recruiter envía a `POST /api/candidates` los campos requeridos y un teléfono válido u omitido
- **THEN** la API responde `201` con el Candidate público completo

#### Scenario: Listado paginado de Candidates
- **WHEN** un Recruiter consulta `GET /api/candidates`
- **THEN** la API responde `200` con la colección paginada y el orden contractual
