## 1. Prerrequisitos de implementación

- [ ] 1.1 Obtener una decisión de arquitectura aprobada que concrete el stack y el mecanismo seguro de autenticación sin alterar los requisitos de este cambio.
- [ ] 1.2 Acordar la normalización y validación de correos antes de codificar esas decisiones.
- [ ] 1.3 Preparar la estructura de la aplicación y la persistencia elegidas en la decisión de arquitectura aprobada.

## 2. Identidad y aislamiento

- [ ] 2.1 Implementar el registro de Recruiters con correo globalmente único y sin almacenar contraseñas en texto plano.
- [ ] 2.2 Implementar el inicio y cierre de sesión de Recruiters con el mecanismo de autenticación aprobado.
- [ ] 2.3 Aplicar la comprobación transversal de propiedad del Recruiter autenticado a cada operación sobre candidatos, pipelines, vacantes y postulaciones.
- [ ] 2.4 Verificar que ningún flujo permita combinar recursos de Recruiters distintos.

## 3. Candidatos y pipelines

- [ ] 3.1 Implementar la creación, consulta y actualización de candidatos propios con sus cuatro campos permitidos y unicidad de correo por Recruiter.
- [ ] 3.2 Omitir explícitamente la eliminación de candidatos y los atributos de candidato fuera de alcance.
- [ ] 3.3 Crear automáticamente el pipeline predeterminado con las seis etapas y hacerlo no editable ni eliminable.
- [ ] 3.4 Implementar pipelines personalizados con nombre, de 3 a 10 etapas ordenadas y nombres de etapa no duplicados.
- [ ] 3.5 Aplicar las reglas de edición, asociación histórica, inmutabilidad y eliminación lógica de pipelines personalizados, excluyéndolos de los flujos normales tras su eliminación y sin recuperación.

## 4. Vacantes y postulaciones

- [ ] 4.1 Implementar vacantes propias con los campos requeridos, estado inicial automático `DRAFT`, un único pipeline propio inmutable y sin entidades de compañía u organización.
- [ ] 4.2 Implementar los estados `DRAFT`, `OPEN`, `FILLED` y `CANCELLED` y solo las transiciones permitidas.
- [ ] 4.3 Restringir la creación, el movimiento de etapas y la eliminación de Applications a vacantes `OPEN`, manteniendo las Applications de las demás vacantes solo consultables.
- [ ] 4.4 Implementar la creación de Applications para candidato y vacante propios, asignando la primera etapa del pipeline de la vacante.
- [ ] 4.5 Aplicar la unicidad de Application activa por Candidate + Vacancy y la eliminación lógica en vacantes `OPEN`, excluyéndola de los flujos normales, sin recuperación y habilitando una nueva Application activa posterior.
- [ ] 4.6 Implementar movimientos libres de Applications solo hacia etapas del pipeline de su propia Vacancy, sin reglas de adyacencia ni terminalidad.

## 5. Validación del comportamiento

- [ ] 5.1 Añadir pruebas de autenticación, unicidad de correos y aislamiento entre Recruiters.
- [ ] 5.2 Añadir pruebas de validación e inmutabilidad de pipelines, incluida la eliminación lógica permitida y rechazada, su ausencia de flujos normales y la falta de recuperación.
- [ ] 5.3 Añadir pruebas del estado inicial `DRAFT`, del ciclo de vida de vacantes y de sus restricciones para crear, mover y eliminar Applications.
- [ ] 5.4 Añadir pruebas de creación, unicidad activa, eliminación lógica en vacantes `OPEN`, ausencia de flujos normales y movimientos de Applications.
- [ ] 5.5 Ejecutar la suite de validación definida por el stack aprobado y comprobar que no se incorporaron capacidades excluidas del MVP.
