# Actividad Cliente-DevXP

Trabajo práctico de cliente y desarrollador aplicando Programación Extrema (XP).

## Objetivo

Definir, desarrollar y validar una aplicación web con frontend y API REST para gestionar turnos. La entrega se considera aceptada cuando se cumplen las historias de usuario y los criterios de aceptación de este documento.

## Entidad de negocio: Turno

Un turno representa una reserva de atención para una fecha y hora determinadas.

| Campo | Descripción |
| --- | --- |
| `id` | Identificador único del turno. |
| `fecha` | Día de la atención. |
| `hora` | Hora de inicio. |
| `motivo` | Descripción breve del motivo; opcional. |
| `estado` | Estado del turno: `reservado` o `cancelado`. |
| `usuarioId` | Usuario propietario del turno. |

Para esta versión, cada combinación de fecha y hora corresponde a un único espacio de atención.

## Reglas de negocio

1. Cualquier persona puede registrarse; las cuentas nuevas reciben el rol `Usuario`.
2. El rol `Admin` no se puede asignar desde el registro público. Se configura mediante un mecanismo controlado por el sistema.
3. Solo usuarios autenticados pueden consultar o gestionar turnos.
4. Un `Usuario` puede consultar sus propios turnos, reservar un turno disponible, modificar sus turnos reservados y cancelar sus propios turnos.
5. Un `Admin` puede consultar, crear, modificar y dar de baja cualquier turno.
6. No se permiten turnos con fecha u hora pasadas.
7. No puede haber más de un turno `reservado` para la misma combinación de fecha y hora. Un turno cancelado libera ese espacio.
8. La creación y modificación deben comprobar disponibilidad de forma atómica: ante operaciones simultáneas sobre el mismo espacio, como máximo una puede finalizar correctamente.
9. La baja se representa como cancelación (`estado: cancelado`) para conservar el registro y liberar el espacio. Una cancelación no puede volver a reservarse sin una nueva operación de alta.
10. Las operaciones de un usuario sobre turnos ajenos deben rechazarse sin revelar ni modificar esos datos.

## Historias de usuario

### HU-1: Registro e inicio de sesión

**Como** visitante, **quiero** registrarme e iniciar sesión, **para** acceder a las funciones habilitadas según mi rol.

**Criterios de aceptación**

- El registro requiere los datos obligatorios definidos por el sistema y una contraseña válida.
- La contraseña no se almacena ni se devuelve en texto plano.
- Al registrarse, la cuenta obtiene el rol `Usuario`; no se puede elegir `Admin` desde el formulario ni manipularlo en la solicitud.
- Un usuario registrado puede iniciar sesión y acceder a las vistas protegidas.
- Credenciales incorrectas y solicitudes no autenticadas no permiten acceder a recursos protegidos.
- La interfaz muestra errores de validación o autenticación sin exponer información sensible.

### HU-2: Gestión de turnos (ABMC)

**Como** usuario autenticado, **quiero** gestionar turnos mediante la interfaz y la API REST, **para** reservar y administrar espacios de atención.

**Criterios de aceptación**

- El `Usuario` puede crear un turno disponible y consultar únicamente sus propios turnos.
- El `Usuario` puede modificar o cancelar únicamente sus turnos, siempre que se respeten las reglas de negocio.
- El `Admin` puede listar y gestionar turnos de todos los usuarios.
- Las altas, modificaciones y bajas se reflejan correctamente en la consulta posterior.
- Una baja cancela el turno y deja disponible su espacio.
- La API rechaza datos inválidos, fechas pasadas, conflictos de disponibilidad y accesos sin autorización con respuestas HTTP apropiadas.
- El frontend permite realizar las operaciones autorizadas y comunica claramente los resultados y errores.

**Contrato REST esperado**

| Método y ruta | Operación |
| --- | --- |
| `POST /api/turnos` | Alta de un turno. |
| `GET /api/turnos` | Consulta de turnos propios para `Usuario`; consulta global para `Admin`. |
| `GET /api/turnos/{id}` | Consulta de un turno autorizado. |
| `PUT /api/turnos/{id}` | Modificación de un turno autorizado. |
| `DELETE /api/turnos/{id}` | Baja lógica: cambia el estado a `cancelado`. |

Las rutas de autenticación esperadas son `POST /api/auth/registro` y `POST /api/auth/login`. Si la implementación adopta otras rutas, deben documentarse y conservar los mismos comportamientos y controles.

### HU-3: Procesamiento concurrente

**Como** usuario del sistema, **quiero** que las reservas simultáneas se procesen sin duplicar turnos, **para** garantizar que un espacio no se asigne a más de una persona.

**Criterios de aceptación**

- Si dos o más solicitudes concurrentes intentan reservar el mismo espacio disponible, solo una obtiene una respuesta exitosa.
- Las demás reciben un conflicto (HTTP `409`) y no dejan registros duplicados ni datos parciales.
- Las solicitudes simultáneas para espacios distintos pueden completarse sin bloquearse entre sí de manera innecesaria.
- La disponibilidad también se valida bajo concurrencia al modificar un turno.

## Pruebas de aceptación y visto bueno

Ejecutar estas pruebas en la interfaz y, cuando corresponda, repetirlas directamente contra la API:

| ID | Prueba | Resultado esperado |
| --- | --- | --- |
| PA-1 | Registrar una cuenta y luego iniciar sesión con sus credenciales. | La cuenta queda como `Usuario`, inicia sesión y accede a sus funciones. |
| PA-2 | Intentar registrar una cuenta con rol `Admin` o alterar el rol en la solicitud. | La operación no concede privilegios de administrador. |
| PA-3 | Iniciar sesión con credenciales incorrectas y consultar una ruta protegida sin autenticación. | Acceso rechazado; la interfaz informa el error y la API responde con estado de autenticación apropiado. |
| PA-4 | Crear un turno futuro disponible, consultarlo, modificarlo y cancelarlo. | Cada cambio se conserva; al cancelar, el espacio vuelve a estar disponible. |
| PA-5 | Como `Usuario`, listar turnos e intentar consultar, modificar o cancelar el turno de otra persona. | Solo se muestran los turnos propios y las operaciones ajenas son rechazadas sin alterar datos. |
| PA-6 | Como `Admin`, listar y gestionar turnos de distintos usuarios. | Puede administrar todos los turnos. |
| PA-7 | Intentar reservar una fecha pasada y reservar un espacio que ya está ocupado. | Se rechazan ambas operaciones con mensajes comprensibles y sin crear registros inválidos. |
| PA-8 | Enviar varias solicitudes concurrentes para reservar la misma fecha y hora. | Exactamente una reserva queda activa; las restantes reciben conflicto y no se generan duplicados. |
| PA-9 | Enviar solicitudes concurrentes para espacios diferentes. | Cada reserva válida se procesa correctamente. |
| PA-10 | Completar los flujos principales desde el frontend y recargar la vista. | La interfaz muestra los datos persistidos y refleja permisos, estados y errores de la API. |

### Registro de validación de entrega

Completar este registro al probar una versión ejecutable:

- **Versión o commit probado:**
- **Fecha de prueba:**
- **Probador:**
- **Resultado:** Pendiente / Aprobado / Requiere correcciones
- **Pruebas aprobadas y evidencia:**
- **Problemas encontrados y pasos para reproducirlos:**
- **Feedback para el equipo:**

El visto bueno final requiere que todas las pruebas PA-1 a PA-10 sean aprobadas. Si alguna falla, registrar el caso y los pasos para reproducirlo, corregirlo y volver a ejecutar las pruebas afectadas antes de aprobar la entrega.
