/** Prompt 8 · Registrar cliente. Al guardar vuelve a la venta con el cliente elegido y el carrito intacto. */
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../api/cliente';
import { api } from '../api/recursos';
import type { Cliente } from '../api/tipos';
import { Aviso, Campo, Selector } from '../componentes/controles';
import { Encabezado, Pantalla } from '../componentes/estructura';
import { borrador } from '../estado/borrador';

type Tipo = Cliente['tipo_documento'];
// Mismas reglas que la API y la BD: aquí solo para avisar antes de enviar.
const REGLAS: Record<Exclude<Tipo, 'NINGUNO'>, [RegExp, string]> = {
  DNI: [/^\d{8}$/, 'El DNI tiene 8 dígitos'],
  RUC: [/^(10|15|17|20)\d{9}$/, 'El RUC tiene 11 dígitos y empieza con 10, 15, 17 o 20'],
  CE: [/^[A-Za-z0-9]{4,24}$/, 'Entre 4 y 24 letras o números'],
};

export function NuevoCliente() {
  const navegar = useNavigate();
  const [datos, setDatos] = useState({ nombre: '', tipo: 'NINGUNO' as Tipo, numero: '', telefono: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof datos, valor: string) => {
    setDatos({ ...datos, [campo]: valor });
    setErrores({ ...errores, [campo]: '' }); // corregir un campo no borra los errores de los demás
  };

  const guardar = async () => {
    const nuevos: Record<string, string> = {};
    if (!datos.nombre.trim()) nuevos.nombre = 'Ingrese el nombre o razón social';
    if (datos.tipo !== 'NINGUNO' && !REGLAS[datos.tipo][0].test(datos.numero.trim())) nuevos.numero = REGLAS[datos.tipo][1];
    if (datos.telefono && !/^\+?\d{6,14}$/.test(datos.telefono.trim())) nuevos.telefono = 'Solo números (6 a 14), con + opcional';
    setErrores(nuevos);
    if (Object.values(nuevos).some(Boolean)) return;
    setEnviando(true);
    setGeneral(null);
    try {
      const cliente = await api.clientes.crear({
        nombre: datos.nombre.trim(), tipo_documento: datos.tipo,
        numero_documento: datos.tipo === 'NINGUNO' ? null : datos.numero.trim(), telefono: datos.telefono.trim() || null,
      });
      borrador.fijarCliente({ cliente_id: cliente.cliente_id, nombre: cliente.nombre });
      navegar(-1);
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'CLIENTE_DUPLICADO') setErrores({ numero: 'Ya existe un cliente con ese documento' });
      else setGeneral(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla titulo="Nuevo cliente" volver={-1} pie={
      <>
        <button className="boton boton--secundario" onClick={() => navegar(-1)}>Cancelar</button>
        <button className="boton" disabled={enviando} onClick={guardar}>
          {enviando && <LoaderCircle className="girando" size={18} />}Validar y guardar
        </button>
      </>
    }>
      <Encabezado titulo="Registrar cliente" subtitulo="Puedes continuar con Cliente general si no necesitas identificarlo." />
      {general && <Aviso tipo="error">{general}</Aviso>}
      <Campo etiqueta="Nombre o razón social" autoFocus value={datos.nombre} maxLength={140}
             onChange={(e) => cambiar('nombre', e.target.value)} error={errores.nombre} />
      <Selector etiqueta="Tipo de documento" valor={datos.tipo} alCambiar={(v) => setDatos({ ...datos, tipo: v as Tipo, numero: '' })}
                opciones={[['NINGUNO', 'Sin documento'], ['DNI', 'DNI'], ['RUC', 'RUC'], ['CE', 'Carné de extranjería']]} />
      {datos.tipo !== 'NINGUNO' && (
        <Campo etiqueta="Número de documento" inputMode={datos.tipo === 'CE' ? 'text' : 'numeric'} value={datos.numero}
               maxLength={24} onChange={(e) => cambiar('numero', e.target.value)} error={errores.numero}
               ayuda={REGLAS[datos.tipo][1]} />
      )}
      <Campo etiqueta={<>Teléfono <small>(opcional)</small></>} type="tel" inputMode="tel" value={datos.telefono}
             onChange={(e) => cambiar('telefono', e.target.value)} error={errores.telefono} ayuda="Ejemplo: 987654321" />
    </Pantalla>
  );
}
