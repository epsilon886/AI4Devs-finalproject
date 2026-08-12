## Context

El repositorio todavía no tiene código de aplicación, stack ni especificaciones previas. Este cambio define un MVP nuevo y transversal para una aplicación individual de Recruiters; la motivación y el alcance funcional están en `proposal.md`, y los contratos observables están en los seis delta specs.

El solicitante excluyó expresamente la selección de framework, base de datos, esquema físico, infraestructura, endpoints, OpenAPI, librerías de autenticación y los detalles concretos de JWT, cookies y hashing. Por lo tanto, este diseño fija únicamente límites que preservan los requisitos durante una implementación posterior.

## Goals / Non-Goals

**Goals:**

- Mantener los recursos del MVP y sus asociaciones bajo un único propietario, el Recruiter autenticado.
- Hacer que las reglas de ciclo de vida (estado de vacante, inmutabilidad de pipelines y unicidad de postulaciones activas) se apliquen de forma consistente en cualquier interfaz futura.
- Separar las garantías funcionales de los mecanismos técnicos que se decidirán cuando exista una arquitectura aprobada.

**Non-Goals:**

- Diseñar el stack, las capas, el esquema de persistencia, los endpoints o la experiencia de interfaz.
- Resolver los parámetros concretos de autenticación o de borrado lógico.
- Añadir organizaciones, colaboración, historial de etapas, automatizaciones o integraciones.

## Decisions

### Las reglas de propiedad son invariantes transversales

Todas las operaciones que leen, crean, actualizan, asocian, mueven o eliminan recursos deben comprobar que los recursos involucrados pertenecen al Recruiter autenticado. Esta decisión materializa `resource-ownership` como una regla del producto y evita que se trate como un detalle opcional de cada pantalla o endpoint futuro.

Alternativa considerada: aplicar la propiedad solo al listar recursos. Se descarta porque no protege asociaciones directas por identificador ni movimientos de postulaciones.

### Pipeline y vacante preservan una asociación histórica estable

La asignación de pipeline se fija al crear la vacante; al quedar un pipeline personalizado asociado por primera vez, queda inmutable permanentemente. Esto preserva el significado de las etapas de las postulaciones, sin decidir cómo se representará o persistirá esa relación.

Alternativa considerada: permitir modificar pipelines asociados y propagar los cambios. Se descarta porque contradice la inmutabilidad funcional requerida y podría dejar etapas de postulaciones sin significado.

### La eliminación lógica es una garantía de comportamiento, no de almacenamiento

La eliminación de pipelines personalizados permitidos y de Applications debe hacer que el recurso se considere ausente de los flujos normales: no se lista, consulta, usa ni selecciona normalmente, y no existe papelera ni recuperación. Para las Applications, además, debe liberar la combinación Candidate + Vacancy para una nueva Application activa. El mecanismo para distinguir registros activos de eliminados se decidirá con el modelo de datos.

Alternativa considerada: definir ahora columnas, índices o borrado físico. Se descarta porque este cambio no autoriza un esquema físico de base de datos.

### La seguridad de autenticación se especifica por resultados mínimos

El sistema debe impedir contraseñas en texto plano y ofrecer registro, inicio y cierre de sesión. La dirección prevista de JWT en cookie HttpOnly se mantiene como intención, pero ninguna decisión de token, cookie, hash o librería se toma en este cambio.

Alternativa considerada: fijar la arquitectura de autenticación antes de los requisitos funcionales. Se descarta por estar expresamente fuera de alcance.

## Risks / Trade-offs

- [La decisión diferida de autenticación puede impedir empezar la implementación de sesiones] → Antes de implementar autenticación, crear o aprobar una decisión arquitectónica separada que concrete el mecanismo sin alterar los requisitos de esta propuesta.
- [Reglas de propiedad aplicadas de forma desigual pueden producir accesos entre Recruiters] → Tratar cada operación y cada asociación de recursos como sujeta a la misma comprobación de propietario.
- [La unicidad activa y el borrado lógico pueden implementarse de forma incompatible] → Validar, al definir persistencia, que una Application eliminada no bloquee una creación activa posterior para el mismo par.
- [La implementación de la eliminación lógica puede permitir la recuperación o el uso accidental de recursos eliminados] → Verificar que los flujos normales excluyan los recursos eliminados y que no se expongan funciones de papelera o restauración.

## Migration Plan

No existe una versión anterior del producto ni datos que migrar. Antes de una primera entrega, la implementación deberá incluir una forma de crear el pipeline predeterminado para cada Recruiter registrado y de preservar las reglas de propiedad. No se define estrategia de despliegue o reversión hasta que se aprueben arquitectura e infraestructura.

## Open Questions

- La normalización y validación sintáctica de correos (por ejemplo, sensibilidad a mayúsculas o espacios) no está definida; la regla funcional actual solo exige unicidad en los ámbitos indicados.
