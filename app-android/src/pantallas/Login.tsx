/** Prompt 1 · Inicio de sesión. Sin recuperación de contraseña (no hay servicio de correo). */
import { Eye, EyeOff, LoaderCircle, Lock, Settings, Store, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi, configurarCliente, mensajeDeError } from '../api/cliente';
import { api } from '../api/recursos';
import { Aviso, Campo } from '../componentes/controles';
import { VERSION_APP } from '../configuracion';
import { useSesion } from '../estado/sesion';

function AjustesServidor({ alCerrar }: { alCerrar: () => void }) {
  const { urlServidor, cambiarServidor } = useSesion();
  const [url, setUrl] = useState(urlServidor);
  const [estado, setEstado] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [probando, setProbando] = useState(false);

  const probar = async () => {
    setProbando(true);
    configurarCliente({ urlBase: url.trim() });
    try {
      await api.salud();
      setEstado({ tipo: 'exito', texto: 'Conexión correcta con la API y PostgreSQL.' });
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeDeError(e) });
    } finally {
      configurarCliente({ urlBase: urlServidor });
      setProbando(false);
    }
  };

  return (
    <div className="velo" role="dialog" aria-modal="true" aria-label="Servidor" onClick={alCerrar}>
      <form className="dialogo" onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => { e.preventDefault(); await cambiarServidor(url); alCerrar(); }}>
        <h2>Servidor de la API</h2>
        <Campo etiqueta="Dirección" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
               ayuda="Ejemplo: https://bodegacontrol.vercel.app" required />
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        <div className="dialogo__acciones">
          <button type="button" className="boton boton--secundario" onClick={probar} disabled={probando}>
            {probando && <LoaderCircle className="girando" size={18} />}Probar conexión
          </button>
          <button className="boton">Guardar</button>
        </div>
      </form>
    </div>
  );
}

export function Login() {
  const { iniciar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [recordar, setRecordar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await iniciar(correo, contrasena, recordar);
    } catch (falla) {
      // Mensaje único para correo o contraseña incorrectos: no revela qué cuentas existen.
      setError(falla instanceof ErrorApi && falla.estado === 401 ? 'Correo o contraseña incorrectos.' : mensajeDeError(falla));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pantalla">
      <main className="contenido" style={{ padding: '24px 20px', gap: 0 }}>
        <div className="fila entre">
          <span />
          <button className="boton-icono boton-icono--neutro" aria-label="Configurar servidor" onClick={() => setAjustes(true)}
                  style={{ border: 0 }}><Settings size={22} /></button>
        </div>
        <div className="fila" style={{ gap: 14, marginTop: 24 }}>
          <Store size={56} color="var(--verde)" strokeWidth={1.6} aria-hidden />
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>BodegaControl</div>
            <div className="texto-gris" style={{ fontSize: 14 }}>Sistema de Ventas e Inventario</div>
          </div>
        </div>

        <h1 className="titulo-pantalla" style={{ fontSize: 24, marginTop: 40 }}>Inicia sesión</h1>
        <p className="subtitulo-pantalla">Ingresa tus credenciales para continuar</p>

        <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Campo etiqueta="Usuario o correo" type="email" autoComplete="username" inputMode="email" autoFocus required
                 value={correo} onChange={(e) => setCorreo(e.target.value)} icono={<User size={18} />} placeholder="tu@correo.com" />
          <Campo etiqueta="Contraseña" type={mostrar ? 'text' : 'password'} autoComplete="current-password" required
                 value={contrasena} onChange={(e) => setContrasena(e.target.value)} icono={<Lock size={18} />}
                 sufijo={
                   <button type="button" className="cabecera__boton" style={{ color: 'var(--gris-texto)', marginRight: -10 }}
                           onClick={() => setMostrar(!mostrar)} aria-label={mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                     {mostrar ? <EyeOff size={20} /> : <Eye size={20} />}
                   </button>} />
          <label className="casilla" style={{ marginTop: -8 }}>
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />Recordar sesión
          </label>
          <button className="boton boton--ancho" disabled={enviando} style={{ marginTop: 8 }}>
            {enviando && <LoaderCircle className="girando" size={18} />}{enviando ? 'Verificando…' : 'Iniciar sesión'}
          </button>
        </form>
        <p className="centro texto-gris" style={{ marginTop: 'auto', paddingTop: 48, fontSize: 12.5 }}>BodegaControl v{VERSION_APP}</p>
      </main>
      {ajustes && <AjustesServidor alCerrar={() => setAjustes(false)} />}
    </div>
  );
}
