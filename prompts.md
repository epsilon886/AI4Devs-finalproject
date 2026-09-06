> Detalla en esta sección los prompts principales utilizados durante la creación del proyecto, que justifiquen el uso de asistentes de código en todas las fases del ciclo de vida del desarrollo. Esperamos un máximo de 3 por sección, principalmente los de creación inicial o  los de corrección o adición de funcionalidades que consideres más relevantes.
Puedes añadir adicionalmente la conversación completa como link o archivo adjunto si así lo consideras

**Nota sobre los prompts documentados:** Los prompts incluidos en este archivo son versiones representativas y condensadas de las interacciones utilizadas durante el desarrollo del proyecto. Conservan el objetivo, el contexto y las decisiones relevantes de cada tarea, pero omiten instrucciones operativas repetitivas o auxiliares que no aportan información significativa sobre el proceso.

Entre los elementos omitidos se encuentran, por ejemplo, indicaciones como Respeta AGENTS.md, asignaciones de rol del tipo “actúa como…”, restricciones concretas sobre qué archivos podían revisarse o modificarse, formatos específicos exigidos para la respuesta y validaciones operativas propias de cada ejecución.

La redacción final de los prompts fue además refinada con ayuda de asistentes de IA para mejorar su claridad, precisión y concisión, manteniendo la intención y el contexto del trabajo realizado.

## Índice

1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)

---

## 1. Descripción general del producto

**Prompt 1:**

Quiero definir un MVP web orientado a recruiters que les permita organizar y seguir sus procesos de selección sin depender de hojas de cálculo o información dispersa.

Ayúdame a convertir esta idea en una definición de producto clara. Identifica el problema principal, el actor del sistema, las funcionalidades mínimas necesarias y los principales flujos que debería cubrir el MVP.

Prioriza un producto pequeño pero suficientemente completo para gestionar candidatos, vacantes y su avance por un proceso de selección. Evita entrar todavía en arquitectura, tecnologías o detalles de implementación.

**Prompt 2:**

Revisa el alcance propuesto para RecruitLane y ayúdame a reducirlo a una V1 realista.

Separa qué funcionalidades son imprescindibles para completar el flujo principal de un Recruiter y cuáles deberían quedar explícitamente fuera del MVP. Quiero mantener cuentas individuales con recursos aislados por usuario, gestión de Candidates, Pipelines y sus etapas, Vacancies y Applications.

Evita incorporar organizaciones, equipos, colaboración, roles configurables, automatizaciones, integraciones o funcionalidades avanzadas de ATS si no son necesarias para demostrar el flujo principal.

Señala también cualquier ambigüedad funcional que todavía necesitemos resolver antes de pasar al diseño técnico.

**Prompt 3:**

Haz una revisión final de la definición funcional de RecruitLane antes de comenzar el diseño técnico.

Comprueba que el alcance sea coherente de extremo a extremo: registro y acceso del Recruiter, gestión de Candidates, definición de Pipelines y PipelineStages, creación y ciclo de vida de Vacancies, creación de Applications y movimiento de candidatos entre etapas.

Verifica especialmente que las reglas de propiedad de los recursos sean consistentes, que las relaciones entre estas capacidades no introduzcan contradicciones y que no hayan quedado funcionalidades fuera de alcance que sean necesarias para completar el flujo principal.

No propongas arquitectura ni nuevas funcionalidades. Devuelve únicamente los problemas o decisiones funcionales que todavía deberían resolverse y, si el alcance ya es consistente, una definición consolidada del MVP.

---

## 2. Arquitectura del Sistema

### **2.1. Diagrama de arquitectura:**

**Prompt 1:**

A partir del alcance funcional definido para RecruitLane, propón una arquitectura adecuada para un MVP individual de gestión de procesos de selección.

Prioriza simplicidad de desarrollo, despliegue y mantenimiento, manteniendo una separación clara entre interfaz, lógica de negocio y persistencia. Evalúa qué componentes principales necesita el sistema y cómo deberían comunicarse entre sí.

Evita introducir microservicios, mensajería, CQRS u otros patrones distribuidos salvo que exista una necesidad concreta que los justifique.

El resultado debe permitir representar la arquitectura en un diagrama de alto nivel y explicar brevemente por qué la propuesta es adecuada para esta V1 y qué trade-offs asume.

**Prompt 2:**

**Prompt 3:**

### **2.2. Descripción de componentes principales:**

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

**Prompt 1:**

Partiendo de la arquitectura definida para RecruitLane, propón una estructura de repositorio sencilla y adecuada para implementar el MVP en un único proyecto.

La solución debe permitir separar claramente frontend y backend, mantener los artefactos de especificación y documentación del proyecto, y facilitar el desarrollo conjunto de ambas aplicaciones sin introducir paquetes compartidos o abstracciones que todavía no sean necesarias.

