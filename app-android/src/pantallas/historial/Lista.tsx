/**
 * Prompt 6 · Historial de ventas. Muestra solo las últimas 40 para no saturar el celular ni la red (RNF-07);
 * las ventas más antiguas se consultan filtrando por fechas o por número de venta.
 */
import { ChevronRight, FileText, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import { Aviso, Campo, Cargando } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { useSesion } from '../../estado/sesion';
import { folioVenta, formatoFecha, formatoHora, hoyLima, nombreMetodo, redondear, soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

const LIMITE = 40;

export function Historial() {
  const { esPropietario } = useSesion();
  const navegar = useNavigate();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [folio, setFolio] = useState('');
  const [errorFolio, setErrorFolio] = useState<string>();
  const { datos: ventas, error, cargando } = useCarga(
    () => api.ventas.listar({ desde: desde || undefined, hasta: hasta || undefined, limite: LIMITE }), [desde, hasta]);
  const lista = ventas ?? [];
  const totalVendido = redondear(lista.reduce((s, v) => s + v.total, 0));
  const filtrado = Boolean(desde || hasta);

  const buscarFolio = async (e: FormEvent) => {
    e.preventDefault();
    const numero = Number(folio.replace(/\D/g, ''));
    if (!numero) return setErrorFolio('Escriba el número, por ejemplo 35 o V-00035');
    try {
      await api.ventas.obtener(numero);
      navegar(`/historial/${numero}`);
    } catch (falla) {
      setErrorFolio(mensajeDeError(falla));
    }
  };

  return (
    <Pantalla>
      <Encabezado titulo="Historial de ventas" subtitulo={filtrado ? 'Ventas en las fechas elegidas' : `Últimas ${LIMITE} ventas registradas`}>
        {esPropietario && <Link to="/reportes" className="boton boton--texto boton--compacto"><FileText size={18} />Reporte</Link>}
      </Encabezado>
      <form onSubmit={buscarFolio}>
        <Campo etiqueta="Buscar por N.º de venta" inputMode="numeric" placeholder="V-00035" value={folio} error={errorFolio}
               icono={<Search size={18} />} onChange={(e) => { setFolio(e.target.value); setErrorFolio(undefined); }} />
      </form>
      <div className="reticula-2">
        <Campo etiqueta="Desde" type="date" value={desde} max={hasta || hoyLima()} onChange={(e) => setDesde(e.target.value)} />
        <Campo etiqueta="Hasta" type="date" value={hasta} min={desde} max={hoyLima()} onChange={(e) => setHasta(e.target.value)} />
      </div>
      {filtrado && (
        <button className="boton boton--texto boton--compacto" style={{ alignSelf: 'flex-start', marginTop: -8 }}
                onClick={() => { setDesde(''); setHasta(''); }}><X size={16} />Quitar filtro de fechas</button>
      )}
      <div className="reticula-3">
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Ventas</div><div className="kpi__valor kpi__valor--chico">{lista.length}</div></div>
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Total vendido</div><div className="kpi__valor kpi__valor--chico" style={{ fontSize: 16 }}>{soles(totalVendido)}</div></div>
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Ticket prom.</div>
          <div className="kpi__valor kpi__valor--chico" style={{ fontSize: 16 }}>{soles(lista.length ? redondear(totalVendido / lista.length) : 0)}</div></div>
      </div>

      {cargando ? <Cargando /> : error ? <Aviso tipo="error">{error}</Aviso> : (
        <div className="lista">
          {!lista.length && <div className="vacio">No hay ventas {filtrado ? 'en estas fechas' : 'registradas'}.</div>}
          {lista.map((v) => (
            <Link key={v.venta_id} to={`/historial/${v.venta_id}`} className="item">
              <div className="item__cuerpo">
                <div className="fila entre"><span className="negrita">{folioVenta(v.venta_id)}</span><span className="negrita num">{soles(v.total)}</span></div>
                <div className="item__meta">{formatoFecha(v.registrada_en)} · {formatoHora(v.registrada_en)} · {v.cliente ?? 'Cliente general'}</div>
                <div className="fila" style={{ marginTop: 4 }}>
                  <span className="estado estado--ok">Completada</span>
                  <span className="item__meta">{nombreMetodo(v.metodo, v.modalidad_tarjeta)}{esPropietario && ` · ${v.cajero}`}</span>
                </div>
              </div>
              <ChevronRight className="chevron" size={20} />
            </Link>
          ))}
          {lista.length === LIMITE && (
            <p className="ayuda centro">Se muestran las {LIMITE} más recientes. Para ver anteriores, filtre por fechas o busque por número.</p>
          )}
        </div>
      )}
    </Pantalla>
  );
}
