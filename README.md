# BodegaControl — Grupo 2 · UNI

App Android de ventas, inventario, mermas y reportes para una bodega, integrada con una **API REST propia** (FastAPI) y **PostgreSQL**.
Taller 3 (API REST) y Taller 4 (Metodología Ágil Scrum) — SI806.

```
base-datos/   Esquema PostgreSQL, datos iniciales, pruebas de integridad y diccionario de datos
backend/      API REST FastAPI: controladores → servicios → repositorios
app-android/  Cliente React + Capacitor (en construcción)
docs/         Documentación de la API, colección Postman e informes (en construcción)
```

## Arquitectura

| Capa | Responsabilidad | Carpeta |
|---|---|---|
| Cliente Android | Interfaz, borrador local del carrito, peticiones HTTP | `app-android/` |
| Controladores | Rutas, códigos HTTP, autenticación | `backend/app/controladores/` |
| Servicios | Reglas de negocio, transacciones, permisos, idempotencia | `backend/app/servicios/` |
| Repositorios | SQL parametrizado | `backend/app/repositorios/` |
| PostgreSQL | Integridad (PK/FK/CHECK), triggers de stock e inmutabilidad, vistas | `base-datos/` |

## Credenciales de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| PROPIETARIO | `cadionicio@gmail.com` | `Propietario2026` |
| CAJERO | `giancarlo@uni.pe` | `Cajero2026` |

## Ejecutar en local

**Opción A — Docker** (no requiere instalar Python ni PostgreSQL):

```bash
docker compose up --build
# API y documentación interactiva: http://localhost:8000/docs
```

**Opción B — Python 3.12 + PostgreSQL 16 instalados:**

```bash
psql -U postgres -c "CREATE DATABASE bodega"
psql -U postgres -d bodega -f base-datos/01_esquema.sql
psql -U postgres -d bodega -f base-datos/02_datos_iniciales.sql
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                      # editar DATABASE_URL y JWT_SECRETO
uvicorn app.main:app --reload --env-file .env
```

## Pruebas

```bash
# Integridad del esquema (42 casos) sobre la base cargada
DATABASE_URL=postgresql://postgres:clave@localhost/bodega python base-datos/03_pruebas_esquema.py

# API (41 casos, incluye T-01..T-09 del Plan Maestro). ¡La base indicada se BORRA y recrea!
cd backend && DATABASE_URL_PRUEBAS=postgresql://postgres:clave@localhost/bodega_pruebas pytest pruebas -q
```

## Despliegue (Neon + Vercel)

1. **Neon** (PostgreSQL): crear proyecto en la región más cercana y, en *SQL Editor*, ejecutar `01_esquema.sql` y luego `02_datos_iniciales.sql`. Copiar la cadena de conexión **directa** (sin `-pooler`).
2. **Vercel**: importar el repositorio de GitHub con *Root Directory* = `backend`. En *Environment Variables* cargar `DATABASE_URL`, `JWT_SECRETO` (≥ 32 caracteres) y `TAMANO_POOL=2`.
3. Verificar `https://<proyecto>.vercel.app/api/v1/salud` → `{"estado": "OK"}`.

## Endpoints (`/api/v1`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/auth/login` | — | Iniciar sesión (JWT) |
| GET | `/auth/sesion` | Ambos | Usuario actual |
| GET | `/productos` | Ambos | Listar/buscar (`buscar`, `por_reponer`, `incluir_inactivos`) |
| GET | `/productos/{id}` | Ambos | Detalle |
| GET | `/productos/codigo-barras/{codigo}` | Ambos | Producto escaneado |
| POST | `/productos` | Propietario | Crear con stock inicial |
| PATCH | `/productos/{id}` | Propietario | Editar (no el stock) |
| DELETE | `/productos/{id}` | Propietario | Desactivar (baja lógica) |
| GET | `/inventario/{id}` | Ambos | Saldo y movimientos |
| POST | `/inventario/{id}/entradas` | Propietario | Reposición |
| POST | `/inventario/{id}/mermas` | Propietario | Merma (vencido, dañado, faltante, otro) |
| GET / POST | `/clientes` | Ambos | Buscar / registrar cliente |
| POST | `/ventas` | Ambos | Confirmar venta transaccional e idempotente |
| GET | `/ventas/estado?clave=` | Ambos | Reconciliar tras timeout (200/202/404) |
| GET | `/ventas` | Ambos | Historial (cajero: solo las suyas) |
| GET | `/ventas/{id}` | Ambos | Detalle con líneas y movimientos |
| GET | `/reportes/resumen` | Propietario | Indicadores del periodo |
| GET | `/reportes/{ventas\|mermas}` | Propietario | JSON, PDF o CSV por periodo |
| GET | `/salud` | — | Estado de API y base de datos |
