## Índice

0. [Ficha del proyecto](#0-ficha-del-proyecto)
1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)

---

## 0. Ficha del proyecto

### **0.1. Tu nombre completo:**

### **0.2. Nombre del proyecto:**

### **0.3. Descripción breve del proyecto:**

### **0.4. URL del proyecto:**

> Puede ser pública o privada, en cuyo caso deberás compartir los accesos de manera segura. Puedes enviarlos a [alvaro@lidr.co](mailto:alvaro@lidr.co) usando algún servicio como [onetimesecret](https://onetimesecret.com/).

### 0.5. URL o archivo comprimido del repositorio

> Puedes tenerlo alojado en público o en privado, en cuyo caso deberás compartir los accesos de manera segura. Puedes enviarlos a [alvaro@lidr.co](mailto:alvaro@lidr.co) usando algún servicio como [onetimesecret](https://onetimesecret.com/). También puedes compartir por correo un archivo zip con el contenido


---

## 1. Descripción general del producto

> Describe en detalle los siguientes aspectos del producto:

### **1.1. Objetivo:**

> Propósito del producto. Qué valor aporta, qué soluciona, y para quién.

### **1.2. Características y funcionalidades principales:**

> Enumera y describe las características y funcionalidades específicas que tiene el producto para satisfacer las necesidades identificadas.

### **1.3. Diseño y experiencia de usuario:**

> Proporciona imágenes y/o videotutorial mostrando la experiencia del usuario desde que aterriza en la aplicación, pasando por todas las funcionalidades principales.

### **1.4. Instrucciones de instalación:**
> Documenta de manera precisa las instrucciones para instalar y poner en marcha el proyecto en local (librerías, backend, frontend, servidor, base de datos, migraciones y semillas de datos, etc.)

---

## 2. Arquitectura del Sistema

### **2.1. Diagrama de arquitectura:**

```mermaid
flowchart LR
    Browser[Navegador] --> Frontend[React SPA]
    Frontend -->|REST/JSON · /api| Backend[NestJS\nAPI]
    Backend --> Prisma[Prisma]
    Prisma --> Database[(PostgreSQL)]
```

La arquitectura V1 aprobada es un monolito modular: una SPA de React y una única aplicación NestJS organizada por módulos de dominio, sin microservicios ni comunicación distribuida. Es adecuada para el MVP porque mantiene límites claros entre responsabilidades sin añadir complejidad operativa o contratos innecesarios.

Sus beneficios principales son un desarrollo y despliegue más simples, una persistencia centralizada y una evolución gradual del producto. El trade-off frente a una arquitectura distribuida es que los componentes no se despliegan ni escalan de forma independiente; para el alcance actual, esa independencia no justifica su coste adicional.


### **2.2. Descripción de componentes principales:**

| Componente | Tecnologías principales | Responsabilidad |
| --- | --- | --- |
| Frontend | React, TypeScript y Vite | SPA que presenta la interfaz y consume la API mediante rutas relativas `/api`. |
| API/backend | NestJS y REST/JSON | Aplicación modular que concentra las reglas de negocio y expone la API. |
| Persistencia | Prisma y PostgreSQL | Acceso a datos y almacenamiento relacional del MVP. |
| Workflow de desarrollo | Docker | Flujo oficial para ejecutar de forma coordinada frontend, backend, PostgreSQL y migraciones. |

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

Actualmente el repositorio contiene los artefactos de documentación y OpenSpec, pero todavía no incluye una aplicación implementada ni los directorios `front/` y `back/`. Para la implementación V1, la estructura aprobada será un `pnpm workspace` con esta organización de alto nivel:

```text
front/    # SPA de React
back/     # API REST modular de NestJS y acceso Prisma
openspec/ # especificaciones y decisiones aprobadas
```

La organización prevista separa frontend y backend dentro de un único repositorio; el backend conserva el enfoque de monolito modular.

### **2.4. Infraestructura y despliegue**

Docker es el workflow oficial de desarrollo de V1. La composición prevista coordinará los componentes de frontend, backend y PostgreSQL, junto con una tarea de migraciones de ejecución única. La configuración concreta de Docker todavía no está definida.

El despliegue conceptual será de mismo origen: la SPA se servirá en la raíz HTTPS del host y las solicitudes a `/api` se enrutarán a NestJS. PostgreSQL permanecerá privado y no se expondrá públicamente. El proveedor de despliegue y el mecanismo concreto de proxy siguen pendientes de definición.

### **2.5. Seguridad**

> Enumera y describe las prácticas de seguridad principales que se han implementado en el proyecto, añadiendo ejemplos si procede

### **2.6. Tests**

> Describe brevemente algunos de los tests realizados

---

## 3. Modelo de Datos

### **3.1. Diagrama del modelo de datos:**

El siguiente diagrama describe el modelo lógico aprobado. Los tipos mostrados son únicamente documentales; no definen un esquema físico ni una tecnología de persistencia.

```mermaid
erDiagram
    User ||--o{ Candidate : owns
    User ||--o{ Pipeline : owns
    User ||--o{ Vacancy : owns

    Pipeline ||--|{ PipelineStage : contains
    Pipeline ||--o{ Vacancy : used_by

    Candidate ||--o{ Application : has
    Vacancy ||--o{ Application : receives
    PipelineStage ||--o{ Application : current_stage

    User {
        uuid id PK
        string first_name
        string last_name
        string email
        string password_hash
        datetime created_at
        datetime updated_at
    }

    Candidate {
        uuid id PK
        uuid user_id FK
        string first_name
        string last_name
        string email
        string phone
        datetime created_at
        datetime updated_at
    }

    Pipeline {
        uuid id PK
        uuid user_id FK
        string name
        boolean is_default
        datetime deleted_at
        datetime created_at
        datetime updated_at
    }

    PipelineStage {
        uuid id PK
        uuid pipeline_id FK
        string name
        integer position
        datetime created_at
        datetime updated_at
    }

    Vacancy {
        uuid id PK
        uuid user_id FK
        uuid pipeline_id FK
        string title
        string company_name
        string description
        string status
        datetime created_at
        datetime updated_at
    }

    Application {
        uuid id PK
        uuid vacancy_id FK
        uuid candidate_id FK
        uuid current_stage_id FK
        datetime deleted_at
        datetime created_at
        datetime updated_at
    }
```


### **3.2. Descripción de entidades principales:**

- **`User`**: representa la cuenta autenticada del Recruiter y funciona como propietario de candidatos, pipelines y vacantes, garantizando el aislamiento de recursos entre usuarios.

- **`Candidate`**: representa una persona candidata gestionada por un Recruiter. Puede participar en múltiples procesos de selección mediante distintas `Application`.

- **`Pipeline`**: define la estructura reutilizable de un proceso de selección. Pertenece a un Recruiter y está compuesto por etapas ordenadas; puede ser el pipeline predeterminado o uno personalizado.

- **`PipelineStage`**: representa una etapa ordenada dentro de un `Pipeline`, como Applied, Screening o Interview. Las `Application` utilizan una de estas etapas como posición actual dentro del proceso.

- **`Vacancy`**: representa una vacante gestionada por un Recruiter. Está asociada permanentemente a un único `Pipeline` y posee un ciclo de vida propio mediante los estados `DRAFT`, `OPEN`, `FILLED` y `CANCELLED`.

- **`Application`**: representa la participación de un `Candidate` en una `Vacancy`. Resuelve la relación N:N entre ambos y mantiene únicamente la etapa actual del candidato dentro del pipeline de esa vacante.

Las relaciones son: User 1:N Candidate, Pipeline y Vacancy; Pipeline 1:N PipelineStage y Vacancy; Candidate 1:N Application; Vacancy 1:N Application; y PipelineStage 1:N Application. La propiedad de Application se deriva de sus relaciones con Candidate y Vacancy, por lo que no tiene `user_id`.

**Restricciones e invariantes lógicos:**

- `User.email` es único globalmente.
- `Candidate.email` es único dentro de su User propietario: `(user_id, email)`.
- Cada User tiene exactamente un Pipeline predeterminado.
- El Pipeline predeterminado nunca puede editarse ni eliminarse.
- Un Pipeline personalizado contiene entre 3 y 10 PipelineStages ordenadas.
- Los nombres y las posiciones de PipelineStage son únicos dentro de su Pipeline: `(pipeline_id, name)` y `(pipeline_id, position)`.
- Cada Vacancy usa exactamente un Pipeline perteneciente al mismo User, y `Vacancy.pipeline_id` es inmutable tras crear la Vacancy.
- Un Pipeline personalizado solo puede editarse y eliminarse lógicamente antes de su primera asociación con una Vacancy; a partir de entonces es permanentemente inmutable y no eliminable. Su editabilidad se deriva de ese historial de uso; no existe un campo `editable`.
- Candidate y Vacancy vinculados por una Application deben pertenecer al mismo User.
- `Application.current_stage_id` debe referenciar una PipelineStage del mismo Pipeline asignado a su Vacancy.
- Solo puede existir una Application activa por combinación Candidate + Vacancy. Una Application eliminada lógicamente deja de participar en esa unicidad.
- La eliminación lógica solo aplica a Pipeline y Application en el MVP; PipelineStage no usa eliminación lógica. La eliminación de Candidate y Vacancy no forma parte del MVP.

---

## 4. Especificación de la API

> Si tu backend se comunica a través de API, describe los endpoints principales (máximo 3) en formato OpenAPI. Opcionalmente puedes añadir un ejemplo de petición y de respuesta para mayor claridad

---

## 5. Historias de Usuario

> Documenta 3 de las historias de usuario principales utilizadas durante el desarrollo, teniendo en cuenta las buenas prácticas de producto al respecto.

**Historia de Usuario 1 — HU-01: Registrar Recruiter**

Como recruiter, quiero registrarme en RecruitLane, para acceder de forma segura a un espacio propio donde gestionar mis procesos de selección.

**Criterios de aceptación**

- **AC1 — Registro correcto:** Given que no existe un Recruiter registrado con el correo ingresado, When una persona completa el registro con un correo y contraseña válidos, Then el sistema crea una nueva cuenta de Recruiter y la cuenta queda disponible para autenticarse.
- **AC2 — Correo duplicado:** Given que existe un Recruiter registrado con un determinado correo, When una persona intenta registrarse utilizando el mismo correo, Then el sistema rechaza el registro y no crea una segunda cuenta.
- **AC3 — Protección de contraseña:** Given que una persona completa correctamente el registro, When el sistema persiste las credenciales del Recruiter, Then la contraseña original no se almacena en texto plano.
- **AC4 — Pipeline inicial:** Given que una persona completa correctamente el registro, When se crea su cuenta de Recruiter, Then el sistema crea automáticamente su pipeline predeterminado con las etapas Applied, Screening, Interview, Offer, Hired y Rejected en ese orden.

**Historia de Usuario 2 — HU-02: Crear una vacante**

Como recruiter, quiero crear una vacante y asignarle un pipeline de selección, para gestionar las postulaciones mediante un proceso definido.

**Criterios de aceptación**

- **AC1 — Pipelines disponibles:** Given que el Recruiter está autenticado y dispone de pipelines propios, When inicia la creación de una vacante, Then puede seleccionar uno de sus pipelines disponibles y no puede seleccionar pipelines pertenecientes a otro Recruiter.
- **AC2 — Creación correcta:** Given que el Recruiter está autenticado y seleccionó un pipeline propio, When crea una vacante con `title`, `company_name` y `description` válidos, Then el sistema crea la vacante asociada al pipeline seleccionado y queda inicialmente en estado `DRAFT`.
- **AC3 — Campos requeridos:** Given que el Recruiter está creando una vacante, When omite `title`, `company_name` o `description`, Then el sistema rechaza la creación.
- **AC4 — Pipeline fijo:** Given que existe una vacante, When el Recruiter intenta sustituir su pipeline, Then el sistema rechaza la modificación.
- **AC5 — Inmutabilidad del pipeline utilizado:** Given que un pipeline personalizado fue asociado a una vacante, When el Recruiter intenta modificar su nombre o sus etapas, Then el sistema rechaza la modificación.

**Historia de Usuario 3 — HU-03: Mover una candidatura entre etapas**

Como recruiter, quiero mover una candidatura entre las etapas del pipeline de una vacante, para reflejar el avance del candidato dentro del proceso de selección.

**Criterios de aceptación**

- **AC1 — Movimiento válido:** Given que una Vacancy está en estado `OPEN` y contiene una Application activa, When el Recruiter mueve la Application a otra etapa del pipeline de la Vacancy, Then el sistema actualiza su etapa actual.
- **AC2 — Movimiento no consecutivo:** Given que una Application pertenece a una Vacancy `OPEN`, When el Recruiter selecciona una etapa no consecutiva del mismo pipeline, Then el sistema permite el movimiento.
- **AC3 — Etapa de otro pipeline:** Given que una Application pertenece a una Vacancy con un pipeline determinado, When el Recruiter intenta moverla a una etapa perteneciente a otro pipeline, Then el sistema rechaza el movimiento.
- **AC4 — Vacante cerrada:** Given que una Vacancy está `FILLED` o `CANCELLED`, When el Recruiter intenta mover una de sus Applications, Then el sistema rechaza el movimiento y mantiene la Application en su etapa actual.
- **AC5 — Ownership:** Given que una Application pertenece a otro Recruiter, When el Recruiter autenticado intenta modificar su etapa, Then el sistema rechaza la operación y no expone ni modifica la Application.

---

## 6. Tickets de Trabajo

> Documenta 3 de los tickets de trabajo principales del desarrollo, uno de backend, uno de frontend, y uno de bases de datos. Da todo el detalle requerido para desarrollar la tarea de inicio a fin teniendo en cuenta las buenas prácticas al respecto. 

**Ticket 1**

**Ticket 2**

**Ticket 3**

---

## 7. Pull Requests

> Documenta 3 de las Pull Requests realizadas durante la ejecución del proyecto

**Pull Request 1**

**Pull Request 2**

**Pull Request 3**
