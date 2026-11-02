/** Prompt 5 · Inventario: una única lista de existencias; los movimientos se abren desde cada fila. */
import { ChevronRight, PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/recursos';
import { Aviso, Cargando } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { useSesion } from '../../estado/sesion';
import { entero } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Inventario() {
  const { esPropietario } = useSesion();
  const [consulta, setConsulta] = useSearchParams();
  const soloReponer = consulta.get('filtro') === 'reponer';
  const [texto, setTexto] = useState('');
  const { datos, error, cargando } = useCarga(() => api.productos.listar(), []);
  const productos = datos ?? [];

  const visibles = useMemo(() => {
    const buscado = normalizar(texto.trim());
    return productos.filter((p) => (!soloReponer || p.por_reponer)
      && (!buscado || normalizar(p.nombre).includes(buscado) || normalizar(p.codigo).includes(buscado)));
  }, [productos, texto, soloReponer]);

  return (
    <Pantalla>
      <Encabezado titulo="Inventario" subtitulo="Consulta el stock disponible y sus movimientos" />
      <div className="reticula-3">
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Productos</div><div className="kpi__valor kpi__valor--chico">{entero(productos.length)}</div></div>
        <div className="tarjeta kpi"><div className="kpi__etiqueta">Unidades</div>
          <div className="kpi__valor kpi__valor--chico">{entero(productos.reduce((s, p) => s + p.stock, 0))}</div></div>
        <button className="tarjeta kpi tarjeta-boton" onClick={() => setConsulta(soloReponer ? {} : { filtro: 'reponer' })} aria-pressed={soloReponer}>
          <div className="kpi__etiqueta">Por reponer</div>
          <div className="kpi__valor kpi__valor--chico kpi__valor--alerta">{entero(productos.filter((p) => p.por_reponer).length)}</div>
        </button>
      </div>
      <div className="control-fila">
        <div className="control"><Search size={18} />
          <input placeholder="Buscar producto…" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar producto" />
        </div>
        <button className={`boton-icono${soloReponer ? '' : ' boton-icono--neutro'}`} aria-pressed={soloReponer}
                aria-label="Mostrar solo por reponer" onClick={() => setConsulta(soloReponer ? {} : { filtro: 'reponer' })}>
          <SlidersHorizontal size={20} /></button>
      </div>
      {esPropietario && <Link to="/inventario/entrada" className="boton boton--secundario"><PackagePlus size={18} />Registrar entrada</Link>}
      {soloReponer && <p className="ayuda">Mostrando solo productos en o bajo su stock mínimo. <button className="boton boton--texto" style={{ minHeight: 0, padding: 0 }}
        onClick={() => setConsulta({})}>Ver todos</button></p>}

      {cargando ? <Cargando /> : error ? <Aviso tipo="error">{error}</Aviso> : (
        <div className="lista">
          <div className="encabezado-lista"><span style={{ flex: 1 }}>Producto</span><span style={{ width: 70, textAlign: 'center' }}>Stock</span>
            <span style={{ width: 118, textAlign: 'right' }}>Estado</span></div>
          {!visibles.length && <div className="vacio">No hay productos que coincidan.</div>}
          {visibles.map((p) => (
            <Link key={p.producto_id} to={`/inventario/${p.producto_id}`} className="item">
              <div className="item__cuerpo"><div className="item__titulo">{p.nombre}</div><div className="item__meta">{p.codigo}</div></div>
              <div style={{ width: 70, textAlign: 'center' }} className={`negrita num ${p.por_reponer ? 'texto-rojo' : ''}`}>{p.stock} und.</div>
              <span className={`estado ${p.por_reponer ? 'estado--alerta' : 'estado--ok'}`} style={{ width: 96, justifyContent: 'center' }}>
                {p.por_reponer ? 'Por reponer' : 'Disponible'}</span>
              <ChevronRight className="chevron" size={20} />
            </Link>
          ))}
        </div>
      )}
    </Pantalla>
  );
}
