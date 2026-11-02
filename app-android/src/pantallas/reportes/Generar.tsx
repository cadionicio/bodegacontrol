/**
 * Prompt 7 · Generar reporte (subpantalla, no sexta pestaña). Los recientes vienen de la auditoría de la API;
 * como el archivo no se guarda en el servidor, la acción es «Generar de nuevo» con los mismos filtros.
 */
import { FileSpreadsheet, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { api, type FiltrosReporte } from '../../api/recursos';
import type { Exportacion, Periodo } from '../../api/tipos';
import { Aviso, Campo, Cargando, Selector } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { entregarArchivo } from '../../utilidades/archivos';
import { formatoFechaHora, hoyLima } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

export const PERIODOS: [Periodo, string][] = [
  ['DIARIO', 'Diario'], ['SEMANAL', 'Semanal'], ['MENSUAL', 'Mensual'], ['BIMESTRAL', 'Bimestral'], ['TRIMESTRAL', 'Trimestral'],
  ['SEMESTRAL', 'Semestral'], ['ANUAL', 'Anual'], ['TODO', 'Todo el periodo'], ['PERSONALIZADO', 'Personalizado'],
];
const POR_MES = new Set<Periodo>(['MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']);
const fechaLima = (iso: string | number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso));

export async function descargarReporte(tipo: 'ventas' | 'mermas', formato: 'PDF' | 'CSV', filtros: FiltrosReporte, etiqueta: string) {
  const blob = await api.reportes.archivo(tipo, formato, filtros);
  await entregarArchivo(blob, `bodegacontrol_${tipo}_${etiqueta}.${formato.toLowerCase()}`);
}

function Reciente({ r, alTerminar }: { r: Exportacion; alTerminar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string>();
  const desde = fechaLima(r.desde);
  const hasta = fechaLima(new Date(r.hasta_exclusivo).getTime() - 1);
  const regenerar = async () => {
    setOcupado(true);
    try {
      await descargarReporte(r.tipo_reporte === 'VENTAS' ? 'ventas' : 'mermas', r.formato, { periodo: 'PERSONALIZADO', desde, hasta }, `${desde}_${hasta}`);
      alTerminar();
    } catch (e) { setError(mensajeDeError(e)); } finally { setOcupado(false); }
  };
  const Icono = r.formato === 'PDF' ? FileText : FileSpreadsheet;
  return (
    <div className="item">
      <Icono size={26} color={r.formato === 'PDF' ? 'var(--rojo)' : 'var(--verde)'} />
      <div className="item__cuerpo">
        <div className="item__titulo">{r.tipo_reporte === 'VENTAS' ? 'Ventas' : 'Mermas'} · {PERIODOS.find(([p]) => p === r.periodo)?.[1]}</div>
        <div className="item__meta">{desde.split('-').reverse().join('/')} – {hasta.split('-').reverse().join('/')} · {r.formato} · {r.cantidad_filas} filas</div>
        <div className="item__meta">Generado {formatoFechaHora(r.generado_en)} por {r.generado_por}</div>
        {error && <p className="error-campo">{error}</p>}
      </div>
      <button className="boton-icono" aria-label="Generar de nuevo" disabled={ocupado} onClick={regenerar}>
        {ocupado ? <LoaderCircle className="girando" size={20} /> : <RefreshCw size={20} />}
      </button>
    </div>
  );
}

export function GenerarReporte() {
  const navegar = useNavigate();
  const hoy = hoyLima();
  const [tipo, setTipo] = useState<'ventas' | 'mermas'>('ventas');
  const [periodo, setPeriodo] = useState<Periodo>('MENSUAL');
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [dia, setDia] = useState(hoy);
  const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'PDF' | 'CSV' | null>(null);
  const recientes = useCarga(() => api.reportes.recientes(), []);

  const filtros = (): FiltrosReporte | null => {
    if (periodo === 'PERSONALIZADO') {
      if (!desde || !hasta || desde > hasta) { setError('La fecha «Desde» debe ser anterior o igual a «Hasta».'); return null; }
      return { periodo, desde, hasta };
    }
    if (periodo === 'TODO') return { periodo };
    return { periodo, fecha: POR_MES.has(periodo) ? `${mes}-01` : dia };
  };
  const etiqueta = () => (periodo === 'PERSONALIZADO' ? `${desde}_${hasta}` : periodo === 'TODO' ? 'todo' : POR_MES.has(periodo) ? `${periodo.toLowerCase()}_${mes}` : `${periodo.toLowerCase()}_${dia}`);

  const exportar = async (formato: 'PDF' | 'CSV') => {
    const f = filtros();
    if (!f) return;
    setExportando(formato);
    setError(null);
    try { await descargarReporte(tipo, formato, f, etiqueta()); void recientes.recargar(); }
    catch (e) { setError(mensajeDeError(e)); } finally { setExportando(null); }
  };

  return (
    <Pantalla titulo="Reportes" volver={-1}>
      <Encabezado titulo="Generar reporte" subtitulo="Selecciona los filtros para analizar el negocio" />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <section className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Selector etiqueta="Tipo de reporte" valor={tipo} alCambiar={(v) => setTipo(v as 'ventas' | 'mermas')}
                  opciones={[['ventas', 'Ventas'], ['mermas', 'Mermas']]} />
        <div className="grupo">
          <Selector etiqueta="Periodo" valor={periodo} alCambiar={(v) => { setPeriodo(v as Periodo); setError(null); }} opciones={PERIODOS} />
          <p className="ayuda">Bimestres, trimestres y semestres son de calendario (ej. nov–dic, oct–dic, jul–dic).</p>
        </div>
        {POR_MES.has(periodo) && <Campo etiqueta="Mes de referencia" type="month" value={mes} max={hoy.slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)} />}
        {(periodo === 'DIARIO' || periodo === 'SEMANAL') && <Campo etiqueta="Día de referencia" type="date" value={dia} max={hoy} onChange={(e) => e.target.value && setDia(e.target.value)} />}
        {periodo === 'PERSONALIZADO' && (
          <div className="reticula-2">
            <Campo etiqueta="Desde" type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} />
            <Campo etiqueta="Hasta" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
          </div>
        )}
      </section>
      <button className="boton boton--ancho" onClick={() => { const f = filtros(); if (f) navegar('/reportes/vista-previa', { state: { tipo, filtros: f, etiqueta: etiqueta() } }); }}>
        <FileText size={18} />Generar reporte
      </button>
      <div className="reticula-2">
        <button className="boton boton--secundario" disabled={!!exportando} onClick={() => exportar('PDF')}>
          {exportando === 'PDF' ? <LoaderCircle className="girando" size={18} /> : <FileText size={18} />}PDF directo</button>
        <button className="boton boton--secundario" disabled={!!exportando} onClick={() => exportar('CSV')}>
          {exportando === 'CSV' ? <LoaderCircle className="girando" size={18} /> : <FileSpreadsheet size={18} />}CSV directo</button>
      </div>

      <section className="lista">
        <h2 className="seccion-titulo">Reportes recientes</h2>
        {recientes.cargando ? <Cargando /> : recientes.error ? <Aviso tipo="error">{recientes.error}</Aviso>
          : !recientes.datos?.length ? <p className="texto-gris">Aún no se han exportado reportes.</p>
          : recientes.datos.map((r) => <Reciente key={r.exportacion_id} r={r} alTerminar={() => void recientes.recargar()} />)}
      </section>
    </Pantalla>
  );
}
