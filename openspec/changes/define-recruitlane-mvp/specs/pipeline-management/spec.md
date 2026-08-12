## Purpose

Definir pipelines de selección propios con etapas ordenadas, incluyendo un pipeline inicial fijo y pipelines personalizados con reglas de inmutabilidad.

## ADDED Requirements

### Requirement: Pipeline predeterminado por Recruiter
El sistema MUST crear automáticamente un único pipeline predeterminado para cada Recruiter. Sus etapas ordenadas MUST ser: Applied, Screening, Interview, Offer, Hired y Rejected. El Recruiter MUST poder usarlo en vacantes, pero MUST NOT poder editarlo ni eliminarlo.

#### Scenario: Creación automática al registrar un Recruiter
- **WHEN** se crea una cuenta de Recruiter
- **THEN** el sistema crea para ese Recruiter un pipeline predeterminado con las seis etapas en el orden definido

#### Scenario: Intento de modificar el pipeline predeterminado
- **WHEN** un Recruiter intenta renombrar, reordenar, agregar o eliminar etapas del pipeline predeterminado, o eliminarlo
- **THEN** el sistema rechaza la modificación o eliminación

### Requirement: Creación de pipelines personalizados válidos
El sistema MUST permitir que un Recruiter cree pipelines personalizados propios. Cada pipeline personalizado MUST tener un nombre obligatorio y entre 3 y 10 etapas ordenadas; cada etapa MUST tener un nombre y no pueden existir nombres de etapa duplicados dentro del mismo pipeline.

#### Scenario: Creación de pipeline personalizado válido
- **WHEN** un Recruiter crea un pipeline con nombre y de 3 a 10 etapas con nombres distintos
- **THEN** el sistema crea el pipeline con las etapas en el orden indicado

#### Scenario: Creación de pipeline con etapas inválidas
- **WHEN** un Recruiter intenta crear un pipeline con menos de 3, más de 10, etapas sin nombre o nombres de etapa duplicados
- **THEN** el sistema rechaza la creación

### Requirement: Edición antes de la primera asociación con una vacante
Un pipeline personalizado que nunca estuvo asociado con una vacante MUST poder cambiar su nombre, agregar o eliminar etapas, renombrar etapas y reordenarlas, siempre que el resultado siga cumpliendo las reglas de un pipeline personalizado válido.

#### Scenario: Edición de pipeline personalizado no asociado
- **WHEN** un Recruiter modifica un pipeline personalizado que nunca estuvo asociado a una vacante y el resultado es válido
- **THEN** el sistema guarda la modificación

#### Scenario: Edición que viola las reglas de etapas
- **WHEN** un Recruiter modifica un pipeline no asociado de forma que queda inválido
- **THEN** el sistema rechaza la modificación

### Requirement: Inmutabilidad tras la asociación con una vacante
Desde la primera asociación de un pipeline personalizado con cualquier vacante, ese pipeline MUST ser completamente inmutable: no se puede cambiar su nombre, agregar, eliminar, renombrar ni reordenar etapas. Esta inmutabilidad MUST mantenerse aunque la vacante cambie de estado.

#### Scenario: Modificación de pipeline previamente asociado
- **WHEN** un Recruiter intenta modificar un pipeline personalizado que ya estuvo asociado a una vacante
- **THEN** el sistema rechaza la modificación

### Requirement: Eliminación lógica de pipelines personalizados no asociados
Un pipeline personalizado MUST poder eliminarse únicamente si nunca estuvo asociado con una vacante. La eliminación MUST ser lógica. Un pipeline eliminado lógicamente MUST considerarse ausente de los flujos normales: MUST NOT aparecer en listados normales, estar disponible para consulta, recuperación o uso normal, ni poder seleccionarse para una nueva asociación con una vacante. El MVP MUST NOT ofrecer papelera, restauración ni recuperación. Esta especificación no define su mecanismo físico de persistencia.

#### Scenario: Eliminación de pipeline personalizado no asociado
- **WHEN** un Recruiter elimina un pipeline personalizado que nunca estuvo asociado con una vacante
- **THEN** el sistema lo trata como eliminado, lo excluye de los flujos normales y no permite seleccionarlo para una vacante nueva

#### Scenario: Intento de recuperar un pipeline eliminado
- **WHEN** un Recruiter intenta acceder a una papelera o restaurar un pipeline eliminado lógicamente
- **THEN** el sistema no ofrece ni ejecuta esa capacidad en el MVP

#### Scenario: Eliminación de pipeline asociado
- **WHEN** un Recruiter intenta eliminar un pipeline personalizado que ya estuvo asociado con una vacante
- **THEN** el sistema rechaza la eliminación