Define la organización de alto nivel del repositorio, la estrategia de workspace y las responsabilidades principales de cada área. Para el backend, plantea una organización modular alineada con los dominios funcionales del MVP, evitando capas, repositorios, casos de uso o patrones adicionales si no aportan una necesidad concreta.

No definas todavía scripts, configuración exacta de Docker, CI/CD ni detalles internos de carpetas que dependan de la implementación.

**Prompt 2:**

**Prompt 3:**

### **2.4. Infraestructura y despliegue**

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

### **2.5. Seguridad**

**Prompt 1:**

Define una estrategia de seguridad proporcional al MVP de RecruitLane para proteger autenticación, sesión, credenciales y acceso a los recursos de cada Recruiter.

Analiza cómo almacenar las contraseñas de forma segura, cómo mantener la sesión del usuario y qué información debería contener la identidad autenticada. Ten en cuenta que la aplicación será una SPA y que frontend y API funcionarán conceptualmente bajo el mismo origen.

Propón también cómo proteger las operaciones mutantes frente a solicitudes no autorizadas, cómo evitar que un Recruiter pueda acceder a recursos de otro y qué medidas básicas aplicar sobre registro e inicio de sesión para reducir abuso.

Explica los principales riesgos y trade-offs de la estrategia propuesta sin fijar parámetros criptográficos o secretos concretos que deban decidirse durante la implementación.

**Prompt 2:**

**Prompt 3:**

### **2.6. Tests**

**Prompt 1:**

Define una estrategia de testing proporcional al MVP de RecruitLane y compatible con un enfoque de TDD pragmático.

Quiero distinguir con claridad qué comportamientos deberían cubrirse mediante tests unitarios de backend, tests de integración con persistencia real, tests de API, tests de componentes frontend y flujos E2E, evitando duplicar las mismas garantías en varias capas.

Propón también qué herramientas encajan mejor con el stack previsto y qué tipo de riesgos o reglas debería validar cada nivel: reglas de negocio, autenticación y ownership, contratos HTTP, restricciones de PostgreSQL, comportamiento del frontend y flujos principales del usuario.

Prioriza tests con valor funcional o de regresión real. No uses el porcentaje de cobertura como objetivo ni propongas tests para detalles internos de librerías o comportamientos presentacionales triviales.

**Prompt 2:**

**Prompt 3:**

---

### 3. Modelo de Datos

**Prompt 1:**

A partir del alcance funcional de RecruitLane, define un modelo de dominio relacional para el MVP.

Identifica las entidades necesarias, sus responsabilidades, atributos principales y relaciones con sus cardinalidades. Ten en cuenta que cada Recruiter debe gestionar únicamente sus propios recursos y que el sistema necesita representar candidatos, pipelines con etapas, vacantes y la participación de un candidato en una vacante.

Analiza especialmente dónde debe vivir el ownership de cada recurso y evita introducir entidades adicionales si no son necesarias para cubrir el alcance definido.

El resultado debe ser suficientemente claro para representar posteriormente el modelo mediante un diagrama entidad-relación.

**Prompt 2:**

Convierte el modelo de dominio aprobado de RecruitLane en un diseño de persistencia para Prisma y PostgreSQL.

Define los campos necesarios de cada entidad, claves primarias y foráneas, tipos principales, nulabilidad, convenciones de nombres y restricciones de unicidad. Mantén la separación entre nombres de modelos y campos utilizados por Prisma y los nombres físicos de tablas y columnas en PostgreSQL.

Evita incorporar campos derivados, relaciones o índices que no estén respaldados por reglas reales del dominio.

**Prompt 3:**

Revisa el modelo físico de RecruitLane poniendo el foco en integridad y consistencia de datos.

Identifica qué invariantes pueden protegerse directamente mediante claves foráneas, restricciones únicas o índices de PostgreSQL y cuáles deberán comprobarse mediante lógica de aplicación.

Presta especial atención a la unicidad de recursos activos cuando exista borrado lógico, a la relación entre Candidate y Vacancy mediante Application, a la pertenencia de PipelineStages a su Pipeline y a evitar eliminaciones en cascada que puedan destruir información relacionada.

Propón únicamente los índices y restricciones necesarios para garantizar reglas actuales del MVP o consultas claramente previstas. Evita optimizaciones especulativas y señala qué operaciones deberían ejecutarse de forma atómica cuando afecten a varias entidades.

---

### 4. Especificación de la API

**Prompt 1:**

A partir de las capacidades y reglas funcionales ya definidas para RecruitLane, diseña una API REST/JSON que permita cubrir el MVP completo.

Organiza la superficie HTTP por los dominios principales de autenticación, Candidates, Pipelines, Vacancies y Applications. Define qué operaciones necesita cada recurso, qué datos deben recibirse y devolverse y qué acciones conviene representar mediante creación, consulta, actualización o eliminación lógica.

