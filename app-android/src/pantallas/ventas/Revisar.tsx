/** Prompt 14 · Rechazo recuperable: se conserva todo y se marca SOLO la línea que debe corregirse. */
import { TriangleAlert } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { DetalleError } from '../../api/cliente';
import { ControlCantidad } from '../../componentes/controles';
import { Pantalla } from '../../componentes/estructura';
import { borrador, totalBorrador, useBorrador } from '../../estado/borrador';
import { nombreMetodo, soles } from '../../utilidades/formato';

export function RevisarVenta() {
  const b = useBorrador();
  const navegar = useNavigate();
  const { state } = useLocation() as { state?: { codigo: string; errores: DetalleError[] } };
  if (!b.lineas.length) return <Navigate to="/ventas" replace />;

  const rechazos = state?.errores ?? [];
  // Sin punto final: «Galletas Ritz 6 und.» no debe terminar en «und..» dentro de la oración.
  const nombre = (id: number) => (b.lineas.find((l) => l.producto_id === id)?.nombre ?? `Producto ${id}`).replace(/\.$/, '');
  const descripcion = state?.codigo === 'STOCK_INSUFICIENTE'
    ? rechazos.map((e) => `Stock insuficiente para ${nombre(Number(e.producto_id))}. Solicitadas: ${e.solicitado} · Disponibles: ${e.disponible}`)
    : rechazos.map((e) => `${nombre(Number(e.producto_id))} ya no se puede vender (${e.motivo === 'INACTIVO' ? 'desactivado' : 'no existe'}).`);

  /** Ajusta las líneas rechazadas a lo disponible (o las quita) y vuelve al cobro con los datos conservados. */
  const corregir = () => {
    for (const e of rechazos) borrador.cambiarCantidad(Number(e.producto_id), Number(e.disponible ?? 0));
    navegar('/ventas/cobro');
  };

  return (
    <Pantalla titulo="Revisar venta" volver="/ventas" pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar('/ventas')}>Volver al carrito</button>
        <button className="boton" onClick={corregir}>Corregir cantidad</button>
      </>
    }>
      <div className="aviso aviso--error" role="alert">
        <TriangleAlert size={22} />
        <div><strong>No se pudo completar la venta</strong>
          {descripcion.length ? descripcion.map((d) => <p key={d}>{d}</p>) : 'Revise las líneas marcadas.'}</div>
      </div>

      <section className="lista">
        <h2 className="seccion-titulo">Carrito conservado</h2>
        {b.lineas.map((l) => {
          const error = b.errores[l.producto_id];
          return (
            <div key={l.producto_id} className={`item${error ? ' item--error' : ''}`}>
              <div className="item__cuerpo">
                <div className="item__titulo">{l.nombre} ×{l.cantidad}</div>
                <div className={error ? 'error-campo' : 'item__meta'}>{error ?? soles(l.precio * l.cantidad)}</div>
              </div>
              {error ? <ControlCantidad valor={l.cantidad} alCambiar={(n) => borrador.cambiarCantidad(l.producto_id, n)} />
                : <span className="negrita num">{soles(l.precio * l.cantidad)}</span>}
            </div>
          );
        })}
        <div className="total" style={{ padding: '4px 4px 0' }}><span className="negrita">Total</span><span className="total__monto">{soles(totalBorrador(b))}</span></div>
      </section>

      {b.pago && (
        <details className="tarjeta tarjeta--gris">
          <summary className="negrita" style={{ cursor: 'pointer', minHeight: 32 }}>Datos del cobro conservados</summary>
          <div className="par"><dt>Método</dt><dd>{nombreMetodo(b.pago.metodo, b.pago.modalidad)}</dd></div>
          {b.pago.importe && <div className="par"><dt>Recibido</dt><dd>{soles(Number(b.pago.importe))}</dd></div>}
          {b.pago.referencia && <div className="par"><dt>Referencia</dt><dd>{b.pago.referencia}</dd></div>}
          <div className="par"><dt>Cliente</dt><dd>{b.cliente?.nombre ?? 'Cliente general'}</dd></div>
        </details>
      )}
    </Pantalla>
  );
}
