/**
 * Prompt 10 · Nuevo producto / edición. Valida en el celular para avisar rápido y la API vuelve a validar;
 * los errores del servidor se muestran en el campo afectado sin borrar lo escrito.
 */
import { Camera, Info, LoaderCircle, ScanBarcode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../../api/cliente';
import { api } from '../../api/recursos';
import type { DatosProducto, Producto } from '../../api/tipos';
import { Aviso, Campo, Cargando } from '../../componentes/controles';
import { Encabezado, Pantalla } from '../../componentes/estructura';
import { tomarCodigo } from '../../utilidades/escaner';
import { comprimirFoto } from '../../utilidades/imagen';

interface Formulario { codigo: string; nombre: string; precio: string; costo: string; stock_inicial: string; stock_minimo: string; codigo_barras: string }
const VACIO: Formulario = { codigo: '', nombre: '', precio: '', costo: '', stock_inicial: '0', stock_minimo: '5', codigo_barras: '' };
// Conserva lo escrito mientras el usuario va a escanear el código de barras y vuelve.
let formularioEnCurso: { clave: string; datos: Formulario; foto: File | null } | null = null;

const desdeProducto = (p: Producto): Formulario => ({
  codigo: p.codigo, nombre: p.nombre, precio: p.precio.toFixed(2), costo: p.costo == null ? '' : p.costo.toFixed(2),
  stock_inicial: '0', stock_minimo: String(p.stock_minimo), codigo_barras: p.codigo_barras ?? '',
});
/** Propone el siguiente código correlativo (P0009) a partir del catálogo completo. */
const siguienteCodigo = (productos: Producto[]) =>
  `P${String(Math.max(0, ...productos.map((p) => Number(/^P(\d+)$/.exec(p.codigo)?.[1] ?? 0))) + 1).padStart(4, '0')}`;
const decimal = (t: string) => Number(t.replace(',', '.'));

function validar(f: Formulario, nuevo: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(f.codigo.trim().toUpperCase())) e.codigo = 'De 2 a 32 letras, números, guion o guion bajo';
  if (!f.nombre.trim()) e.nombre = 'Ingrese el nombre del producto';
  if (!(decimal(f.precio) > 0) || !/^\d+([.,]\d{1,2})?$/.test(f.precio.trim())) e.precio = 'Precio mayor a 0, con hasta 2 decimales';
  if (f.costo.trim() && !/^\d+([.,]\d{1,2})?$/.test(f.costo.trim())) e.costo = 'Número con hasta 2 decimales, o déjelo vacío';
  if (nuevo && !/^\d+$/.test(f.stock_inicial.trim())) e.stock_inicial = 'Cantidad entera mayor o igual a 0';
  if (!/^\d+$/.test(f.stock_minimo.trim())) e.stock_minimo = 'Cantidad entera mayor o igual a 0';
  if (f.codigo_barras.trim() && !/^[A-Za-z0-9._-]{4,64}$/.test(f.codigo_barras.trim())) e.codigo_barras = 'Entre 4 y 64 caracteres sin espacios';
  return e;
}

