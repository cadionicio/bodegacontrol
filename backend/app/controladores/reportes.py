"""Controlador de reportes: tablero de Inicio y exportaciones (solo PROPIETARIO)."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Response
from psycopg import Connection

from app.base_datos import obtener_conexion
from app.esquemas import Periodo
from app.seguridad import UsuarioSesion, requerir_propietario
from app.servicios import reportes as servicio

enrutador = APIRouter(prefix="/reportes", tags=["Reportes"])


@enrutador.get("/resumen", summary="Indicadores del periodo: ventas, ganancia, más vendidos y mermas")
def resumen(periodo: Periodo = "DIARIO", fecha: date | None = None, desde: date | None = None,
            hasta: date | None = None, _: UsuarioSesion = Depends(requerir_propietario),
            cx: Connection = Depends(obtener_conexion)):
    return servicio.resumen(cx, periodo, fecha, desde, hasta)


@enrutador.get("/{tipo}", summary="Reporte de ventas o mermas en JSON (vista previa), PDF o CSV",
               description="`fecha` = cualquier día del periodo (por defecto hoy). PERSONALIZADO exige `desde` y `hasta`.")
def exportar(tipo: Literal["ventas", "mermas"], formato: Literal["JSON", "PDF", "CSV"] = "JSON",
             periodo: Periodo = "MENSUAL", fecha: date | None = None, desde: date | None = None,
             hasta: date | None = None, usuario: UsuarioSesion = Depends(requerir_propietario),
             cx: Connection = Depends(obtener_conexion)):
    resultado = servicio.exportar(cx, usuario, tipo.upper(), formato, periodo, fecha, desde, hasta)
    if formato == "JSON":
        return resultado
    return Response(resultado.contenido, media_type=resultado.tipo_mime,
                    headers={"Content-Disposition": f'attachment; filename="{resultado.nombre}"'})
