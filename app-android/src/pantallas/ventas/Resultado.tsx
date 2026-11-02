/** Prompt 15 · Venta registrada: solo se muestra con la respuesta confirmada por el servidor. */
import { Boxes, CircleCheck } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/recursos';
import type { Venta } from '../../api/tipos';
import { Aviso, Cargando } from '../../componentes/controles';
import { Pantalla } from '../../componentes/estructura';
import { folioVenta, formatoFechaHora, nombreMetodo, soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

export function Comprobante({ venta }: { venta: Venta }) {
  return (
    <dl className="tarjeta" style={{ margin: 0 }}>
      <div className="par"><dt>Venta</dt><dd>{folioVenta(venta.venta_id)}</dd></div>
      <div className="par"><dt>Fecha</dt><dd>{formatoFechaHora(venta.registrada_en)}</dd></div>
      <div className="par"><dt>Cliente</dt><dd>{venta.cliente ?? 'Cliente general'}</dd></div>
      <div className="par"><dt>Método</dt><dd>{nombreMetodo(venta.metodo, venta.modalidad_tarjeta)}</dd></div>
      <div className="par"><dt>Total</dt><dd className="texto-verde num" style={{ fontSize: 18 }}>{soles(venta.total)}</dd></div>
      {venta.metodo === 'EFECTIVO' ? (
        <>
          <div className="par"><dt>Recibido</dt><dd className="num">{soles(venta.importe_recibido)}</dd></div>
          <div className="par"><dt>Vuelto</dt><dd className="num">{soles(venta.vuelto)}</dd></div>
        </>
      ) : <div className="par"><dt>Referencia</dt><dd>{venta.referencia_externa}</dd></div>}
    </dl>
  );
}

export function VentaRegistrada() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { state } = useLocation() as { state?: Venta };
  const { datos: venta, error } = useCarga(async () => state ?? api.ventas.obtener(Number(id)), [id]);

  return (
    <Pantalla titulo="Venta registrada" volver="/" pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar(`/historial/${id}`)}>Ver detalle</button>
        <button className="boton" onClick={() => navegar('/ventas')}>Nueva venta</button>
      </>
    }>
      {!venta ? (error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />) : (
        <>
          <div className="centro" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 8 }}>
            <CircleCheck size={56} color="var(--verde)" strokeWidth={1.8} aria-hidden />
            <h1 className="titulo-pantalla">Venta registrada correctamente</h1>
            <p className="subtitulo-pantalla">La operación se confirmó en el servidor</p>
          </div>
          {venta.repetida && <Aviso tipo="info">Esta venta ya estaba registrada; el reintento no la duplicó.</Aviso>}
          <Comprobante venta={venta} />
          <div className="aviso aviso--exito">
            <Boxes size={20} />
            <div><strong>Inventario actualizado</strong>
              {venta.detalle.length} {venta.detalle.length === 1 ? 'producto descontado' : 'productos descontados'}; cada salida quedó vinculada a la venta.</div>
          </div>
          <Link to="/" className="boton boton--texto" style={{ alignSelf: 'center' }}>Volver al inicio</Link>
        </>
      )}
    </Pantalla>
  );
}
