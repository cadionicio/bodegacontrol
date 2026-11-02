/** Prompt 22 · Registrar entrada (reposición). El comprobante es obligatorio para que cada entrada sea trazable. */
import { Info, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import { Aviso, Campo, Cargando, Selector } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { useCarga } from '../../utilidades/useCarga';

export function RegistrarEntrada() {
  const navegar = useNavigate();
  const [consulta] = useSearchParams();
  const { datos: productos, cargando } = useCarga(() => api.productos.listar(), []);
  const [productoId, setProductoId] = useState(consulta.get('producto') ?? '');
  const [cantidad, setCantidad] = useState('');
  const [referencia, setReferencia] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const elegido = productos?.find((p) => String(p.producto_id) === productoId);

  const registrar = async () => {
    const e: Record<string, string> = {};
    if (!elegido) e.producto = 'Seleccione un producto';
    if (!/^\d+$/.test(cantidad) || Number(cantidad) < 1 || Number(cantidad) > 100_000) e.cantidad = 'Cantidad entera mayor a 0';
    if (!referencia.trim()) e.referencia = 'Indique el comprobante (o escriba «Sin comprobante»)';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setGeneral(null);
    try {
      const resultado = await api.inventario.registrarEntrada(elegido!.producto_id, Number(cantidad), referencia.trim());
      navegar(`/inventario/${elegido!.producto_id}`, { replace: true,
        state: { aviso: `Entrada registrada: +${cantidad} und. Stock actual ${resultado.producto.stock} und.` } });
    } catch (falla) {
      if (falla instanceof ErrorApi && falla.codigo === 'PRODUCTO_INACTIVO') setErrores({ producto: falla.message });
      else setGeneral(mensajeDeError(falla));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla titulo="Registrar entrada" volver={-1} pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button className="boton" disabled={enviando} onClick={registrar}>
          {enviando && <LoaderCircle className="girando" size={18} />}Validar y registrar
        </button>
      </>
    }>
      <Encabezado titulo="Registrar entrada" subtitulo="Reposición de mercadería" />
      {general && <Aviso tipo="error">{general}</Aviso>}
      {cargando ? <Cargando /> : (
        <>
          <Selector etiqueta="Producto" valor={productoId} alCambiar={(v) => { setProductoId(v); setErrores({ ...errores, producto: '' }); }}
                    error={errores.producto}
                    opciones={[['', 'Seleccione…'], ...(productos ?? []).map((p): [string, string] => [String(p.producto_id), `${p.nombre} · ${p.codigo}`])]} />
          {elegido && <p className="ayuda" style={{ marginTop: -8 }}>Stock actual: {elegido.stock} und. · mínimo {elegido.stock_minimo} und.</p>}
          <Campo etiqueta="Cantidad de entrada" inputMode="numeric" value={cantidad} error={errores.cantidad} placeholder="0"
                 onChange={(e) => { setCantidad(e.target.value.replace(/\D/g, '')); setErrores({ ...errores, cantidad: '' }); }} />
          <Campo etiqueta="Referencia (comprobante)" value={referencia} maxLength={120} error={errores.referencia}
                 placeholder="Factura F001-123" ayuda="Factura, boleta o guía del proveedor"
                 onChange={(e) => { setReferencia(e.target.value); setErrores({ ...errores, referencia: '' }); }} />
          <div className="aviso"><Info size={20} color="var(--gris-texto)" />
            <div>El registro generará un movimiento trazable y actualizará el stock.</div></div>
        </>
      )}
    </Pantalla>
  );
}
