/** Prompt 4 · Gestión de productos: búsqueda, filtros por estado y tarjetas legibles (sin tabla de escritorio). */
import { ChevronRight, Pencil, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/recursos';
import { Aviso, Cargando, ImagenProducto } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { useSesion } from '../../estado/sesion';
import { soles } from '../../utilidades/formato';
import { useCarga } from '../../utilidades/useCarga';

type Filtro = 'TODOS' | 'ACTIVOS' | 'INACTIVOS';
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Productos() {
  const { esPropietario } = useSesion();
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [soloReponer, setSoloReponer] = useState(false);
  const { datos, error, cargando } = useCarga(() => api.productos.listar({ incluir_inactivos: esPropietario }), [esPropietario]);

  const productos = datos ?? [];
  const conteo = { TODOS: productos.length, ACTIVOS: productos.filter((p) => p.activo).length,
                   INACTIVOS: productos.filter((p) => !p.activo).length };
  const visibles = useMemo(() => {
    const buscado = normalizar(texto.trim());
    return productos.filter((p) => (filtro === 'TODOS' || p.activo === (filtro === 'ACTIVOS'))
      && (!soloReponer || p.por_reponer)
      && (!buscado || normalizar(p.nombre).includes(buscado) || normalizar(p.codigo).includes(buscado) || p.codigo_barras === texto.trim()));
  }, [productos, texto, filtro, soloReponer]);

  return (
    <Pantalla>
      <Encabezado titulo="Gestión de productos" subtitulo="Administra tu catálogo">
        {esPropietario && <Link to="/productos/nuevo" className="boton boton--compacto"><Plus size={18} />Nuevo</Link>}
      </Encabezado>
      <div className="control-fila">
        <div className="control"><Search size={18} />
          <input placeholder="Buscar por nombre o código" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar producto" />
        </div>
        <button className={`boton-icono${soloReponer ? '' : ' boton-icono--neutro'}`} aria-pressed={soloReponer}
                aria-label="Mostrar solo productos por reponer" onClick={() => setSoloReponer(!soloReponer)}><SlidersHorizontal size={20} /></button>
      </div>
      {esPropietario && (
        <div className="chips" role="tablist">
          {(['TODOS', 'ACTIVOS', 'INACTIVOS'] as Filtro[]).map((f) => (
            <button key={f} role="tab" aria-selected={filtro === f} className={`chip${filtro === f ? ' chip--activo' : ''}`} onClick={() => setFiltro(f)}>
              {f.charAt(0) + f.slice(1).toLowerCase()} ({conteo[f]})
            </button>
          ))}
        </div>
      )}
      {soloReponer && <p className="ayuda">Mostrando solo productos en o bajo su stock mínimo.</p>}
      {cargando ? <Cargando /> : error ? <Aviso tipo="error">{error}</Aviso> : (
        <div className="lista">
          {!visibles.length && <div className="vacio">No hay productos que coincidan.</div>}
          {visibles.map((p) => (
            <div key={p.producto_id} className="item" style={{ opacity: p.activo ? 1 : 0.65 }}>
              <Link to={`/productos/${p.producto_id}`} className="fila" style={{ flex: 1, minWidth: 0, gap: 12, color: 'inherit', textDecoration: 'none' }}>
                <ImagenProducto producto={p} />
                <div className="item__cuerpo">
                  <div className="item__titulo">{p.nombre}</div>
                  <div className="item__meta">{p.codigo}{!p.activo && ' · Inactivo'}</div>
                  <div className="item__precio">{soles(p.precio)}</div>
                </div>
                <div className="item__lado">
                  <div className={`negrita ${p.por_reponer ? 'texto-rojo' : ''}`}>{p.stock}</div>
                  <div className="item__meta">stock</div>
                </div>
              </Link>
              {esPropietario ? (
                <button className="boton-icono boton-icono--neutro" style={{ border: 0 }} aria-label={`Editar ${p.nombre}`}
                        onClick={() => navegar(`/productos/${p.producto_id}/editar`)}><Pencil size={19} /></button>
              ) : <ChevronRight className="chevron" size={20} />}
            </div>
          ))}
        </div>
      )}
    </Pantalla>
  );
}
