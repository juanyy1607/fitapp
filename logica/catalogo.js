// @ts-check
/**
 * logica/catalogo.js — Carga los archivos de datos/ y los deja listos para usar.
 *
 * Todas las rutas son relativas ('datos/…', nunca '/datos/…'). Eso no es un detalle de
 * estilo: es lo que permite que mañana esto ande empaquetado con Capacitor, y también que
 * funcione publicado en una subcarpeta como /fitapp/.
 *
 * Si un archivo está mal, explota acá con un mensaje que se entiende, en vez de dejar que
 * el error aparezca tres pantallas más adelante como "undefined".
 */

/** @typedef {import('../tipos.js').Ejercicio} Ejercicio */
/** @typedef {import('../tipos.js').Rutina} Rutina */
/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */

/**
 * @typedef {Object} Catalogo
 * @property {Reglas} reglas
 * @property {Ejercicio[]} ejercicios
 * @property {Rutina[]} rutinas
 * @property {Map<string, Ejercicio>} ejercicioPorId
 * @property {Map<string, Rutina>} rutinaPorId
 */

/**
 * @param {string} ruta
 * @returns {Promise<any>}
 */
async function traer(ruta) {
  let respuesta;
  try {
    respuesta = await fetch(ruta);
  } catch (e) {
    throw new Error('No se pudo leer ' + ruta + '. Si es la primera vez que abrís la app, ' +
                    'necesitás conexión una vez para que se guarde.');
  }
  if (!respuesta.ok) throw new Error('Falta el archivo ' + ruta + ' (respondió ' + respuesta.status + ').');
  try {
    return await respuesta.json();
  } catch (e) {
    throw new Error(ruta + ' no es un JSON válido. Corré "node tools/validar-datos.mjs" para ver qué está mal.');
  }
}

/**
 * Carga los tres archivos de datos y arma los índices para buscar rápido.
 * @returns {Promise<Catalogo>}
 */
export async function cargarCatalogo() {
  const [reglas, ejercicios, rutinas] = await Promise.all([
    traer('datos/reglas.json'),
    traer('datos/ejercicios.json'),
    traer('datos/rutinas.json')
  ]);

  if (!Array.isArray(ejercicios)) throw new Error('datos/ejercicios.json tendría que ser una lista.');
  if (!Array.isArray(rutinas)) throw new Error('datos/rutinas.json tendría que ser una lista.');
  if (!reglas || !reglas.equipos) throw new Error('datos/reglas.json no tiene la sección "equipos".');

  /** @type {Map<string, Ejercicio>} */
  const ejercicioPorId = new Map(ejercicios.map((e) => [e.id, e]));
  /** @type {Map<string, Rutina>} */
  const rutinaPorId = new Map(rutinas.map((r) => [r.id, r]));

  return { reglas, ejercicios, rutinas, ejercicioPorId, rutinaPorId };
}

/**
 * El nombre para mostrar de un ejercicio. Si el id no existe, devuelve algo legible en vez
 * de romper la pantalla: el usuario en el gimnasio no puede hacer nada con un error.
 * @param {Catalogo} catalogo
 * @param {string} ejercicioId
 * @returns {string}
 */
export function nombreDeEjercicio(catalogo, ejercicioId) {
  const e = catalogo.ejercicioPorId.get(ejercicioId);
  return e ? e.nombre : '(ejercicio desconocido: ' + ejercicioId + ')';
}

/**
 * La clave de equipo de un ejercicio, que es lo que necesita la lógica de progresión.
 * @param {Catalogo} catalogo
 * @param {string} ejercicioId
 * @returns {string}
 */
export function equipoDeEjercicio(catalogo, ejercicioId) {
  const e = catalogo.ejercicioPorId.get(ejercicioId);
  return e ? e.equipo : 'desconocido';
}

/**
 * Busca un día dentro de una rutina.
 * @param {Catalogo} catalogo
 * @param {string} rutinaId
 * @param {string} diaId
 * @returns {{rutina: Rutina, dia: import('../tipos.js').DiaRutina}|null}
 */
export function buscarDia(catalogo, rutinaId, diaId) {
  const rutina = catalogo.rutinaPorId.get(rutinaId);
  if (!rutina) return null;
  const dia = rutina.dias.find((d) => d.id === diaId);
  return dia ? { rutina, dia } : null;
}

/**
 * Segundos de descanso ENTRE SERIES del mismo ejercicio, con el valor por defecto de
 * reglas.json como red por si la fila vino sin ese dato.
 * @param {Catalogo} catalogo
 * @param {EjercicioPlanificado} plan
 * @returns {number}
 */
export function descansoDe(catalogo, plan) {
  return plan.descansoSeg > 0 ? plan.descansoSeg : catalogo.reglas.descansoPorDefectoSeg;
}

/**
 * Segundos de descanso al TERMINAR un ejercicio, antes de pasar al siguiente.
 *
 * Es un descanso distinto y más largo que el de entre series: cambiás de aparato, capás
 * que tenés que esperar que se desocupe, y el músculo que viene es otro. Antes esto no
 * existía y el usuario quedaba con el descanso corto entre ejercicios distintos.
 * @param {Catalogo} catalogo
 * @param {EjercicioPlanificado} plan
 * @returns {number}
 */
export function descansoDespuesDe(catalogo, plan) {
  if (plan.descansoDespuesSeg && plan.descansoDespuesSeg > 0) return plan.descansoDespuesSeg;
  return catalogo.reglas.descansoEntreEjerciciosSeg || catalogo.reglas.descansoPorDefectoSeg;
}
