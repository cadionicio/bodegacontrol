import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './': Capacitor sirve los archivos desde el sistema de archivos del APK, no desde la raíz de un dominio.
export default defineConfig({ plugins: [react()], base: './', build: { target: 'es2022' } });
