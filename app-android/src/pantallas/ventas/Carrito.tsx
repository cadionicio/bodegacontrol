/**
 * Prompt 3 · Registrar venta, paso 1 de 3. El stock que se ve es informativo: el servidor lo revalida
 * al confirmar. Todo cambio queda guardado en el borrador del celular.
 */
import { ChevronDown, CircleAlert, Pause, Plus, ScanBarcode, Search, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/recursos';
import type { Cliente, Producto } from '../../api/tipos';
import { Aviso, Cargando, ControlCantidad, ImagenProducto } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { borrador, totalBorrador, unidadesBorrador, useBorrador } from '../../estado/borrador';
import { soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function SelectorCliente() {
  const b = useBorrador();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);

  const buscar = async (valor: string) => {
    setTexto(valor);
    setResultados(valor.trim().length >= 2 ? await api.clientes.buscar(valor).catch(() => []) : []);
  };
  const elegir = (cliente: Cliente | null) => {
    borrador.fijarCliente(cliente && { cliente_id: cliente.cliente_id, nombre: cliente.nombre });
    setAbierto(false);
    setTexto('');
  };

  return (
    <div className="grupo">
      <span className="etiqueta">Cliente</span>
      <div className="control-fila">
        <button className="control" style={{ cursor: 'pointer', justifyContent: 'space-between', color: 'var(--texto)', fontSize: 16 }}
                aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          {b.cliente?.nombre ?? 'Cliente general'}<ChevronDown size={20} color="var(--gris-texto)" />
        </button>
        <button className="boton-icono" aria-label="Agregar cliente" onClick={() => navegar('/clientes/nuevo')}><UserPlus size={22} /></button>
      </div>
      {abierto && (
        <div className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="control"><Search size={18} />
            <input autoFocus placeholder="Nombre o documento" value={texto} onChange={(e) => void buscar(e.target.value)}
                   aria-label="Buscar cliente" />
          </div>
          <button className="boton boton--texto" style={{ justifyContent: 'flex-start' }} onClick={() => elegir(null)}>Cliente general</button>
          {resultados.map((c) => (
            <button key={c.cliente_id} className="boton boton--texto" style={{ justifyContent: 'space-between', color: 'var(--texto)' }}
                    onClick={() => elegir(c)}>
              {c.nombre}<span className="texto-gris">{c.numero_documento ? `${c.tipo_documento} ${c.numero_documento}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Resultados({ catalogo, texto }: { catalogo: Producto[]; texto: string }) {
  const visibles = useMemo(() => {
    const buscado = normalizar(texto.trim());
    return (buscado ? catalogo.filter((p) => normalizar(p.nombre).includes(buscado) || p.codigo.toLowerCase() === buscado
      || p.codigo_barras === texto.trim()) : catalogo).slice(0, 3);
  }, [catalogo, texto]);
  if (!visibles.length) return <p className="texto-gris">Sin coincidencias. Revise el nombre o escanee el código.</p>;
  return (
    <div className="lista">
      {visibles.map((p) => (
        <div key={p.producto_id} className="item" style={{ minHeight: 64 }}>
          <ImagenProducto producto={p} />
          <div className="item__cuerpo">
            <div className="item__titulo">{p.nombre}</div>
            <div className="item__meta">{p.codigo} · <span className="item__precio">{soles(p.precio)}</span> · Stock {p.stock}</div>
          </div>
          <button className="boton-icono" aria-label={`Agregar ${p.nombre}`} onClick={() => borrador.agregar(p)}><Plus size={22} /></button>
        </div>
      ))}
    </div>
  );
}

export function Carrito() {
  const b = useBorrador();
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const { datos: catalogo, error, cargando } = useCarga(() => api.productos.listar(), []);
  const hayLineas = b.lineas.length > 0;

  return (
    <Pantalla pie={
      <>
        <button className="boton boton--secundario" disabled={!hayLineas} onClick={() => { borrador.pausar(); navegar('/'); }}>
          <Pause size={18} />Pausar venta
        </button>
        <button className="boton" disabled={!hayLineas} onClick={() => navegar('/ventas/cobro')}>Continuar</button>
      </>
    }>
      <Encabezado titulo="Registrar venta" subtitulo="Paso 1 de 3 · Productos" />
      <SelectorCliente />

      <div className="grupo">
        <label className="etiqueta" htmlFor="buscar-producto">Buscar y agregar producto</label>
        <div className="control-fila">
          <div className="control"><Search size={18} />
            <input id="buscar-producto" placeholder="Nombre o código" value={texto} onChange={(e) => setTexto(e.target.value)} />
            {texto && <button className="cabecera__boton" style={{ width: 36, height: 36, color: 'var(--gris-texto)' }}
                              aria-label="Limpiar búsqueda" onClick={() => setTexto('')}><X size={18} /></button>}
          </div>
          <button className="boton-icono" aria-label="Escanear código de barras o QR" onClick={() => navegar('/escanear?destino=venta')}>
            <ScanBarcode size={22} />
          </button>
        </div>
      </div>
      {cargando ? <Cargando /> : error ? <Aviso tipo="error">{error}</Aviso> : <Resultados catalogo={catalogo!} texto={texto} />}

      <section className="lista">
        <h2 className="seccion-titulo">Carrito · {unidadesBorrador(b)} unidades</h2>
        {!hayLineas && <div className="vacio">Agrega productos desde la búsqueda o con el escáner.</div>}
        {b.lineas.map((l) => {
          const errorServidor = b.errores[l.producto_id];
          const superaStock = l.cantidad > l.stock;
          return (
            <div key={l.producto_id} className={`item${errorServidor ? ' item--error' : ''}`} style={{ flexWrap: 'wrap' }}>
              <div className="item__cuerpo">
                <div className="item__titulo">{l.nombre}</div>
                <div className="item__meta">{soles(l.precio)} × {l.cantidad} = <strong className="texto-verde">{soles(l.precio * l.cantidad)}</strong></div>
              </div>
              <ControlCantidad valor={l.cantidad} alCambiar={(n) => borrador.cambiarCantidad(l.producto_id, n)} />
              <button className="boton-icono boton-icono--peligro" aria-label={`Quitar ${l.nombre}`}
                      onClick={() => borrador.cambiarCantidad(l.producto_id, 0)}><Trash2 size={20} /></button>
              {(errorServidor || superaStock) && (
                <p className={errorServidor ? 'error-campo' : 'ayuda'} style={{ width: '100%' }}>
                  <CircleAlert size={14} style={{ verticalAlign: -2 }} /> {errorServidor ?? `Stock informativo: ${l.stock} und. Se validará al confirmar.`}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {hayLineas && (
        <div className="tarjeta total">
          <span className="negrita">Total preliminar</span>
          <span className="total__monto">{soles(totalBorrador(b))}</span>
        </div>
      )}
    </Pantalla>
  );
}
