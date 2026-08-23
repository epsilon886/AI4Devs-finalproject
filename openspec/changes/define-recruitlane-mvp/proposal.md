## Why

RecruitLane necesita una definición verificable de su primer MVP para que el desarrollo posterior mantenga un alcance coherente: una herramienta individual para que cada recruiter gestione candidatos, vacantes, pipelines y postulaciones sin colaboración ni entidades organizacionales. Formalizar estas reglas ahora evita que decisiones de interfaz, arquitectura o persistencia introduzcan comportamientos fuera del producto acordado.

## What Changes

- Define la autenticación básica de Recruiters: registro, inicio y cierre de sesión, con correo globalmente único y contraseñas que nunca se almacenan en texto plano.
- Define la gestión aislada por propietario de candidatos, incluidos sus campos mínimos y la unicidad de correo dentro de los candidatos de cada recruiter.
- Define el pipeline predeterminado inmutable que recibe cada recruiter, la creación de pipelines personalizados y sus restricciones de edición, asociación, inmutabilidad y eliminación lógica.
- Define vacantes con un único pipeline, los estados permitidos y las transiciones de su ciclo de vida.
- Define las postulaciones como la relación entre candidato y vacante: creación, etapa inicial, movimientos entre etapas, unicidad activa y eliminación lógica.
- Establece el aislamiento de propiedad como regla funcional transversal y excluye explícitamente colaboración, organizaciones, automatizaciones, integraciones y otras capacidades fuera del MVP.
- Documenta en `design.md` las decisiones técnicas de implementación aprobadas, sin alterar el alcance funcional del change.

## Capabilities

### New Capabilities

- `authentication`: registro, inicio y cierre de sesión del único actor funcional, Recruiter.
- `candidate-management`: gestión de candidatos propios y sus reglas de campos, unicidad y aislamiento.
- `pipeline-management`: pipelines predeterminado y personalizados, con etapas ordenadas y reglas de inmutabilidad y eliminación.
- `vacancy-management`: vacantes propias, su pipeline fijo y ciclo de vida de estados.
- `application-management`: postulaciones entre candidatos y vacantes, sus etapas y reglas de ciclo de vida.
- `resource-ownership`: aislamiento transversal de todos los recursos pertenecientes a cada Recruiter.

### Modified Capabilities

- Ninguna; el repositorio no contiene capacidades OpenSpec existentes.

## Impact

No se modifica código, API, dependencias ni infraestructura. El change incorpora requisitos de producto y documenta en `design.md` las decisiones aprobadas de tecnología, contratos de transporte, modelo físico de datos y configuración de seguridad.
