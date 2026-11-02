"""Generación de archivos de reporte: CSV para análisis estadístico y PDF para distribución (RF-15/16)."""
import csv
import io
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.configuracion import configuracion

VERDE = colors.HexColor("#0B6B3A")


@dataclass(frozen=True)
class Columna:
    clave: str
    titulo: str
    tipo: str = "texto"  # texto | dinero | entero | fecha


def _valor_csv(valor):
    if isinstance(valor, datetime):
        return valor.astimezone(configuracion.zona_horaria).strftime("%Y-%m-%d %H:%M:%S")
    return "" if valor is None else valor  # NULL vacío: el análisis lo distingue de un cero real


def _valor_pdf(valor, tipo: str) -> str:
    if valor is None:
        return "—"
    if tipo == "fecha":
        return valor.astimezone(configuracion.zona_horaria).strftime("%d/%m/%Y %H:%M")
    if tipo == "dinero":
        return f"S/ {Decimal(valor):,.2f}"
    return str(valor)


def generar_csv(columnas: list[Columna], filas: list[dict]) -> bytes:
    """UTF-8 con BOM: Excel en español reconoce tildes y ñ sin configuración adicional."""
    salida = io.StringIO()
    escritor = csv.writer(salida)
    escritor.writerow([c.clave for c in columnas])  # claves estables como encabezado (RF-16)
    escritor.writerows([_valor_csv(fila[c.clave]) for c in columnas] for fila in filas)
    return salida.getvalue().encode("utf-8-sig")


def generar_pdf(titulo: str, subtitulo: str, resumen: list[tuple[str, str]],
                columnas: list[Columna], filas: list[dict]) -> bytes:
    estilos = getSampleStyleSheet()
    buffer = io.BytesIO()
    documento = SimpleDocTemplate(buffer, pagesize=landscape(A4), title=titulo,
                                  leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm)
    tabla_resumen = Table([[Paragraph(f"<b>{k}</b><br/>{v}", estilos["Normal"]) for k, v in resumen]])
    datos = [[c.titulo for c in columnas]] + [[_valor_pdf(f[c.clave], c.tipo) for c in columnas] for f in filas]
    tabla = Table(datos or [["Sin registros en el periodo"]], repeatRows=1)  # encabezado en cada página
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), VERDE), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F7F4")]),
        *[("ALIGN", (i, 1), (i, -1), "RIGHT") for i, c in enumerate(columnas) if c.tipo in ("dinero", "entero")],
    ]))
    documento.build([Paragraph(titulo, estilos["Title"]), Paragraph(subtitulo, estilos["Normal"]),
                     Spacer(1, 4 * mm), tabla_resumen, Spacer(1, 4 * mm),
                     tabla if filas else Paragraph("Sin registros en el periodo.", estilos["Italic"])])
    return buffer.getvalue()
