/** Prompt 17 · Detalle de venta histórica: solo lectura, con los precios tal como se registraron. */
import { Boxes } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/recursos';
import { Aviso, Cargando } from '../../componentes/controles';
import { Pantalla } from '../../componentes/estructura';
import { useSesion } from '../../estado/sesion';
import { folioVenta, formatoFechaHora, nombreMetodo, soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

export function DetalleVentaHistorica() {
  const id = Number(useParams().id);
  const navegar = useNavigate();
  const { esPropietario } = useSesion();
  const { datos: v, error, cargando } = useCarga(() => api.ventas.obtener(id), [id]);

  return (
    <Pantalla titulo="Detalle de venta" volver={-1} pie={<button className="boton boton--secundario" onClick={() => navegar('/historial')}>Volver al historial</button>}>
      {cargando ? <Cargando /> : error || !v ? <Aviso tipo="error">{error}</Aviso> : (
        <>
          <div>
            <div className="fila entre"><h1 className="titulo-pantalla">Venta {folioVenta(v.venta_id)}</h1><span className="estado estado--ok">Completada</span></div>
            <p className="subtitulo-pantalla">{formatoFechaHora(v.registrada_en)}</p>
          </div>
          <dl className="tarjeta" style={{ margin: 0 }}>
            <div className="par"><dt>Cliente</dt><dd>{v.cliente ?? 'Cliente general'}</dd></div>
            <div className="par"><dt>Operador</dt><dd>{v.cajero}</dd></div>
            <div className="par"><dt>Método</dt><dd>{nombreMetodo(v.metodo, v.modalidad_tarjeta)}</dd></div>
            {v.metodo === 'EFECTIVO' ? (
              <><div className="par"><dt>Recibido</dt><dd>{soles(v.importe_recibido)}</dd></div>
                <div className="par"><dt>Vuelto</dt><dd>{soles(v.vuelto)}</dd></div></>
            ) : <div className="par"><dt>Referencia</dt><dd>{v.referencia_externa}</dd></div>}
          </dl>
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">Productos vendidos</h2>
            {v.detalle.map((l) => (
              <div key={l.producto_id} className="par">
                <dt style={{ color: 'var(--texto)' }}>{l.nombre} ×{l.cantidad}<br /><small className="texto-gris">{soles(l.precio_unitario)} c/u</small></dt>
                <dd className="num">{soles(l.importe)}</dd>
              </div>
            ))}
            <hr className="separador" />
            <div className="total"><span className="negrita">Total</span><span className="total__monto">{soles(v.total)}</span></div>
            {esPropietario && (
              <p className="ayuda" style={{ marginTop: 6 }}>Ganancia: {v.ganancia == null ? 'sin dato (hay productos sin costo)' : soles(v.ganancia)}</p>
            )}
          </section>
          <section className="tarjeta tarjeta--verde">
            <h2 className="tarjeta__titulo"><Boxes size={18} />Trazabilidad</h2>
            <p>{v.detalle.length} {v.detalle.length === 1 ? 'producto descontado' : 'productos descontados'} del inventario.</p>
            {v.detalle.map((l) => (
              <Link key={l.producto_id} to={`/inventario/${l.producto_id}`} className="boton boton--texto" style={{ justifyContent: 'flex-start', paddingLeft: 0 }}>
                Ver movimientos de {l.nombre}
              </Link>
            ))}
          </section>
        </>
      )}
    </Pantalla>
  );
}
