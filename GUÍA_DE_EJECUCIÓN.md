# Guía de ejecución y pruebas

Esta aplicación permite registrar usuarios, iniciar sesión, gestionar turnos y probar la lógica de negocio con una API REST y un frontend sencillo.

## Requisitos

- Node.js 22+
- npm
- Docker + Docker Compose
- Git

## 1) Ejecutar la aplicación con Docker (recomendado)

Desde la raíz del proyecto:

```bash
docker compose up --build -d
```

Esto levanta:

- Base de datos PostgreSQL en el puerto 5432
- Backend en el puerto 3001
- Frontend en el puerto 8080

### Verificar que está funcionando

```bash
curl http://localhost:3001/api/health
```

Respuesta esperada:

```json
{"ok":true,"status":"healthy"}
```

Frontend:

- Abrir: http://localhost:8080

### Detener la aplicación

```bash
docker compose down
```

Para limpiar también los datos persistidos:

```bash
docker compose down -v
```

---

## 2) Ejecutar la aplicación localmente sin Docker

### 2.1 Instalar dependencias

```bash
cd backend
npm install
```

### 2.2 Configurar variables de entorno

Puedes usar el ejemplo incluido:

```bash
cp .env.example .env
```

Si estás en Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2.3 Iniciar la API

```bash
npm start
```

La API queda disponible en:

```text
http://localhost:3001
```

### 2.4 Ejecutar el frontend estático

Abre el archivo HTML del frontend desde el navegador o servilo con un simple servidor local, por ejemplo:

```bash
cd frontend
python -m http.server 8080
```

Luego abrí:

```text
http://localhost:8080
```

> Si la API está corriendo en local, el frontend debe apuntar a `http://localhost:3001/api`.

---

## 3) Probar los tests

Los tests están ubicados en la carpeta `backend/test` y se ejecutan con Node Test Runner.

Desde la carpeta `backend`:

```bash
npm test
```

También se puede ejecutar directamente:

```bash
node --test
```

### Resultado esperado

- Todos los tests deben pasar.
- Si falla alguno, el comando mostrará qué prueba falló y por qué.

---

## 4) Flujo recomendado para validar la app

1. Levantar la pila con Docker:

```bash
docker compose up --build -d
```

2. Verificar salud del backend:

```bash
curl http://localhost:3001/api/health
```

3. Abrir la interfaz en:

```text
http://localhost:8080
```

4. Crear usuario / iniciar sesión.
5. Crear un turno, editarlo y cancelarlo.
6. Ejecutar tests desde `backend`:

```bash
cd backend
npm test
```

---

## 5) Detealles útiles

- Usuario admin por defecto en Docker:
  - Email: `admin@turnos.local`
  - Password: `Admin123!`
- El frontend usa la API en `http://localhost:3001/api`.
- Si cambias variables de entorno o el Docker Compose, reiniciá los contenedores:

```bash
docker compose down
docker compose up --build -d
```

---

## 6) Troubleshooting rápido

### El backend no responde

```bash
docker compose logs backend
```

### La base de datos no está lista

```bash
docker compose ps
```

Si la base está en estado `healthy`, el backend debería iniciar correctamente.

### Los tests fallan

```bash
cd backend
npm test -- --reporter=spec
```

Esto suele mostrar mejor el detalle del caso que está fallando.