export function FormularioProducto() {
  const { id } = useParams();
  const nuevo = !id;
  const clave = id ?? 'nuevo';
  const navegar = useNavigate();
  const [consulta] = useSearchParams();
  const restaurado = formularioEnCurso?.clave === clave ? formularioEnCurso : null;
  const [f, setF] = useState<Formulario>(restaurado?.datos ?? VACIO);
  const [foto, setFoto] = useState<File | null>(restaurado?.foto ?? null);
  const [original, setOriginal] = useState<Producto | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!restaurado);
  const [enviando, setEnviando] = useState(false);
  const selectorFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    formularioEnCurso = null;
    const escaneado = tomarCodigo();
    if (escaneado) setF((actual) => ({ ...actual, codigo_barras: escaneado }));
    if (restaurado && nuevo) return;
    (async () => {
      try {
        if (nuevo) {
          const todos = await api.productos.listar({ incluir_inactivos: true });
          setF((actual) => ({ ...actual, codigo: actual.codigo || siguienteCodigo(todos), codigo_barras: actual.codigo_barras || (consulta.get('codigo_barras') ?? '') }));
        } else {
          const producto = await api.productos.obtener(Number(id));
          setOriginal(producto);
          if (!restaurado) setF(desdeProducto(producto));
        }
      } catch (e) { setGeneral(mensajeDeError(e)); } finally { setCargando(false); }
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (campo: keyof Formulario) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [campo]: e.target.value });
    setErrores({ ...errores, [campo]: '' });
  };

  const escanear = () => { formularioEnCurso = { clave, datos: f, foto }; navegar('/escanear?destino=producto'); };

  const guardar = async () => {
    const encontrados = validar(f, nuevo);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;
    const datos: DatosProducto = {
      codigo: f.codigo.trim().toUpperCase(), nombre: f.nombre.trim(), precio: decimal(f.precio),
      costo: f.costo.trim() ? decimal(f.costo) : null, stock_minimo: Number(f.stock_minimo), codigo_barras: f.codigo_barras.trim() || null,
    };
    setEnviando(true);
    setGeneral(null);
    try {
      let producto: Producto;
      if (nuevo) {
        producto = await api.productos.crear({ ...datos, stock_inicial: Number(f.stock_inicial) });
      } else {
        // PATCH solo con lo que cambió: menos riesgo de pisar ediciones de otra persona.
        const base = desdeProducto(original!);
        const cambios = Object.fromEntries(Object.entries(datos).filter(([k]) => {
          const anterior = base[k as keyof Formulario];
          const actual = f[k as keyof Formulario];
          return k === 'codigo' ? anterior !== datos.codigo : anterior.trim() !== actual.trim();
        }));
        producto = Object.keys(cambios).length ? await api.productos.editar(Number(id), cambios) : original!;
      }
      if (foto) await api.productos.subirImagen(producto.producto_id, await comprimirFoto(foto)).catch(() => undefined);
      navegar(`/productos/${producto.producto_id}`, { replace: true });
    } catch (e) {
      if (e instanceof ErrorApi) {
        const porCodigo: Record<string, [string, string]> = {
          CODIGO_DUPLICADO: ['codigo', 'Ya existe un producto con este código'],
          CODIGO_BARRAS_DUPLICADO: ['codigo_barras', 'Este código de barras ya está asignado a otro producto'],
        };
        if (porCodigo[e.codigo]) return setErrores({ [porCodigo[e.codigo][0]]: porCodigo[e.codigo][1] });
        const deCampos = Object.fromEntries(e.errores.filter((x) => x.campo).map((x) => [String(x.campo), String(x.detalle)]));
        if (Object.keys(deCampos).length) setErrores(deCampos);
      }
      setGeneral(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla titulo={nuevo ? 'Nuevo producto' : 'Editar producto'} volver={nuevo ? '/productos' : `/productos/${id}`} navegacion={false} pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button className="boton" disabled={enviando || cargando} onClick={guardar}>
          {enviando && <LoaderCircle className="girando" size={18} />}Validar y guardar
        </button>
      </>
    }>
      <Encabezado titulo={nuevo ? 'Nuevo producto' : 'Editar producto'} subtitulo="Completa los datos y valida antes de guardar" />
      {general && <Aviso tipo="error">{general}</Aviso>}
      {cargando ? <Cargando /> : (
        <>
          <Campo etiqueta="Código del producto" value={f.codigo} onChange={cambiar('codigo')} error={errores.codigo}
                 style={{ textTransform: 'uppercase' }} ayuda="Código interno de la bodega" />
          <Campo etiqueta="Nombre" value={f.nombre} maxLength={120} onChange={cambiar('nombre')} error={errores.nombre} placeholder="Azúcar rubia 1 kg" />
          <div className="reticula-2" style={{ alignItems: 'start' }}>
            <Campo etiqueta="Precio de venta (S/)" inputMode="decimal" value={f.precio} onChange={cambiar('precio')} error={errores.precio} placeholder="0.00" />
            <Campo etiqueta={<>Costo (S/) <small>opcional</small></>} inputMode="decimal" value={f.costo} onChange={cambiar('costo')} error={errores.costo} placeholder="0.00" />
          </div>
          <div className="reticula-2" style={{ alignItems: 'start' }}>
            {nuevo && <Campo etiqueta="Stock inicial (unidades)" inputMode="numeric" value={f.stock_inicial} onChange={cambiar('stock_inicial')} error={errores.stock_inicial} />}
            <Campo etiqueta="Stock mínimo" inputMode="numeric" value={f.stock_minimo} onChange={cambiar('stock_minimo')} error={errores.stock_minimo} />
          </div>
          <Campo etiqueta={<>Código de barras <small>opcional</small></>} inputMode="numeric" value={f.codigo_barras}
                 onChange={cambiar('codigo_barras')} error={errores.codigo_barras} placeholder="7751234567890"
                 lateral={<button className="boton-icono" aria-label="Escanear código de barras" onClick={escanear}><ScanBarcode size={22} /></button>} />
          {nuevo && (
            <div className="grupo">
              <span className="etiqueta">Foto <small>(opcional)</small></span>
              <button className="boton boton--secundario" onClick={() => selectorFoto.current?.click()}>
                <Camera size={18} />{foto ? `Foto lista: ${foto.name.slice(0, 24)}` : 'Tomar foto del producto'}
              </button>
              <input ref={selectorFoto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>
          )}
          {nuevo && <div className="aviso"><Info size={20} color="var(--gris-texto)" />
            <div>El stock inicial generará un movimiento de entrada para mantener trazabilidad.</div></div>}
          {!nuevo && <p className="ayuda">El stock no se edita aquí: cambia solo con reposiciones, mermas y ventas.</p>}
        </>
      )}
    </Pantalla>
  );
}
