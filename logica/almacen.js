// @ts-check
/**
 * logica/almacen.js — Guardar y leer sesiones en el teléfono (IndexedDB).
 *
 * A propósito acá no hay ninguna decisión: solo guardar, leer y borrar. Todas las cuentas
 * están en historial.js, que sí se puede testear. Si algún día tenés que agregar una
 * regla, va allá, no acá.
 *
 * Por qué IndexedDB y no localStorage: localStorage tope alrededor de 5 MB, guarda solo
 * texto y bloquea la pantalla mientras escribe. Un año de entrenamientos no entra, y
 * escribir entre series haría que se trabe justo cuando el usuario está apurado.
 *
 * Base separada de la del banco de pruebas (`banco-timer`), para no mezclar.
 */

/** @typedef {import('../tipos.js').Sesion} Sesion */

const NOMBRE_DB = 'fitapp';
const VERSION_DB = 1;
const SESIONES = 'sesiones';
const AJUSTES = 'ajustes';

/** @type {Promise<IDBDatabase>|null} */
let promesaDB = null;

/**
 * Abre la base, creándola la primera vez.
 * @returns {Promise<IDBDatabase>}
 */
function abrir() {
  if (promesaDB) return promesaDB;
  promesaDB = new Promise((resolver, rechazar) => {
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESIONES)) {
        const store = db.createObjectStore(SESIONES, { keyPath: 'id' });
        store.createIndex('porInicio', 'inicioTs');
      }
      if (!db.objectStoreNames.contains(AJUSTES)) {
        db.createObjectStore(AJUSTES, { keyPath: 'clave' });
      }
    };

    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rechazar(req.error);
    req.onblocked = () => rechazar(new Error('La base quedó bloqueada por otra pestaña abierta.'));
  });
  return promesaDB;
}

/**
 * Corre una operación de escritura y espera a que el dato REALMENTE toque el disco.
 *
 * El detalle importante es esperar el evento `complete` y no el `success` de cada pedido:
 * `success` quiere decir "lo encolé", `complete` quiere decir "lo escribí". Si el usuario
 * cierra la app justo ahí, la diferencia entre esas dos cosas es perder la última serie.
 *
 * @template T
 * @param {string} nombreStore
 * @param {(store: IDBObjectStore) => T} trabajo
 * @returns {Promise<T>}
 */
function escribir(nombreStore, trabajo) {
  return abrir().then((db) => new Promise((resolver, rechazar) => {
    const tx = db.transaction(nombreStore, 'readwrite');
    let resultado;
    try {
      resultado = trabajo(tx.objectStore(nombreStore));
    } catch (e) {
      rechazar(e);
      return;
    }
    tx.oncomplete = () => resolver(/** @type {T} */ (resultado));
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error || new Error('Se canceló la escritura.'));
  }));
}

/**
 * @template T
 * @param {string} nombreStore
 * @param {(store: IDBObjectStore) => IDBRequest} trabajo
 * @returns {Promise<T>}
 */
function leer(nombreStore, trabajo) {
  return abrir().then((db) => new Promise((resolver, rechazar) => {
    const req = trabajo(db.transaction(nombreStore, 'readonly').objectStore(nombreStore));
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rechazar(req.error);
  }));
}

// ==================================================================== sesiones

/**
 * Guarda una sesión entera, pisando la versión anterior si ya existía.
 *
 * Se llama en cada serie registrada. Es barato: una sesión completa son unos pocos
 * kilobytes.
 * @param {Sesion} sesion
 * @returns {Promise<Sesion>}
 */
export function guardarSesion(sesion) {
  return escribir(SESIONES, (store) => { store.put(sesion); return sesion; });
}

/**
 * @param {string} id
 * @returns {Promise<Sesion|null>}
 */
export function obtenerSesion(id) {
  return leer(SESIONES, (store) => store.get(id)).then((s) => s || null);
}

/**
 * Todas las sesiones, de la más reciente a la más vieja.
 * @returns {Promise<Sesion[]>}
 */
export function listarSesiones() {
  return leer(SESIONES, (store) => store.getAll())
    .then((filas) => (/** @type {Sesion[]} */ (filas) || []).sort((a, b) => b.inicioTs - a.inicioTs));
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export function borrarSesion(id) {
  return escribir(SESIONES, (store) => { store.delete(id); }).then(() => undefined);
}

/**
 * @returns {Promise<number>}
 */
export function contarSesiones() {
  return leer(SESIONES, (store) => store.count());
}

// ==================================================================== ajustes

/**
 * Guarda una preferencia suelta (cuándo fue la última exportación, la rutina elegida…).
 * @param {string} clave
 * @param {any} valor
 * @returns {Promise<void>}
 */
export function guardarAjuste(clave, valor) {
  return escribir(AJUSTES, (store) => { store.put({ clave, valor }); }).then(() => undefined);
}

/**
 * @param {string} clave
 * @param {any} [porDefecto]
 * @returns {Promise<any>}
 */
export function leerAjuste(clave, porDefecto = null) {
  return leer(AJUSTES, (store) => store.get(clave))
    .then((fila) => (fila && 'valor' in fila ? fila.valor : porDefecto));
}

// ================================================================== respaldo

/**
 * Todo lo que hay guardado, para exportar.
 * @returns {Promise<{version: number, exportadoEn: string, sesiones: Sesion[]}>}
 */
export function exportarTodo() {
  return listarSesiones().then((sesiones) => ({
    version: 1,
    exportadoEn: new Date().toISOString(),
    sesiones
  }));
}

/**
 * Mete sesiones de un respaldo, sin pisar lo que ya está.
 *
 * Elegí NO pisar a propósito: si alguien importa un respaldo viejo por error, lo peor que
 * puede pasar es que no entre nada, no que se borre lo de esta semana.
 *
 * @param {Sesion[]} sesiones
 * @returns {Promise<{agregadas: number, yaEstaban: number}>}
 */
export function importarSesiones(sesiones) {
  return listarSesiones().then((existentes) => {
    const ids = new Set(existentes.map((s) => s.id));
    const nuevas = sesiones.filter((s) => s && s.id && !ids.has(s.id));
    return escribir(SESIONES, (store) => {
      for (const s of nuevas) store.put(s);
    }).then(() => ({ agregadas: nuevas.length, yaEstaban: sesiones.length - nuevas.length }));
  });
}

/**
 * Borra todo. Solo para la pantalla de ajustes, siempre con confirmación.
 * @returns {Promise<void>}
 */
export function borrarTodo() {
  return escribir(SESIONES, (store) => { store.clear(); }).then(() => undefined);
}
