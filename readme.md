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
> Usa el formato que consideres más adecuado para representar los componentes principales de la aplicación y las tecnologías utilizadas. Explica si sigue algún patrón predefinido, justifica por qué se ha elegido esta arquitectura, y destaca los beneficios principales que aportan al proyecto y justifican su uso, así como sacrificios o déficits que implica.


### **2.2. Descripción de componentes principales:**

> Describe los componentes más importantes, incluyendo la tecnología utilizada

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

> Representa la estructura del proyecto y explica brevemente el propósito de las carpetas principales, así como si obedece a algún patrón o arquitectura específica.

### **2.4. Infraestructura y despliegue**

> Detalla la infraestructura del proyecto, incluyendo un diagrama en el formato que creas conveniente, y explica el proceso de despliegue que se sigue

### **2.5. Seguridad**

> Enumera y describe las prácticas de seguridad principales que se han implementado en el proyecto, añadiendo ejemplos si procede

### **2.6. Tests**

> Describe brevemente algunos de los tests realizados

---

## 3. Modelo de Datos

### **3.1. Diagrama del modelo de datos:**

> Recomendamos usar mermaid para el modelo de datos, y utilizar todos los parámetros que permite la sintaxis para dar el máximo detalle, por ejemplo las claves primarias y foráneas.


### **3.2. Descripción de entidades principales:**

> Recuerda incluir el máximo detalle de cada entidad, como el nombre y tipo de cada atributo, descripción breve si procede, claves primarias y foráneas, relaciones y tipo de relación, restricciones (unique, not null…), etc.

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

