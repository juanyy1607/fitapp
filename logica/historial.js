// @ts-check
/**
 * logica/historial.js — Cuentas sobre las sesiones ya guardadas.
 *
 * Todo lo de acá son funciones puras: entran datos, salen datos, no tocan la base ni la
 * pantalla. Eso es a propósito. IndexedDB no existe en Node, así que si mezclara las dos
 * cosas no podría testear nada. Separadas, esto se testea entero con `node --test` y lo
 * otro queda reducido a plomería sin decisiones.
 *
 * La pieza importante es `intentosDeEjercicio`: traduce las sesiones guardadas a la forma
 * que come la lógica de progresión.
 */

/** @typedef {import('../tipos.js').Sesion} Sesion */
/** @typedef {import('../tipos.js').SerieRegistrada} SerieRegistrada */
/** @typedef {import('../tipos.js').IntentoEjercicio} IntentoEjercicio */

/**
 * Las sesiones terminadas, de la más reciente a la más vieja.
 *
 * La sesión en curso queda afuera: todavía la estás haciendo, no es historial.
 * @param {Sesion[]} sesiones
 * @returns {Sesion[]}
 */
export function sesionesTerminadas(sesiones) {
  return sesiones
    .filter((s) => s.finTs !== null && s.finTs !== undefined)
    .sort((a, b) => b.inicioTs - a.inicioTs);
}

/**
 * La sesión que quedó abierta, si hay alguna.
 *
 * Pasa seguido: el usuario cierra la app en el medio del entrenamiento. Al volver
 * queremos ofrecerle seguir donde estaba en vez de perderle los datos.
 * @param {Sesion[]} sesiones
 * @returns {Sesion|null}
 */
export function sesionEnCurso(sesiones) {
  const abiertas = sesiones
    .filter((s) => s.finTs === null || s.finTs === undefined)
    .sort((a, b) => b.inicioTs - a.inicioTs);
  return abiertas[0] || null;
}

/**
 * El peso con el que de verdad se hizo el ejercicio en una sesión.
 *
 * Hace falta porque el usuario no siempre usa el mismo peso en todas las series: puede
 * hacer 40, 40 y bajar a 35 en la última porque no le dio. ¿Cuál fue "el peso de hoy"?
 *
 * Tomamos el que más se repite, y si hay empate, el más pesado. Con 40, 40, 35 el peso
 * del día es 40 y solo cuentan las dos series a 40. Eso hace que la progresión lo tome
 * como rango no completado, que es exactamente lo correcto: si bajaste en la última
 * serie, no completaste.
 *
 * @param {SerieRegistrada[]} series
 * @returns {number}
 */
export function pesoPredominante(series) {
  if (series.length === 0) return 0;

  /** @type {Map<number, number>} */
  const cuenta = new Map();
  for (const s of series) cuenta.set(s.pesoKg, (cuenta.get(s.pesoKg) || 0) + 1);

  let mejorPeso = series[0].pesoKg;
  let mejorCuenta = 0;
  for (const [peso, veces] of cuenta) {
    if (veces > mejorCuenta || (veces === mejorCuenta && peso > mejorPeso)) {
      mejorPeso = peso;
      mejorCuenta = veces;
    }
  }
  return mejorPeso;
}

/**
 * Traduce las sesiones guardadas a la forma que necesita la lógica de progresión.
 *
 * Devuelve un intento por sesión, de la más reciente a la más vieja.
 * @param {Sesion[]} sesiones
 * @param {string} ejercicioId
 * @returns {IntentoEjercicio[]}
 */
export function intentosDeEjercicio(sesiones, ejercicioId) {
  /** @type {IntentoEjercicio[]} */
  const intentos = [];

  for (const sesion of sesionesTerminadas(sesiones)) {
    const series = sesion.series
      .filter((s) => s.ejercicioId === ejercicioId)
      .sort((a, b) => a.numero - b.numero);

    if (series.length === 0) continue;

    const pesoKg = pesoPredominante(series);
    intentos.push({
      fechaTs: sesion.inicioTs,
      pesoKg,
      reps: series.filter((s) => s.pesoKg === pesoKg).map((s) => s.reps)
    });
  }

  return intentos;
}

/**
 * El último peso usado en cada ejercicio, para precargar la pantalla de carga.
 *
 * Esto es lo que hace que registrar una serie sea un toque en vez de cuatro: si la semana
 * pasada hiciste 40 kg por 10, aparece 40 × 10 ya escrito.
 * @param {Sesion[]} sesiones
 * @returns {Map<string, {pesoKg: number, reps: number, fechaTs: number}>}
 */
export function ultimoPorEjercicio(sesiones) {
  /** @type {Map<string, {pesoKg: number, reps: number, fechaTs: number}>} */
  const mapa = new Map();

  // De la más vieja a la más nueva, así lo último que se escribe es lo más reciente.
  for (const sesion of sesionesTerminadas(sesiones).reverse()) {
    for (const serie of sesion.series) {
      mapa.set(serie.ejercicioId, {
        pesoKg: serie.pesoKg,
        reps: serie.reps,
        fechaTs: sesion.inicioTs
      });
    }
  }
  return mapa;
}

/**
 * Kilos totales movidos en una sesión: peso por repeticiones, sumado.
 *
 * Es la medida más simple de "cuánto trabajaste hoy" y sirve para comparar sesiones.
 * El peso corporal cuenta 0 kg, que es una limitación conocida y está bien por ahora.
 * @param {Sesion} sesion
 * @returns {number}
 */
export function volumenTotal(sesion) {
  const total = sesion.series.reduce((suma, s) => suma + s.pesoKg * s.reps, 0);
  return Math.round(total * 10) / 10;
}

/**
 * Los datos de una sesión listos para mostrar en la lista de historial.
 * @param {Sesion} sesion
 * @returns {{id: string, inicioTs: number, duracionMin: number|null, series: number, ejercicios: number, volumenKg: number, terminada: boolean}}
 */
export function resumenSesion(sesion) {
  const ejercicios = new Set(sesion.series.map((s) => s.ejercicioId));
  const terminada = sesion.finTs !== null && sesion.finTs !== undefined;
  return {
    id: sesion.id,
    inicioTs: sesion.inicioTs,
    duracionMin: terminada ? Math.round((/** @type {number} */ (sesion.finTs) - sesion.inicioTs) / 60000) : null,
    series: sesion.series.length,
    ejercicios: ejercicios.size,
    volumenKg: volumenTotal(sesion),
    terminada
  };
}

/**
 * Cuántos días distintos entrenó en los últimos N días.
 *
 * Es el número que de verdad importa para la retención: los usuarios que registran 5 o más
 * días en su primera semana retienen 82% a 90 días; los que registran 0 o 1, 12%.
 * @param {Sesion[]} sesiones
 * @param {number} dias
 * @param {number} [ahoraTs]
 * @returns {number}
 */
export function diasEntrenadosEnLosUltimos(sesiones, dias, ahoraTs = Date.now()) {
  const desde = ahoraTs - dias * 24 * 60 * 60 * 1000;
  const fechas = new Set();
  for (const s of sesionesTerminadas(sesiones)) {
    if (s.inicioTs < desde) continue;
    fechas.add(new Date(s.inicioTs).toDateString());
  }
  return fechas.size;
}
