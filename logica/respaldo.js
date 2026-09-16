// @ts-check
/**
 * logica/respaldo.js — Que el usuario no pierda su historial. Nunca.
 *
 * Este archivo existe porque perder el historial de alguien es el peor error posible en
 * esta app. Alguien que entrenó seis meses y pierde todo no vuelve, y con razón.
 *
 * Hay dos defensas, y hacen falta las dos:
 *
 *   1. `navigator.storage.persist()` — le pide al navegador que no borre nuestros datos
 *      cuando necesite espacio. Ayuda, pero NO es una garantía. En iPhone, Safari borra
 *      los datos de los sitios que no visitás en varios días; las apps agregadas a la
 *      pantalla de inicio quedan aparte de esa regla, pero Apple no lo documenta de
 *      forma clara y podría cambiarlo.
 *
 *   2. **Exportar.** Esto sí es una garantía, porque el archivo sale del teléfono. Por eso
 *      el botón va a la vista y no escondido en ajustes, y por eso avisamos cuando hace
 *      mucho que no se exporta.
 *
 * El día que haya nube, esto sigue siendo la red de seguridad de abajo.
 */

import { exportarTodo, importarSesiones, guardarAjuste, leerAjuste } from './almacen.js';

const CLAVE_ULTIMA_EXPORTACION = 'ultimaExportacionTs';
const DIAS_PARA_INSISTIR = 14;

/**
 * @typedef {Object} EstadoAlmacenamiento
 * @property {boolean} soportado        Si el navegador tiene la API.
 * @property {boolean} persistente      Si ya nos dieron almacenamiento persistente.
 * @property {number|null} usadoMB
 * @property {number|null} disponibleMB
 * @property {string} explicacion       Frase lista para mostrar.
 */

/**
 * Pide almacenamiento persistente y devuelve cómo quedó la cosa.
 *
 * Se llama al arrancar la app. Pedirlo dos veces no molesta: si ya está concedido,
 * devuelve true sin preguntar nada al usuario.
 * @returns {Promise<EstadoAlmacenamiento>}
 */
export async function asegurarPersistencia() {
  if (!navigator.storage || !navigator.storage.persist) {
    return {
      soportado: false, persistente: false, usadoMB: null, disponibleMB: null,
      explicacion: 'Este navegador no permite pedir almacenamiento protegido. Exportá tu historial seguido.'
    };
  }

  let persistente = false;
  try {
    persistente = await navigator.storage.persisted();
    if (!persistente) persistente = await navigator.storage.persist();
  } catch (e) {
    persistente = false;
  }

  let usadoMB = null;
  let disponibleMB = null;
  try {
    if (navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      if (typeof e.usage === 'number') usadoMB = Math.round(e.usage / 1048576 * 10) / 10;
      if (typeof e.quota === 'number') disponibleMB = Math.round(e.quota / 1048576);
    }
  } catch (e) { /* no pasa nada: es solo informativo */ }

  return {
    soportado: true,
    persistente,
    usadoMB,
    disponibleMB,
    explicacion: persistente
      ? 'Tus datos están protegidos: el sistema no los va a borrar para hacer lugar.'
      : 'El sistema no garantiza que tus datos sobrevivan. Exportá tu historial seguido.'
  };
}

/**
 * Arma el contenido del respaldo.
 * @returns {Promise<{texto: string, nombreArchivo: string, sesiones: number}>}
 */
export async function prepararRespaldo() {
  const datos = await exportarTodo();
  const fecha = new Date().toISOString().slice(0, 10);
  return {
    texto: JSON.stringify(datos, null, 2),
    nombreArchivo: 'fitapp-historial-' + fecha + '.json',
    sesiones: datos.sesiones.length
  };
}

/**
 * Exporta el historial por el camino que mejor ande en este teléfono.
 *
 * Probamos tres, en orden, porque en iPhone la descarga común falla seguido dentro de una
 * app instalada:
 *   1. Compartir (el menú nativo). Es el mejor en iPhone: podés mandarlo por WhatsApp,
 *      guardarlo en Archivos o mandártelo por mail.
 *   2. Descargar como archivo. Es lo normal en Android y en escritorio.
 *   3. Copiar al portapapeles, y si eso tampoco anda, devolver el texto para mostrarlo
 *      en pantalla y que el usuario lo copie a mano.
 *
 * @returns {Promise<{via: string, texto: string, sesiones: number}>}
 */
export async function exportarHistorial() {
  const { texto, nombreArchivo, sesiones } = await prepararRespaldo();

  // 1 · Compartir nativo, con el archivo adjunto.
  try {
    const archivo = new File([texto], nombreArchivo, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Historial de entrenamiento' });
      await marcarExportado();
      return { via: 'compartir', texto, sesiones };
    }
  } catch (e) {
    // Si el usuario cancela el menú de compartir, caemos a la descarga. No es un error.
  }

  // 2 · Descarga común.
  try {
    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    await marcarExportado();
    return { via: 'descarga', texto, sesiones };
  } catch (e) { /* seguimos */ }

  // 3 · Portapapeles.
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      await marcarExportado();
      return { via: 'portapapeles', texto, sesiones };
    }
  } catch (e) { /* seguimos */ }

  // 4 · Que lo muestre la pantalla y lo copie a mano.
  return { via: 'pantalla', texto, sesiones };
}

/**
 * Lee un respaldo y mete las sesiones que falten.
 * @param {string} texto
 * @returns {Promise<{agregadas: number, yaEstaban: number}>}
 */
export async function importarHistorial(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    throw new Error('Ese archivo no es un respaldo válido: no se pudo leer como JSON.');
  }
  if (!datos || !Array.isArray(datos.sesiones)) {
    throw new Error('Ese archivo no parece un respaldo de FitApp: no tiene una lista de sesiones.');
  }

  // Revisión mínima antes de meter nada en la base.
  const validas = datos.sesiones.filter((/** @type {any} */ s) =>
    s && typeof s.id === 'string' && typeof s.inicioTs === 'number' && Array.isArray(s.series));

  if (validas.length === 0) throw new Error('El respaldo no tiene ninguna sesión que se pueda leer.');

  return importarSesiones(validas);
}

/** @returns {Promise<void>} */
async function marcarExportado() {
  await guardarAjuste(CLAVE_ULTIMA_EXPORTACION, Date.now());
}

/**
 * Hace cuántos días que no exporta, y si conviene insistirle.
 * @param {number} [ahoraTs]
 * @returns {Promise<{ultimaTs: number|null, diasDesde: number|null, hayQueInsistir: boolean}>}
 */
export async function estadoRespaldo(ahoraTs = Date.now()) {
  const ultimaTs = await leerAjuste(CLAVE_ULTIMA_EXPORTACION, null);
  if (!ultimaTs) return { ultimaTs: null, diasDesde: null, hayQueInsistir: true };
  const diasDesde = Math.floor((ahoraTs - ultimaTs) / 86400000);
  return { ultimaTs, diasDesde, hayQueInsistir: diasDesde >= DIAS_PARA_INSISTIR };
}
