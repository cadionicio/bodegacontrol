"""Punto de entrada de la API REST de BodegaControl (Vercel detecta `app` en app/main.py)."""
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from psycopg import Connection

from app.base_datos import obtener_conexion, pool
from app.configuracion import configuracion
from app.controladores import autenticacion, clientes, inventario, productos, reportes, ventas
from app.errores import registrar_manejadores

VERSION = "1.0.0"


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    pool.open()
    yield
    pool.close()


app = FastAPI(title="BodegaControl API", version=VERSION, lifespan=ciclo_de_vida,
              description="API REST propia para ventas, inventario, mermas y reportes de una bodega. "
                          "Autentíquese en `POST /api/v1/auth/login` y use el token con el botón **Authorize**.")
app.add_middleware(CORSMiddleware, allow_origins=list(configuracion.origenes_cors),
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["Content-Disposition"])
registrar_manejadores(app)

api_v1 = APIRouter(prefix="/api/v1")
for modulo in (autenticacion, productos, inventario, clientes, ventas, reportes):
    api_v1.include_router(modulo.enrutador)


@api_v1.get("/salud", tags=["Sistema"], summary="Verifica que la API y PostgreSQL respondan")
def salud(cx: Connection = Depends(obtener_conexion)):
    fila = cx.execute("SELECT NOW() AS hora_servidor, current_setting('server_version') AS postgres").fetchone()
    return {"estado": "OK", "version_api": VERSION, **fila}


app.include_router(api_v1)


@app.get("/", include_in_schema=False)
def inicio():
    return RedirectResponse("/docs")
