/** Prompt 6 · Historial de ventas: pantalla de lectura y auditoría; las ventas confirmadas no se editan. */
import { ChevronRight, FileText, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import type { VentaResumen } from '../../api/tipos';
import { Aviso, Campo, Cargando } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { useSesion } from '../../estado/sesion';
import { folioVenta, formatoFecha, formatoHora, hoyLima, nombreMetodo, redondear, soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

const POR_PAGINA = 50;

export function Historial() {
  const { esPropietario } = useSesion();
  const navegar = useNavigate();
  const [desde, setDesde] = useState(hoyLima());
  const [hasta, setHasta] = useState(hoyLima());
  const [folio, setFolio] = useState('');
  const [errorFolio, setErrorFolio] = useState<string>();
  const [extra, setExtra] = useState<VentaResumen[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const { datos, error, cargando } = useCarga(async () => {
    const pagina = await api.ventas.listar({ desde, hasta, limite: POR_PAGINA });
    setExtra([]);
    setHayMas(pagina.length === POR_PAGINA);
    return pagina;
  }, [desde, hasta]);
  const ventas = [...(datos ?? []), ...extra];
  const monto = redondear(ventas.reduce((s, v) => s + v.total, 0));

  const cargarMas = async () => {
    const pagina = await api.ventas.listar({ desde, hasta, limite: POR_PAGINA, antes_de: ventas.at(-1)!.venta_id });
    setExtra([...extra, ...pagina]);
    setHayMas(pagina.length === POR_PAGINA);
  };

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
      <Encabezado titulo="Historial de ventas" subtitulo={esPropietario ? 'Consulta ventas registradas' : 'Consulta tus ventas registradas'}>
        {esPropietario && <Link to="/reportes" className="boton boton--texto boton--compacto"><FileText size={18} />Reporte</Link>}
      </Encabezado>
      <form onSubmit={buscarFolio}>
        <Campo etiqueta="Buscar por N.º de venta" inputMode="numeric" placeholder="V-00035" value={folio} error={errorFolio}
               icono={<Search size={18} />} onChange={(e) => { setFolio(e.target.value); setErrorFolio(undefined); }} />
      </form>
      <div className="reticula-2">
        <Campo etiqueta="Desde" type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
        <Campo etiqueta="Hasta" type="date" value={hasta} min={desde} max={hoyLima()} onChange={(e) => e.target.value && setHasta(e.target.value)} />
      </div>
      <div className="reticula-3">
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Ventas</div><div className="kpi__valor kpi__valor--chico">{ventas.length}{hayMas && '+'}</div></div>
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Monto</div><div className="kpi__valor kpi__valor--chico" style={{ fontSize: 16 }}>{soles(monto)}</div></div>
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Ticket prom.</div>
          <div className="kpi__valor kpi__valor--chico" style={{ fontSize: 16 }}>{soles(ventas.length ? redondear(monto / ventas.length) : 0)}</div></div>
      </div>

      {cargando ? <Cargando /> : error ? <Aviso tipo="error">{error}</Aviso> : (
        <div className="lista">
          {!ventas.length && <div className="vacio">No hay ventas en estas fechas.</div>}
          {ventas.map((v) => (
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
          {ventas.length > 0 && <p className="ayuda centro">Mostrando {ventas.length} {ventas.length === 1 ? 'venta' : 'ventas'}</p>}
          {hayMas && <button className="boton boton--secundario" onClick={cargarMas}>Cargar más</button>}
        </div>
      )}
    </Pantalla>
  );
}
