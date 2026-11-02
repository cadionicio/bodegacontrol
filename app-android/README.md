# BodegaControl — App Android (React + Capacitor)

Cliente Android que consume la API REST propia (`/api/v1`). No guarda datos de negocio en el celular: solo la
sesión y el **borrador de venta** (carrito pausado, se descarta a las 2 horas).

```
src/api/          cliente HTTP (token, tiempo límite, errores) y un método por endpoint
src/estado/       sesión (servidor configurable) y borrador de venta con clave idempotente
src/componentes/  estructura de pantalla, campos, avisos, diálogos, gráfico
src/pantallas/    Login, Inicio, ventas/, productos/, inventario/, historial/, reportes/, clientes y escáner
android/          proyecto nativo para Android Studio (generado por Capacitor)
pruebas-e2e/      recorrido automatizado de 21 flujos contra la API real
```

## Compilar el APK (Windows)

**Requisitos:** [Node.js 22 LTS](https://nodejs.org) y Android Studio (Quail 2026.1 o superior).

```powershell
cd app-android
npm ci                          # instala dependencias (incluye las librerías nativas de Capacitor)
# Opcional: editar .env con la URL de la API desplegada (VITE_API_URL=https://...vercel.app)
npm run android                 # compila la app web y la copia al proyecto Android
npx cap open android            # abre Android Studio
```

En Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**. El APK queda en
`android/app/build/outputs/apk/debug/app-debug.apk`. Para instalarlo, conecta el celular por USB con la
depuración USB activada y pulsa **Run ▶**, o copia el APK al celular y ábrelo.

> **Servidor:** la URL de la API se puede cambiar dentro de la app con el ícono ⚙ del Login (botón «Probar conexión»).
> Por seguridad, Android solo permite servidores **HTTPS** (como Vercel).

## Desarrollo en el navegador

```bash
npm run dev     # http://localhost:5173 — usa la API indicada en VITE_API_URL
```

La API debe incluir `http://localhost:5173` en `ORIGENES_CORS`.

## Permisos

| Permiso | Uso |
|---|---|
| Internet | Comunicarse con la API REST |
| Cámara | Escanear códigos de barras/QR (Google ML Kit, sin conexión) y fotografiar productos |
