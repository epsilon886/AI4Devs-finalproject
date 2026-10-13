## 1. Prerrequisitos de implementación

- [x] 1.1 Decisión de arquitectura aprobada y documentada en `design.md`.
- [x] 1.2 Implementar la normalización y validación de correos aprobadas, incluida la unicidad de Candidate sobre el valor normalizado.
- [x] 1.3 Preparar la estructura de la aplicación y la persistencia elegidas en la decisión de arquitectura aprobada.

## 2. Identidad y aislamiento

- [x] 2.1 Implementar el registro de Recruiters con correo globalmente único y sin almacenar contraseñas en texto plano.
- [x] 2.2 Implementar el inicio y cierre de sesión de Recruiters con el mecanismo de autenticación aprobado, CSRF/Origin y rate limiting.
- [x] 2.3 Aplicar la comprobación transversal de propiedad del Recruiter autenticado a cada operación sobre candidatos, pipelines, vacantes y postulaciones.
- [x] 2.4 Verificar que ningún flujo permita combinar recursos de Recruiters distintos.

## 3. Candidatos y pipelines

- [x] 3.1 Implementar la creación, consulta y actualización de candidatos propios con sus cuatro campos permitidos, `phone` nullable en la representación pública y unicidad de correo normalizado por Recruiter.
- [x] 3.2 Omitir explícitamente la eliminación de candidatos y los atributos de candidato fuera de alcance.
- [x] 3.3 Crear automáticamente el pipeline predeterminado `Default` con las seis etapas y hacerlo no editable ni eliminable.
- [x] 3.4 Implementar pipelines personalizados con nombre único entre activos por Recruiter, de 3 a 10 etapas con posiciones completas y nombres normalizados no duplicados.
- [x] 3.5 Aplicar las reglas de edición, sincronización atómica de stages, asociación histórica, inmutabilidad y eliminación lógica de pipelines personalizados, excluyéndolos de los flujos normales tras su eliminación y sin recuperación.

## 4. Vacantes y postulaciones

- [x] 4.1 Implementar vacantes propias con los campos requeridos, estado inicial automático `DRAFT`, un único pipeline propio inmutable y sin entidades de compañía u organización.
- [x] 4.2 Implementar los estados `DRAFT`, `OPEN`, `FILLED` y `CANCELLED`, las transiciones permitidas y el no-op de estado idéntico.
- [x] 4.3 Restringir la creación, el movimiento de etapas y la eliminación de Applications a vacantes `OPEN`, manteniendo las Applications de las demás vacantes solo consultables.
- [x] 4.4 Implementar la creación de Applications para candidato y vacante propios, asignando la primera etapa del pipeline de la vacante.
- [x] 4.5 Aplicar la unicidad de Application activa por Candidate + Vacancy y la eliminación lógica en vacantes `OPEN`, excluyéndola de los flujos normales, sin recuperación y habilitando una nueva Application activa posterior.
- [x] 4.6 Implementar movimientos libres de Applications solo hacia etapas del pipeline de su propia Vacancy, incluido el no-op hacia la etapa actual, sin reglas de adyacencia ni terminalidad.

## 5. Validación del comportamiento

- [x] 5.1 Añadir pruebas de autenticación, CSRF/Origin, rate limiting, unicidad de correos y aislamiento entre Recruiters.
- [x] 5.2 Añadir pruebas de validación, unicidad, posiciones y sincronización atómica de pipelines, incluida la eliminación lógica permitida y rechazada, su ausencia de flujos normales y la falta de recuperación.
- [x] 5.3 Añadir pruebas del estado inicial `DRAFT`, del ciclo de vida de vacantes, incluido el no-op de estado idéntico, y de sus restricciones para crear, mover y eliminar Applications.
- [x] 5.4 Añadir pruebas de creación, unicidad activa, eliminación lógica en vacantes `OPEN`, ausencia de flujos normales y movimientos de Applications, incluido el no-op hacia la etapa actual.
- [ ] 5.5 Ejecutar la suite de validación definida por el stack aprobado y comprobar que no se incorporaron capacidades excluidas del MVP.

## 6. Foundation y tooling frontend

- [x] 6.1 Incorporar el tooling frontend aprobado (Tailwind CSS, TanStack Router, TanStack Query, React Hook Form, Vitest, React Testing Library y Playwright) y la fuente Open Sans, sin librería de componentes.
- [x] 6.2 Implementar el cliente HTTP relativo `/api`, credenciales, cabecera CSRF, normalización de errores y manejo transversal de `401`.
- [x] 6.3 Implementar el shell responsive, estilos visuales, componentes transversales de carga, toast, modal, paginación, estados vacíos y 404, con los requisitos de accesibilidad aprobados.

## 7. Sesión y autenticación frontend

- [x] 7.1 Implementar la resolución inicial de `/auth/me`, guards/redirecciones de rutas públicas y autenticadas, conservación de ruta directa válida y logout.
- [x] 7.2 Implementar las pantallas y validaciones de Login y Register, incluidos feedback de éxito, errores genéricos/rate limit y control de visibilidad de contraseña.

## 8. Candidates frontend

- [x] 8.1 Implementar el listado paginado en cards, estados vacíos y el modal compartido de creación/edición de Candidates, incluida la normalización de `phone` vacío a `null`.
- [x] 8.2 Implementar `Add to vacancy` desde Candidate con combobox de Vacancies OPEN, búsqueda local y carga lazy paginada de opciones.

## 9. Pipelines frontend

- [ ] 9.1 Implementar el listado paginado de Pipelines, expansión compacta de stages, acciones condicionadas por editabilidad, Copy y confirmación de Delete.
- [ ] 9.2 Implementar la página compartida de creación/edición con las diez posiciones, prefijo continuo de stages, conservación interna de IDs y feedback de validación aprobado.

## 10. Vacancies frontend

- [ ] 10.1 Implementar el listado paginado de Vacancies, chips de filtro de estado, acciones explícitas, badges, empty state y modales compartidos Create/Edit con selección y preview de Pipeline.
- [ ] 10.2 Implementar el detalle de Vacancy, sus acciones por ciclo de vida, modales de transición y actualización de cache sin recarga completa.

## 11. Applications integradas en Vacancy

- [ ] 11.1 Implementar el Kanban paginado y acumulativo en el detalle de Vacancy, con lectura condicionada por estado, scroll horizontal y conteos por stage.
- [ ] 11.2 Implementar Add, Move y Remove de Applications, sus modales/comboboxes con carga lazy, manejo de duplicados y actualización de TanStack Query sin reload completo.

## 12. Pruebas frontend e integración

- [ ] 12.1 Añadir pruebas de componentes para los flujos, validaciones, estados de error y restricciones de interacción frontend significativos.
- [ ] 12.2 Añadir pruebas E2E representativas de autenticación, Candidates, Pipelines y el ciclo Vacancy/Applications antes de ejecutar 5.5.
