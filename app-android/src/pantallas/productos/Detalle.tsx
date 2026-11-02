/**
 * Prompt 11 · Detalle de producto (solo lectura). Editar abre otro formulario; desactivar exige confirmación
 * y conserva ventas y movimientos. La foto se toma con la cámara y se comprime antes de subirla.
 */
import { Camera, History, LoaderCircle, PackageMinus, PackagePlus, Pencil, Power } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import { Aviso, Cargando, Confirmacion, ImagenProducto } from '../../componentes/controles';
import { Pantalla } from '../../componentes/estructura';
import { useSesion } from '../../estado/sesion';
import { formatoFechaHora, soles } from '../../utilidades/formato';
import { comprimirFoto } from '../../utilidades/imagen';
import { useCarga } from '../../utilidades/useCarga';

export function DetalleProducto() {
  const id = Number(useParams().id);
  const navegar = useNavigate();
  const { esPropietario } = useSesion();
  const { datos: p, error, cargando, setDatos } = useCarga(() => api.productos.obtener(id), [id]);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const selectorFoto = useRef<HTMLInputElement>(null);

  const subirFoto = async (archivo?: File) => {
    if (!archivo) return;
    setSubiendo(true);
    setAviso(null);
    try {
      setDatos(await api.productos.subirImagen(id, await comprimirFoto(archivo)));
      setAviso({ tipo: 'exito', texto: 'Foto actualizada.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error && !('estado' in e) ? e.message : mensajeDeError(e) });
    } finally {
      setSubiendo(false);
      if (selectorFoto.current) selectorFoto.current.value = '';
    }
  };

  const cambiarEstado = async () => {
    try {
      if (p!.activo) await api.productos.desactivar(id); else await api.productos.editar(id, { activo: true });
      setDatos(await api.productos.obtener(id));
      setAviso({ tipo: 'exito', texto: p!.activo ? 'Producto desactivado. Su historial se conserva.' : 'Producto reactivado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDeError(e) });
    } finally {
      setConfirmar(false);
    }
  };

  return (
    <Pantalla titulo="Detalle de producto" volver="/productos">
      {cargando && !p ? <Cargando /> : error || !p ? <Aviso tipo="error">{error}</Aviso> : (
        <>
          {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
          <div className="tarjeta fila" style={{ gap: 16 }}>
            <ImagenProducto producto={p} grande />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 19, fontWeight: 700 }}>{p.nombre}</h1>
              <p className="texto-gris">Código {p.codigo}</p>
              <span className={`estado ${p.activo ? 'estado--ok' : 'estado--neutro'}`} style={{ marginTop: 6 }}>{p.activo ? 'Activo' : 'Inactivo'}</span>
              {p.por_reponer && p.activo && <span className="estado estado--alerta" style={{ marginLeft: 6 }}>Por reponer</span>}
            </div>
          </div>
          <div className="tarjeta reticula-2" style={{ rowGap: 14 }}>
            <div><div className="kpi__etiqueta">Precio</div><div className="negrita texto-verde" style={{ fontSize: 18 }}>{soles(p.precio)}</div></div>
            <div><div className="kpi__etiqueta">Stock</div><div className={`negrita ${p.por_reponer ? 'texto-rojo' : ''}`} style={{ fontSize: 18 }}>{p.stock} und.</div></div>
            <div><div className="kpi__etiqueta">Stock mínimo</div><div className="negrita">{p.stock_minimo} und.</div></div>
            {esPropietario && <div><div className="kpi__etiqueta">Costo</div><div className="negrita">{p.costo == null ? 'Sin registrar' : soles(p.costo)}</div></div>}
            <div><div className="kpi__etiqueta">Código de barras</div><div className="negrita">{p.codigo_barras ?? '—'}</div></div>
            <div><div className="kpi__etiqueta">Última actualización</div><div className="negrita" style={{ fontSize: 13.5 }}>{formatoFechaHora(p.actualizado_en)}</div></div>
          </div>

          <section className="lista">
            <h2 className="seccion-titulo">Acciones</h2>
            {esPropietario && <button className="boton boton--ancho" onClick={() => navegar(`/productos/${id}/editar`)}><Pencil size={18} />Editar datos</button>}
            <button className="boton boton--secundario boton--ancho" onClick={() => navegar(`/inventario/${id}`)}><History size={18} />Ver movimientos</button>
            {esPropietario && (
              <>
                <button className="boton boton--secundario boton--ancho" disabled={subiendo} onClick={() => selectorFoto.current?.click()}>
                  {subiendo ? <LoaderCircle className="girando" size={18} /> : <Camera size={18} />}{p.imagen_version ? 'Cambiar foto' : 'Tomar foto'}
                </button>
                <input ref={selectorFoto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void subirFoto(e.target.files?.[0])} />
                <div className="reticula-2">
                  <button className="boton boton--secundario" disabled={!p.activo} onClick={() => navegar(`/inventario/entrada?producto=${id}`)}><PackagePlus size={18} />Reponer</button>
                  <button className="boton boton--secundario" disabled={!p.stock} onClick={() => navegar(`/inventario/merma?producto=${id}`)}><PackageMinus size={18} />Merma</button>
                </div>
                <hr className="separador" />
                <button className={`boton boton--ancho ${p.activo ? 'boton--peligro' : 'boton--secundario'}`} onClick={() => setConfirmar(true)}>
                  <Power size={18} />{p.activo ? 'Desactivar producto' : 'Reactivar producto'}
                </button>
              </>
            )}
          </section>
          {confirmar && (
            <Confirmacion titulo={p.activo ? `¿Desactivar ${p.nombre}?` : `¿Reactivar ${p.nombre}?`} peligro={p.activo}
                          textoConfirmar={p.activo ? 'Desactivar' : 'Reactivar'} alCancelar={() => setConfirmar(false)} alConfirmar={cambiarEstado}
                          mensaje={p.activo ? 'Dejará de aparecer para la venta. Sus ventas y movimientos históricos se conservan.'
                            : 'Volverá a estar disponible para la venta.'} />
          )}
        </>
      )}
    </Pantalla>
  );
}
