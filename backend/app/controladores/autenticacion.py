"""Controlador de sesión: traduce HTTP ↔ servicio de seguridad."""
from fastapi import APIRouter, Depends
from psycopg import Connection

from app.base_datos import obtener_conexion
from app.esquemas import Credenciales
from app.seguridad import UsuarioSesion, autenticar, usuario_actual

enrutador = APIRouter(prefix="/auth", tags=["Autenticación"])


@enrutador.post("/login", summary="Iniciar sesión y obtener token JWT")
def iniciar_sesion(credenciales: Credenciales, cx: Connection = Depends(obtener_conexion)):
    return autenticar(cx, credenciales.correo, credenciales.contrasena)


@enrutador.get("/sesion", summary="Usuario de la sesión actual")
def sesion(usuario: UsuarioSesion = Depends(usuario_actual)):
    return usuario
