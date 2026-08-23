## Purpose

Permitir que el único actor funcional, el Recruiter, cree y gestione su sesión de acceso individual a RecruitLane.

## ADDED Requirements

### Requirement: Registro de Recruiter
El sistema MUST permitir que una persona se registre como Recruiter con nombre, apellido, correo electrónico y contraseña. El correo electrónico de cada Recruiter MUST ser único globalmente; el sistema MUST rechazar un registro que reutilice un correo ya registrado.

#### Scenario: Registro con correo nuevo
- **WHEN** una persona se registra con un correo que no pertenece a otro Recruiter
- **THEN** el sistema crea su cuenta de Recruiter y la deja habilitada para autenticarse mediante el flujo de inicio de sesión

#### Scenario: Registro con correo duplicado
- **WHEN** una persona intenta registrarse con un correo que ya pertenece a un Recruiter
- **THEN** el sistema rechaza el registro y no crea una segunda cuenta para ese correo

### Requirement: Inicio y cierre de sesión
El sistema MUST permitir que un Recruiter registrado inicie sesión con sus credenciales y cierre sesión eliminando o intentando eliminar la cookie `session` del cliente. Las requests posteriores del navegador sin esa cookie MUST dejar de autenticarse para las operaciones que requieren autenticación. El cierre de sesión no revoca server-side un JWT ya emitido: un JWT copiado previamente permanece válido hasta su expiración absoluta.

#### Scenario: Inicio de sesión correcto
- **WHEN** un Recruiter proporciona credenciales válidas
- **THEN** el sistema le concede una sesión autenticada

#### Scenario: Cierre de sesión
- **WHEN** un Recruiter autenticado cierra su sesión
- **THEN** el sistema elimina o intenta eliminar `session`, por lo que las requests posteriores de su navegador sin esa cookie dejan de autenticarse, sin revocar server-side un JWT ya emitido

### Requirement: Protección de solicitudes que cambian estado
Las operaciones `POST`, `PATCH` y `DELETE` MUST requerir la cabecera `X-CSRF-Protection: 1` y un `Origin` same-origin que coincida en scheme, host y port. Las operaciones `GET` MUST NOT requerir la cabecera CSRF. Ante un fallo de Origin o CSRF, el sistema MUST responder `403` con el código `UNAUTHORIZED_REQUEST` y mensaje `Request could not be verified`, sin revelar cuál comprobación falló. Estas comprobaciones son defensas de requests mutantes, no autenticación ni un token secreto.

#### Scenario: Solicitud mutante sin protección válida
- **WHEN** una operación `POST`, `PATCH` o `DELETE` no incluye `X-CSRF-Protection: 1` o falla la validación de `Origin`
- **THEN** el sistema responde `403` con el código `UNAUTHORIZED_REQUEST` sin revelar la comprobación fallida

#### Scenario: Consulta sin cabecera CSRF
- **WHEN** un Recruiter realiza una operación `GET` sin la cabecera `X-CSRF-Protection`
- **THEN** el sistema no rechaza la consulta por ausencia de esa cabecera

### Requirement: Rate limiting de registro e inicio de sesión
El sistema MUST limitar el registro a tres requests por IP en una ventana de una hora; cuentan tanto las requests exitosas como las fallidas y un registro exitoso no reinicia el contador. El sistema MUST limitar el inicio de sesión a tres intentos fallidos por diez minutos para cada combinación de IP y email normalizado; solo cuentan los intentos fallidos y un inicio de sesión exitoso reinicia el contador de esa combinación. Cuando se alcanza un límite, el sistema MUST responder `429` con el código `RATE_LIMIT_EXCEEDED` y mensaje `Too many requests. Please try again later.`, sin exponer `Retry-After`, intentos restantes ni detalles de la política.

#### Scenario: Límite de registro alcanzado
- **WHEN** una IP realiza una cuarta request de registro dentro de una hora
- **THEN** el sistema responde `429` con el código `RATE_LIMIT_EXCEEDED` sin exponer información de la política

#### Scenario: Límite de inicio de sesión alcanzado
- **WHEN** una combinación de IP y email normalizado realiza un cuarto intento fallido dentro de diez minutos
- **THEN** el sistema responde `429` con el código `RATE_LIMIT_EXCEEDED` sin exponer información de la política

#### Scenario: Inicio de sesión exitoso reinicia fallos
- **WHEN** un Recruiter inicia sesión correctamente tras intentos fallidos previos de la misma combinación de IP y email normalizado
- **THEN** el sistema reinicia el contador de fallos de esa combinación

### Requirement: Protección de contraseñas
El sistema MUST impedir el almacenamiento de contraseñas en texto plano. La contraseña se valida exactamente como llega, sin trim, lowercase ni otra normalización, y debe tener entre 15 y 128 caracteres. Las decisiones de hash, token y cookie se rigen por el diseño aprobado.

#### Scenario: Persistencia de una contraseña registrada
- **WHEN** una persona completa un registro
- **THEN** el sistema no conserva la contraseña proporcionada en texto plano

### Requirement: Contrato HTTP de autenticación
El sistema MUST exponer las operaciones `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` y `GET /api/auth/me`. Registro, login y logout no requieren una sesión autenticada válida; las demás operaciones permanecen privadas por defecto. `POST /api/auth/register` recibe `firstName`, `lastName`, `email` y `password` obligatorios, responde `201` con `{ "message": "Account created successfully" }` y no inicia sesión. `POST /api/auth/login` recibe `email` y `password` obligatorios, responde `200`, escribe la cookie `session` y devuelve el User público `{ id, firstName, lastName, email }`. `POST /api/auth/logout` no recibe body, siempre intenta limpiar `session` y responde `204` sin body incluso sin cookie válida. `GET /api/auth/me` responde `200` con ese mismo User público. Un login inválido responde `401 INVALID_CREDENTIALS` con `Invalid email or password`; un registro duplicado responde `409 REGISTRATION_CONFLICT` con `Unable to create account with the provided information`.

#### Scenario: Registro HTTP exitoso
- **WHEN** una persona envía a `POST /api/auth/register` los cuatro campos requeridos y válidos
- **THEN** la API responde `201` con el mensaje de creación y sin iniciar sesión

#### Scenario: Login HTTP exitoso
- **WHEN** un Recruiter envía credenciales válidas a `POST /api/auth/login`
- **THEN** la API responde `200`, escribe `session` y devuelve su User público

#### Scenario: Logout idempotente
- **WHEN** una request válida de protección de origen llama `POST /api/auth/logout` sin una cookie de sesión válida
- **THEN** la API intenta limpiar `session` y responde `204` sin body
