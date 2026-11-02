"""Reportes por periodo (PR-06): siempre calculados desde transacciones históricas, nunca totales fijos."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from psycopg import Connection

from app.configuracion import configuracion
from app.repositorios import reportes as repo
from app.seguridad import UsuarioSesion
from app.servicios.documentos import Columna, generar_csv, generar_pdf
from app.servicios.periodos import intervalo


@dataclass(frozen=True)
class Archivo:
    contenido: bytes
    tipo_mime: str
    nombre: str


_COLUMNAS = {
    "VENTAS": [Columna("venta_id", "N.º", "entero"), Columna("registrada_en", "Fecha", "fecha"),
               Columna("cajero", "Cajero"), Columna("cliente", "Cliente"), Columna("metodo", "Pago"),
               Columna("unidades", "Unid.", "entero"), Columna("total", "Total", "dinero"),
               Columna("costo_total", "Costo", "dinero"), Columna("ganancia", "Ganancia", "dinero")],
    "MERMAS": [Columna("movimiento_id", "N.º", "entero"), Columna("registrada_en", "Fecha", "fecha"),
               Columna("codigo", "Código"), Columna("nombre", "Producto"), Columna("motivo", "Motivo"),
               Columna("cantidad", "Cant.", "entero"), Columna("costo_unitario", "Costo unit.", "dinero"),
               Columna("valor_perdido", "Pérdida", "dinero"), Columna("observacion", "Observación"),
               Columna("registrado_por", "Registró")],
}


def _describir(periodo: str, desde: datetime, hasta: datetime) -> dict:
    ultimo_dia = (hasta - timedelta(days=1)).date()
    return {"periodo": periodo, "desde": desde, "hasta_exclusivo": hasta,
            "etiqueta": f"{desde:%d/%m/%Y} al {ultimo_dia:%d/%m/%Y}"}


def _agregados(cx: Connection, desde: datetime, hasta: datetime) -> dict:
    return {"ventas": repo.totales_ventas(cx, desde, hasta),
            "por_metodo": repo.ventas_por_metodo(cx, desde, hasta),
            "mas_vendidos": repo.productos_mas_vendidos(cx, desde, hasta),
            "mermas": {**repo.indicador_mermas(cx, desde, hasta), "por_motivo": repo.mermas_por_motivo(cx, desde, hasta)}}


def resumen(cx: Connection, periodo: str, fecha: date | None, desde_dia: date | None = None,
            hasta_dia: date | None = None) -> dict:
    """Tablero de Inicio: ventas, ganancia, medios de pago, más vendidos e indicador de mermas."""
    desde, hasta = intervalo(periodo, fecha, desde_dia, hasta_dia)
    return {"intervalo": _describir(periodo, desde, hasta), **_agregados(cx, desde, hasta)}


def _resumen_pdf(tipo: str, datos: dict) -> list[tuple[str, str]]:
    if tipo == "VENTAS":
        v = datos["ventas"]
        ganancia = f"S/ {v['ganancia_conocida']:,.2f}" + (f" ({v['ventas_sin_costo']} sin costo)" if v["ventas_sin_costo"] else "")
        return [("Ventas", str(v["ventas"])), ("Total vendido", f"S/ {v['total']:,.2f}"),
                ("Ticket promedio", f"S/ {v['ticket_promedio']:,.2f}"), ("Ganancia", ganancia)]
    m = datos["mermas"]
    porcentaje = "—" if m["porcentaje_merma"] is None else f"{m['porcentaje_merma']} %"
    return [("Unidades perdidas", str(m["unidades"])), ("Pérdida", f"S/ {m['valor_perdido']:,.2f}"),
            ("% de merma", porcentaje)]


def exportar(cx: Connection, usuario: UsuarioSesion, tipo: str, formato: str, periodo: str,
             fecha: date | None, desde_dia: date | None, hasta_dia: date | None) -> dict | Archivo:
    """JSON = vista previa en la app (no se audita); PDF/CSV = archivo distribuible (se audita, RF-18)."""
    desde, hasta = intervalo(periodo, fecha, desde_dia, hasta_dia)
    filas = (repo.filas_ventas if tipo == "VENTAS" else repo.filas_mermas)(cx, desde, hasta)
    descripcion = _describir(periodo, desde, hasta)
    datos = _agregados(cx, desde, hasta)
    if formato == "JSON":
        return {"intervalo": descripcion, "resumen": datos["ventas" if tipo == "VENTAS" else "mermas"], "filas": filas}
    columnas = _COLUMNAS[tipo]
    if formato == "CSV":
        contenido, mime = generar_csv(columnas, filas), "text/csv; charset=utf-8"
    else:
        generado = datetime.now(configuracion.zona_horaria)
        subtitulo = (f"Periodo {periodo.lower()}: {descripcion['etiqueta']} · Generado por {usuario.nombre} "
                     f"el {generado:%d/%m/%Y %H:%M}")
        contenido = generar_pdf(f"BodegaControl — Reporte de {tipo.lower()}", subtitulo,
                                _resumen_pdf(tipo, datos), columnas, filas)
        mime = "application/pdf"
    # Se audita solo después de generar el archivo con éxito: una exportación fallida no queda registrada.
    with cx.transaction():
        repo.registrar_exportacion(cx, usuario.usuario_id, tipo, formato, periodo, desde, hasta, len(filas))
    ultimo_dia = (hasta - timedelta(days=1)).date()
    return Archivo(contenido, mime, f"bodegacontrol_{tipo.lower()}_{desde:%Y-%m-%d}_{ultimo_dia:%Y-%m-%d}.{formato.lower()}")
