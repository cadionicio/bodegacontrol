/**
 * Prompt 9 · Escanear código. La cámara solo captura el identificador; el producto se busca en el
 * catálogo de la API. Si no existe, se conserva el código y se ofrece búsqueda manual.
 */
import { Camera, LoaderCircle, ScanBarcode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../api/cliente';
import { api } from '../api/recursos';
import { Aviso, Campo } from '../componentes/controles';
import { Pantalla } from '../componentes/estructura';
import { borrador } from '../estado/borrador';
import { useSesion } from '../estado/sesion';
import { dejarCodigo, escanearCodigo, escanerDisponible } from '../utilidades/escaner';

const ESQUINA = { position: 'absolute', width: 34, height: 34, borderColor: 'var(--verde)', borderStyle: 'solid' } as const;

export function Escanear() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const destino = parametros.get('destino') === 'producto' ? 'producto' : 'venta';
  const { esPropietario } = useSesion();
  const [codigo, setCodigo] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'error' | 'info' | 'exito'; texto: string; noEncontrado?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const iniciado = useRef(false);

  const abrirCamara = async () => {
    setEstado(null);
    try {
      const leido = await escanearCodigo();
      if (leido) setCodigo(leido);
    } catch (e) {
      setEstado({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo abrir la cámara' });
    }
  };

  // En el celular se abre la cámara al entrar; en navegador queda la entrada manual.
  useEffect(() => {
    if (escanerDisponible() && !iniciado.current) { iniciado.current = true; void abrirCamara(); }
  }, []);

  const buscar = async () => {
    const valor = codigo.trim();
    if (!valor) return setEstado({ tipo: 'error', texto: 'Escanee o escriba un código' });
    if (destino === 'producto') { dejarCodigo(valor); return navegar(-1); }
    setOcupado(true);
    try {
      const producto = await api.productos.porCodigoBarras(valor);
      borrador.agregar(producto);
      navegar('/ventas', { replace: true });
    } catch (e) {
      setEstado(e instanceof ErrorApi && e.estado === 404
        ? { tipo: 'error', texto: `Código no encontrado: ${valor}. No hay un producto activo con esa etiqueta.`, noEncontrado: true }
        : { tipo: 'error', texto: mensajeDeError(e) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Pantalla titulo="Escanear código" volver={-1} navegacion={false} pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button className="boton" disabled={ocupado} onClick={buscar}>
          {ocupado && <LoaderCircle className="girando" size={18} />}{destino === 'producto' ? 'Usar código' : 'Buscar producto'}
        </button>
      </>
    }>
      <button onClick={abrirCamara} disabled={!escanerDisponible()} aria-label="Abrir cámara para escanear"
              style={{ position: 'relative', alignSelf: 'center', width: 260, height: 220, borderRadius: 12, border: 0,
                       background: 'var(--gris-fondo)', display: 'grid', placeItems: 'center', color: 'var(--gris-texto)', cursor: 'pointer' }}>
        <span style={{ ...ESQUINA, top: 10, left: 10, borderWidth: '4px 0 0 4px', borderRadius: '8px 0 0 0' }} />
        <span style={{ ...ESQUINA, top: 10, right: 10, borderWidth: '4px 4px 0 0', borderRadius: '0 8px 0 0' }} />
        <span style={{ ...ESQUINA, bottom: 10, left: 10, borderWidth: '0 0 4px 4px', borderRadius: '0 0 0 8px' }} />
        <span style={{ ...ESQUINA, bottom: 10, right: 10, borderWidth: '0 4px 4px 0', borderRadius: '0 0 8px 0' }} />
        <span className="centro" style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
          <ScanBarcode size={48} />
          {escanerDisponible() ? <span className="fila negrita texto-verde"><Camera size={18} />Tocar para escanear</span>
            : <span style={{ fontSize: 13 }}>Cámara disponible en la app Android</span>}
        </span>
      </button>
      <p className="centro texto-gris">Centra el código de barras o QR dentro del recuadro</p>

      {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
      <Campo etiqueta="Código detectado o manual" inputMode="numeric" value={codigo} placeholder="7751234567890"
             onChange={(e) => { setCodigo(e.target.value); setEstado(null); }} />
      <div className="aviso">Se buscará el código en el catálogo existente.</div>
      {estado?.noEncontrado && (
        <div className="fila envolver" style={{ justifyContent: 'center' }}>
          <Link className="boton boton--texto" to="/ventas" replace>Ingresar manualmente</Link>
          {esPropietario && <Link className="boton boton--texto" to={`/productos/nuevo?codigo_barras=${encodeURIComponent(codigo.trim())}`}>
            Registrar producto nuevo</Link>}
        </div>
      )}
    </Pantalla>
  );
}
