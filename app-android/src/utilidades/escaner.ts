/**
 * Lectura de códigos con Google ML Kit (funciona sin conexión). Solo devuelve el identificador:
 * el producto siempre se busca después en el catálogo de la API.
 */
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

export const escanerDisponible = () => Capacitor.isNativePlatform();

export async function escanearCodigo(): Promise<string | null> {
  if (!escanerDisponible()) return null;
  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) throw new Error('Este celular no admite el lector de códigos');
  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== 'granted' && camera !== 'limited') throw new Error('Se necesita permiso de cámara para escanear');
  // El módulo de Google se descarga una sola vez; la primera lectura puede tardar unos segundos.
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
  const { barcodes } = await BarcodeScanner.scan({
    formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.QrCode, BarcodeFormat.Code128],
  });
  return barcodes[0]?.rawValue?.trim() || null;
}

/** Código leído para el formulario de producto: se entrega una sola vez al volver a esa pantalla. */
let codigoPendiente: string | null = null;
export const dejarCodigo = (codigo: string) => { codigoPendiente = codigo; };
export const tomarCodigo = () => { const codigo = codigoPendiente; codigoPendiente = null; return codigo; };
