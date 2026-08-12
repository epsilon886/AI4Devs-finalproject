## Purpose

Permitir que el único actor funcional, el Recruiter, cree y gestione su sesión de acceso individual a RecruitLane.

## ADDED Requirements

### Requirement: Registro de Recruiter
El sistema MUST permitir que una persona se registre como Recruiter con un correo electrónico y una contraseña. El correo electrónico de cada Recruiter MUST ser único globalmente; el sistema MUST rechazar un registro que reutilice un correo ya registrado.

#### Scenario: Registro con correo nuevo
- **WHEN** una persona se registra con un correo que no pertenece a otro Recruiter
- **THEN** el sistema crea su cuenta de Recruiter y la deja habilitada para autenticarse mediante el flujo de inicio de sesión

#### Scenario: Registro con correo duplicado
- **WHEN** una persona intenta registrarse con un correo que ya pertenece a un Recruiter
- **THEN** el sistema rechaza el registro y no crea una segunda cuenta para ese correo

### Requirement: Inicio y cierre de sesión
El sistema MUST permitir que un Recruiter registrado inicie sesión con sus credenciales y cierre la sesión activa. Tras cerrar sesión, el Recruiter MUST dejar de estar autenticado para las operaciones que requieren autenticación.

#### Scenario: Inicio de sesión correcto
- **WHEN** un Recruiter proporciona credenciales válidas
- **THEN** el sistema le concede una sesión autenticada

#### Scenario: Cierre de sesión
- **WHEN** un Recruiter autenticado cierra su sesión
- **THEN** el sistema deja de autorizarle operaciones autenticadas con esa sesión

### Requirement: Protección de contraseñas
El sistema MUST impedir el almacenamiento de contraseñas en texto plano. Esta especificación no define el algoritmo de hash, la librería de autenticación, el tipo de token, su duración ni la configuración de cookies.

#### Scenario: Persistencia de una contraseña registrada
- **WHEN** una persona completa un registro
- **THEN** el sistema no conserva la contraseña proporcionada en texto plano