Mantén el contrato simple y consistente, evita endpoints que no estén justificados por los flujos del MVP y respeta las reglas de ownership, ciclos de vida e inmutabilidad ya definidas.

El objetivo es obtener una superficie HTTP suficientemente estable como para poder expresarla después mediante OpenAPI.

**Prompt 2:**

Define las reglas transversales del contrato HTTP de RecruitLane para que todas las operaciones de la API sigan criterios consistentes.

Establece una estrategia común para autenticación, protección de requests mutantes, validación de body, path y query parameters, paginación, formatos públicos, códigos HTTP y representación de errores.

Distingue claramente entre errores de validación, autenticación, autorización de la solicitud, recursos inexistentes o no visibles y conflictos de dominio. Evita exponer información interna del backend o diferencias que permitan descubrir recursos pertenecientes a otros Recruiters.

Busca un contrato pequeño, predecible y sencillo de consumir desde el frontend, sin introducir complejidad que no sea necesaria para el MVP.

**Prompt 3:**

Audita el contrato OpenAPI de RecruitLane contra las especificaciones funcionales y el diseño técnico vigentes antes de considerarlo cerrado.

Revisa todos los endpoints, schemas, parámetros, respuestas y reglas compartidas buscando inconsistencias de nombres, estados HTTP, campos opcionales, semántica de PATCH, ownership, soft delete, ciclos de vida y comportamiento de autenticación.

Comprueba especialmente que el contrato observable no contradiga las reglas de Candidates, Pipelines, Vacancies y Applications, y que las decisiones transversales de validación, seguridad y errores se apliquen de forma uniforme.

No añadas nuevas funcionalidades durante la revisión. Separa los problemas que requieran corregir OpenAPI de aquellos que revelen una ambigüedad o contradicción previa en las especificaciones o en el diseño.

---

### 5. Historias de Usuario

**Prompt 1:**

A partir del alcance funcional definido para RecruitLane, selecciona tres historias de usuario mas representativas, que representen algunos de los flujos principales del MVP.

Redáctalas desde la perspectiva del Recruiter utilizando el formato “Como…, quiero…, para…”, y acompaña cada una con criterios de aceptación concretos y verificables en formato Given/When/Then.

Prioriza historias que cubran capacidades significativas y diferentes del producto, evitando convertirlas en tareas técnicas o describir detalles de implementación, endpoints o base de datos.

Los criterios deben reflejar tanto el comportamiento esperado como las principales reglas de negocio y restricciones necesarias para considerar completa cada historia.

**Prompt 2:**

Revisa las tres historias de usuario seleccionadas para RecruitLane y contrástalas con las especificaciones funcionales y el contrato API vigentes.

Comprueba que los criterios de aceptación sigan reflejando correctamente las reglas actuales de autenticación, ownership, Pipelines, Vacancies y Applications, y detecta cualquier criterio ambiguo, desactualizado o excesivamente acoplado a detalles técnicos.

Corrige únicamente las inconsistencias necesarias, manteniendo las historias centradas en comportamiento de producto. Utiliza terminología funcional cuando un nombre de campo o una convención de persistencia no sea relevante para el usuario.

No añadas nuevas historias ni amplíes el alcance del MVP durante la revisión.

**Prompt 3:**

---

### 6. Tickets de Trabajo

**Prompt 1:**

Analiza el backlog y las especificaciones vigentes de RecruitLane para seleccionar tres tickets representativos del proyecto: uno de backend, uno de frontend y uno de base de datos.

Para cada categoría, propone como máximo dos candidatos con un alcance suficientemente acotado para poder desarrollarse de inicio a fin. Compara su relevancia, dependencias, nivel de definición y posibles decisiones abiertas antes de recomendar uno por categoría.

Prioriza tickets respaldados por tareas y requisitos ya definidos, evita mezclar capas innecesariamente y descarta aquellos que dependan de decisiones técnicas o de UX todavía abiertas si existe una alternativa mejor definida.

No redactes todavía los tickets finales; el objetivo es elegir los tres candidatos más adecuados.

**Prompt 2:**

A partir de los tres tickets seleccionados para RecruitLane, redacta cada uno con el detalle necesario para poder implementarlo de inicio a fin sin convertirlo en una especificación extensa.

Para cada ticket incluye únicamente:

 - título y tipo;
 - objetivo;
 - alcance;
 - criterios de aceptación verificables;
 - dependencias.

Mantén cada ticket limitado a su capa correspondiente y deriva sus reglas de las especificaciones y decisiones técnicas vigentes. No introduzcas funcionalidades nuevas, decisiones todavía abiertas ni trabajo adicional fuera del alcance elegido.

Los tres tickets deben ser suficientemente concretos para orientar su futura implementación y, al mismo tiempo, mantenerse breves y fáciles de revisar.

**Prompt 3:**

---

### 7. Pull Requests

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**
