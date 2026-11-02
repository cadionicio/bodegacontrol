// Prueba de extremo a extremo: la app (en un navegador con tamaño de celular) consume la API REST real.
// Requisitos: API en http://localhost:8000 con la base recién cargada, app en `npm run dev` y `npm i -D playwright`.
// Uso: node pruebas-e2e/recorrido.cjs   (variables opcionales: APP_URL, CAPTURAS, FOTO)
// Recorre 21 flujos: login, venta completa, rechazo por stock, pago Yape, venta pausada, resultado incierto
// sin duplicar, historial, productos, foto, inventario, reposición, merma, reportes, clientes, escáner y permisos.
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = process.env.CAPTURAS ?? 'capturas';
const APP = process.env.APP_URL ?? 'http://localhost:5173';
const FOTO = process.env.FOTO ?? require('path').join(__dirname, 'foto_prueba.jpg');
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });

(async () => {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5, locale: 'es-PE', timezoneId: 'America/Lima' });
  const p = await contexto.newPage();
  p.setDefaultTimeout(8000);
  const errores = [];
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  p.on('pageerror', (e) => errores.push('PAGEERROR ' + e.message));
  let n = 0;
  const foto = async (nombre, completa = false) => { await p.waitForTimeout(350); await p.screenshot({ path: `${DIR}/${String(++n).padStart(2, '0')}_${nombre}.png`, fullPage: completa }); };
  const paso = async (titulo, fn) => { try { await fn(); console.log('✓', titulo); } catch (e) { console.log('✗', titulo, '→', e.message.split('\n')[0]); await foto('FALLO_' + titulo.replace(/\W+/g, '_')); } };
  const boton = (texto) => p.getByRole('button', { name: texto, exact: true });
  const agregar = async (buscar, veces = 1) => {
    await p.getByLabel('Buscar y agregar producto').fill(buscar);
    for (let i = 0; i < veces; i++) await p.getByRole('button', { name: new RegExp(`^Agregar ${buscar}`) }).first().click();
    await p.getByLabel('Limpiar búsqueda').click();
  };

  await p.goto(APP + '/');
  await paso('Login visible', async () => { await p.getByText('Inicia sesión').waitFor(); await foto('login'); });
  await paso('Login con contraseña incorrecta', async () => {
    await p.getByLabel('Usuario o correo').fill('cadionicio@gmail.com');
    await p.getByLabel('Contraseña', { exact: true }).fill('mala');
    await boton('Iniciar sesión').click();
    await p.getByText('Correo o contraseña incorrectos.').waitFor();
    await foto('login_error');
  });
  await paso('Login propietario', async () => {
    await p.getByLabel('Contraseña', { exact: true }).fill('Propietario2026');
    await boton('Iniciar sesión').click();
    await p.getByText('Hola, Cesar').waitFor();
    await p.getByText('Actividad de ventas').waitFor();
    await foto('inicio_propietario', true);
  });
  await paso('Carrito con 3 productos', async () => {
    await p.getByRole('link', { name: 'Nueva venta' }).click();
    await p.getByText('Paso 1 de 3 · Productos').waitFor();
    await agregar('Coca-Cola', 2); await agregar('Inca Kola'); await agregar('Galletas Ritz');
    await p.getByText('Carrito · 4 unidades').waitFor();
    await p.getByText('S/ 14.70').waitFor();
    await foto('carrito', true);
  });
  await paso('Cobro en efectivo con vuelto', async () => {
    await boton('Continuar').click();
    await p.getByText('Paso 2 de 3 · Pago').waitFor();
    await p.getByLabel('Importe recibido (S/)').fill('20');
    await p.getByText('S/ 5.30').waitFor();
    await foto('cobro_efectivo', true);
  });
  await paso('Confirmar venta', async () => {
    await boton('Continuar').click();
    await p.getByText('Paso 3 de 3', { exact: false }).waitFor();
    await foto('confirmar');
    await boton('Confirmar venta').click();
    await p.getByText('Venta registrada correctamente').waitFor();
    await foto('venta_registrada', true);
  });
  await paso('Rechazo por stock insuficiente conserva carrito', async () => {
    await boton('Nueva venta').click();
    await agregar('Coca-Cola'); await agregar('Galletas Ritz', 9);
    await boton('Continuar').click();
    await p.getByLabel('Importe recibido (S/)').fill('50');
    await boton('Continuar').click();
    await boton('Confirmar venta').click();
    await p.getByText('No se pudo completar la venta').waitFor();
    await p.getByText(/Solicitadas: 9 · Disponibles: 7/).waitFor();
    await foto('rechazo_stock', true);
  });
  await paso('Corregir cantidad y volver a cobrar', async () => {
    await boton('Corregir cantidad').click();
    await p.getByText('Paso 2 de 3 · Pago').waitFor();
    await p.getByText('Galletas Ritz 6 und. ×7').waitFor();
  });
  await paso('Yape exige referencia y verificación', async () => {
    await p.getByRole('radio', { name: 'Yape' }).click();
    await boton('Continuar').click();
    await p.getByText('Ingrese el número de operación (mínimo 4 caracteres)').waitFor();
    await foto('cobro_yape_validacion', true);
  });
  await paso('Pausar venta y verla en Inicio', async () => {
    await boton('Volver al carrito').click();
    await boton('Pausar venta').click();
    await p.getByText('Venta pausada').waitFor();
    await foto('inicio_venta_pausada');
    await p.getByText('Venta pausada').click();
    await p.getByText('Recuperamos tu carrito guardado').waitFor();
    await foto('venta_pendiente', true);
  });
  await paso('Resultado incierto y comprobación por clave', async () => {
    await boton('Continuar venta').click();
    await boton('Continuar').click();
    await p.getByRole('radio', { name: 'Efectivo' }).click();
    await p.getByLabel('Importe recibido (S/)').fill('50');
    await boton('Continuar').click();
    // La API registra la venta pero la respuesta "se pierde": simula un corte de red tras el envío.
    await p.route('**/api/v1/ventas', async (ruta) => { if (ruta.request().method() === 'POST') { await ruta.fetch(); await ruta.abort('connectionreset'); } else await ruta.continue(); });
    await boton('Confirmar venta').click();
    await p.getByText('No pudimos confirmar el resultado de esta solicitud').waitFor();
    await foto('resultado_incierto', true);
    await p.unroute('**/api/v1/ventas');
    await boton('Comprobar estado').click();
    await p.getByText('Venta registrada correctamente').waitFor();
    await p.getByText('el reintento no la duplicó', { exact: false }).waitFor();
    await foto('incierto_resuelto_sin_duplicar', true);
  });
  await paso('Historial y detalle', async () => {
    await p.getByRole('link', { name: 'Historial' }).click();
    await p.getByText('Historial de ventas').waitFor();
    await p.getByText('V-00002').waitFor();
    await foto('historial', true);
    await p.getByText('V-00001').click();
    await p.getByText('Productos vendidos').waitFor();
    await foto('detalle_venta', true);
  });
  await paso('Productos y detalle', async () => {
    await p.getByRole('link', { name: 'Productos', exact: true }).click();
    await p.getByText('Gestión de productos').waitFor();
    await foto('productos');
    await p.getByText('Leche Gloria 1 L').click();
    await p.getByText('Detalle de producto').waitFor();
    await foto('detalle_producto', true);
  });
  await paso('Foto de producto: comprimir, subir y mostrar', async () => {
    await p.locator('input[type=file]').setInputFiles(FOTO);
    await p.getByText('Foto actualizada.').waitFor();
    await p.locator('.miniatura img').waitFor();
    const ok = await p.locator('.miniatura img').evaluate((img) => img.complete && img.naturalWidth > 0);
    if (!ok) throw new Error('La imagen no cargó');
    await foto('detalle_producto_con_foto');
  });
  await paso('Nuevo producto con validación y duplicado', async () => {
    await p.goto(APP + '/#/productos/nuevo');
    await p.getByText('Completa los datos y valida antes de guardar').waitFor();
    await p.getByLabel('Código del producto').fill('P0001');
    await p.getByLabel('Nombre').fill('Azúcar blanca 1 kg');
    await p.getByLabel('Precio de venta (S/)').fill('0');
    await boton('Validar y guardar').click();
    await p.getByText('Precio mayor a 0, con hasta 2 decimales').waitFor();
    await p.getByLabel('Precio de venta (S/)').fill('4.80');
    await boton('Validar y guardar').click();
    await p.getByText('Ya existe un producto con este código').waitFor();
    await foto('nuevo_producto_duplicado', true);
    await p.getByLabel('Código del producto').fill('P0009');
    await p.getByLabel('Stock inicial (unidades)').fill('10');
    await boton('Validar y guardar').click();
    await p.getByText('Azúcar blanca 1 kg').first().waitFor();
    await p.getByText('Código P0009').waitFor();
  });
  await paso('Inventario y movimientos', async () => {
    await p.getByRole('link', { name: 'Inventario', exact: true }).click();
    await p.getByText('Consulta el stock disponible y sus movimientos').waitFor();
    await foto('inventario', true);
    await p.getByText('Coca-Cola 500 ml').click();
    await p.getByText('Movimientos de inventario').first().waitFor();
    await foto('movimientos', true);
  });
  await paso('Reposición', async () => {
    await boton('Reponer').click();
    await p.getByLabel('Cantidad de entrada').fill('24');
    await boton('Validar y registrar').click();
    await p.getByText('Indique el comprobante', { exact: false }).waitFor();
    await foto('entrada_validacion', true);
    await p.getByLabel('Referencia (comprobante)').fill('Factura F001-245');
    await boton('Validar y registrar').click();
    await p.getByText('Entrada registrada: +24 und.', { exact: false }).waitFor();
  });
  await paso('Merma con pérdida estimada', async () => {
    await p.goto(APP + '/#/inventario/merma?producto=4');
    await p.getByLabel('Cantidad').fill('2');
    await p.getByRole('radio', { name: 'Vencido' }).click();
    await p.getByLabel(/Observación/).fill('Lote vencido 30/10');
    await p.getByText('S/ 7.80').waitFor();
    await foto('merma', true);
    await boton('Registrar merma').click();
    await boton('Registrar').click();
    await p.getByText('Merma registrada', { exact: false }).waitFor();
    await foto('merma_registrada', true);
  });
  await paso('Reportes y vista previa', async () => {
    await p.goto(APP + '/#/reportes');
    await p.getByText('Selecciona los filtros para analizar el negocio').waitFor();
    await boton('PDF directo').click();
    await p.getByText('Generado ', { exact: false }).first().waitFor();
    await foto('reportes', true);
    await p.getByRole('button', { name: 'Generar reporte' }).click();
    await p.getByText('Ventas totales').waitFor();
    await foto('vista_previa', true);
  });
  await paso('Nuevo cliente y escáner', async () => {
    await p.goto(APP + '/#/clientes/nuevo');
    await p.getByLabel('Nombre o razón social').fill('Ana Pérez');
    await p.getByLabel('Tipo de documento').selectOption('DNI');
    await p.getByLabel('Número de documento').fill('1234');
    await boton('Validar y guardar').click();
    await p.getByText('El DNI tiene 8 dígitos').first().waitFor();
    await foto('nuevo_cliente_validacion', true);
    await p.goto(APP + '/#/escanear?destino=venta');
    await p.getByLabel('Código detectado o manual').fill('0000000000000');
    await boton('Buscar producto').click();
    await p.getByText('Código no encontrado', { exact: false }).waitFor();
    await foto('escanear_no_encontrado', true);
  });
  await paso('Cajero: inicio restringido y sin costos', async () => {
    await p.goto(APP + '/#/');
    await p.getByLabel('Cerrar sesión').click();
    await p.getByLabel('Usuario o correo').fill('giancarlo@uni.pe');
    await p.getByLabel('Contraseña', { exact: true }).fill('Cajero2026');
    await boton('Iniciar sesión').click();
    await p.getByText('Hola, Giancarlo').waitFor();
    await foto('inicio_cajero', true);
    await p.goto(APP + '/#/reportes');
    await p.getByText('Hola, Giancarlo').waitFor(); // redirigido: reportes es solo del propietario
  });

  console.log('\nErrores de consola:', errores.length ? errores : 'ninguno');
  await navegador.close();
})();
