/** Prompt 19 · Venta pausada recuperada. Descartar exige confirmación para evitar toques accidentales. */
import { Clock } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import { Aviso, Confirmacion } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { borrador, tiempoRestante, totalBorrador, unidadesBorrador, useBorrador } from '../../estado/borrador';
import { formatoFechaHora, soles } from '../../utilidades/formato';

export function VentaPendiente() {
  const b = useBorrador();
  const navegar = useNavigate();
  const [descartar, setDescartar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!b.lineas.length) return <Navigate to="/" replace />;

  /** Se actualizan precios y stock con el catálogo actual antes de retomar (el servidor revalida al confirmar). */
  const continuar = async () => {
    setCargando(true);
    try {
      borrador.actualizarCatalogo(await api.productos.listar());
      navegar('/ventas');
    } catch (e) {
      setError(`${mensajeDeError(e)} Puede continuar igual; los precios se validarán al confirmar.`);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Pantalla titulo="Venta pendiente" volver="/" pie={
      <>
        <button className="boton boton--peligro" onClick={() => setDescartar(true)}>Descartar</button>
        <button className="boton" disabled={cargando} onClick={error ? () => navegar('/ventas') : continuar}>Continuar venta</button>
      </>
    }>
      <Encabezado titulo="Venta pendiente" subtitulo="Recuperamos tu carrito guardado" />
      <div className="aviso"><Clock size={20} color="var(--gris-texto)" />
        <div><strong>Venta pausada · {formatoFechaHora(b.actualizado_en)}</strong>Se descarta automáticamente en {tiempoRestante(b)}.</div></div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <dl className="tarjeta" style={{ margin: 0 }}>
        <h2 className="tarjeta__titulo">Resumen</h2>
        <div className="par"><dt>Cliente</dt><dd>{b.cliente?.nombre ?? 'Cliente general'}</dd></div>
        <div className="par"><dt>Tipos de producto</dt><dd>{b.lineas.length}</dd></div>
        <div className="par"><dt>Unidades</dt><dd>{unidadesBorrador(b)}</dd></div>
        <div className="par"><dt>Subtotal</dt><dd className="texto-verde">{soles(totalBorrador(b))}</dd></div>
      </dl>
      <section className="tarjeta">
        {b.lineas.map((l) => (
          <div key={l.producto_id} className="par"><dt>{l.nombre} ×{l.cantidad}</dt><dd className="num">{soles(l.precio * l.cantidad)}</dd></div>
        ))}
      </section>
      <p className="ayuda">Los productos y cantidades siguen guardados; se comprobará el stock nuevamente antes de registrar.</p>
      {descartar && (
        <Confirmacion titulo="¿Descartar la venta pausada?" peligro textoConfirmar="Descartar"
                      mensaje="Se borrará el carrito de este celular. No afecta el stock ni el historial."
                      alCancelar={() => setDescartar(false)} alConfirmar={() => { borrador.descartar(); navegar('/'); }} />
      )}
    </Pantalla>
  );
}
