/** Prompt 18 · Vista previa: hoja simulada con datos reales del periodo; PDF para distribuir, CSV para analizar. */
import { FileSpreadsheet, FileText, LoaderCircle, Store } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { api, type FiltrosReporte } from '../../api/recursos';
import { Aviso, Cargando, GraficoBarras } from '../../componentes/controles';
import { Pantalla } from '../../componentes/estructura';
import { NOMBRE_MOTIVO, entero, formatoFecha, soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';
import { descargarReporte } from './Generar';

interface Estado { tipo: 'ventas' | 'mermas'; filtros: FiltrosReporte; etiqueta: string }
const diaLima = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso));

export function VistaPrevia() {
  const estado = useLocation().state as Estado | null;
  const [exportando, setExportando] = useState<'PDF' | 'CSV' | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const { datos, error, cargando } = useCarga(async () => (estado
    ? Promise.all([api.reportes.vistaPrevia(estado.tipo, estado.filtros), api.reportes.resumenFiltrado(estado.filtros)]) : null), []);
  if (!estado) return <Navigate to="/reportes" replace />;
  const ventas = estado.tipo === 'ventas';

  const exportar = async (formato: 'PDF' | 'CSV') => {
    setExportando(formato);
    setAviso(null);
    try {
      await descargarReporte(estado.tipo, formato, estado.filtros, estado.etiqueta);
      setAviso({ tipo: 'exito', texto: `${formato} generado con los datos del servidor.` });
    } catch (e) { setAviso({ tipo: 'error', texto: mensajeDeError(e) }); } finally { setExportando(null); }
  };

  return (
    <Pantalla titulo="Vista previa" volver={-1} pie={
      <>
        <button className="boton boton--secundario" disabled={!!exportando || !datos} onClick={() => exportar('CSV')}>
          {exportando === 'CSV' ? <LoaderCircle className="girando" size={18} /> : <FileSpreadsheet size={18} />}Exportar CSV</button>
        <button className="boton" disabled={!!exportando || !datos} onClick={() => exportar('PDF')}>
          {exportando === 'PDF' ? <LoaderCircle className="girando" size={18} /> : <FileText size={18} />}Descargar PDF</button>
      </>
    }>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {cargando ? <Cargando /> : error || !datos ? <Aviso tipo="error">{error}</Aviso> : (() => {
        const [reporte, resumen] = datos;
        const serie = ventas
          ? Object.entries(reporte.filas.reduce<Record<string, number>>((acc, f) => {
              const dia = diaLima(String(f.registrada_en));
              acc[dia] = (acc[dia] ?? 0) + Number(f.total);
              return acc;
            }, {})).sort().map(([dia, total]) => ({ clave: dia, etiqueta: dia.slice(8), total }))
          : resumen.mermas.por_motivo.map((m) => ({ clave: m.motivo, etiqueta: NOMBRE_MOTIVO[m.motivo], total: m.valor_perdido }));
        return (
          <>
            <div className="fila entre">
              <span className="negrita">Reporte de {estado.tipo} · {reporte.intervalo.etiqueta}</span>
              <span className="texto-gris" style={{ fontSize: 13 }}>{reporte.filas.length} registros</span>
            </div>
            <div className="marco-hoja">
              <article className="hoja">
                <div className="fila" style={{ gap: 10 }}>
                  <Store size={28} color="var(--verde)" />
                  <div><h3>BodegaControl</h3><div className="texto-gris">Reporte de {estado.tipo}</div></div>
                </div>
                <p style={{ marginTop: 8 }}>Periodo: {reporte.intervalo.etiqueta}<br />Generado: {formatoFecha(Date.now())}</p>
                <div className="reticula-3" style={{ marginTop: 10 }}>
                  {(ventas
                    ? [['Ventas totales', soles(resumen.ventas.total)], ['N.º de ventas', entero(resumen.ventas.ventas)], ['Ticket promedio', soles(resumen.ventas.ticket_promedio)]]
                    : [['Unidades perdidas', entero(resumen.mermas.unidades)], ['Pérdida', soles(resumen.mermas.valor_perdido)],
                       ['% de merma', resumen.mermas.porcentaje_merma == null ? '—' : `${resumen.mermas.porcentaje_merma} %`]]
                  ).map(([etiqueta, valor]) => (
                    <div key={etiqueta} className="tarjeta" style={{ padding: 8 }}><div className="texto-gris" style={{ fontSize: 11 }}>{etiqueta}</div>
                      <div className="negrita" style={{ fontSize: 14 }}>{valor}</div></div>
                  ))}
                </div>
                {ventas && resumen.ventas.ventas_sin_costo > 0 && (
                  <p className="texto-gris" style={{ marginTop: 6 }}>Ganancia conocida {soles(resumen.ventas.ganancia_conocida)} ({resumen.ventas.ventas_sin_costo} ventas con productos sin costo).</p>
                )}
                {serie.length > 0 && <div style={{ marginTop: 10 }}><GraficoBarras datos={serie} resaltarUltima={false} /></div>}
                {ventas ? (
                  <table>
                    <thead><tr><th>Producto más vendido</th><th className="num">Cant.</th><th className="num">Total</th></tr></thead>
                    <tbody>
                      {resumen.mas_vendidos.map((p) => <tr key={p.producto_id}><td>{p.nombre}</td><td className="num">{p.unidades}</td><td className="num">{soles(p.total)}</td></tr>)}
                      {!resumen.mas_vendidos.length && <tr><td colSpan={3}>Sin ventas en el periodo.</td></tr>}
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead><tr><th>Producto</th><th>Motivo</th><th className="num">Cant.</th><th className="num">Pérdida</th></tr></thead>
                    <tbody>
                      {reporte.filas.slice(0, 15).map((f) => (
                        <tr key={String(f.movimiento_id)}><td>{f.nombre}</td><td>{NOMBRE_MOTIVO[String(f.motivo)]}</td>
                          <td className="num">{f.cantidad}</td><td className="num">{soles(f.valor_perdido as number | null)}</td></tr>
                      ))}
                      {!reporte.filas.length && <tr><td colSpan={4}>Sin mermas en el periodo.</td></tr>}
                    </tbody>
                  </table>
                )}
                <p className="texto-gris" style={{ marginTop: 8 }}>El PDF incluye el detalle completo de {reporte.filas.length} registros.</p>
              </article>
            </div>
          </>
        );
      })()}
    </Pantalla>
  );
}
