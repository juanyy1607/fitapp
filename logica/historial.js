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

    // El botón de esfuerzo se pregunta una sola vez por ejercicio, en la última serie.
    // Buscamos de atrás para adelante la última que lo tenga, por si en alguna sesión
    // vieja quedó sin responder.
    let esfuerzo;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].esfuerzo) { esfuerzo = series[i].esfuerzo; break; }
    }

    intentos.push({
      fechaTs: sesion.inicioTs,
      pesoKg,
      reps: series.filter((s) => s.pesoKg === pesoKg).map((s) => s.reps),
      esfuerzo
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
 *
 * **Los unilaterales cuentan doble.** La convención del proyecto es que el usuario anota
 * el peso de UNA mancuerna o UN lado, nunca la suma: si hace zancadas con 20 kg en cada
 * mano, anota 20. Eso es lo que dice la mancuerna y lo que la gente tiene en la cabeza, y
 * evita hacer cuentas con las manos transpiradas. Pero para el volumen hay que contar los
 * dos lados, porque el trabajo total fue el doble.
 *
 * @param {Sesion} sesion
 * @param {Set<string>} [unilaterales]  Ids de ejercicios marcados es_unilateral.
 * @returns {number}
 */
export function volumenTotal(sesion, unilaterales) {
  const total = sesion.series.reduce((suma, s) => {
    const lados = unilaterales && unilaterales.has(s.ejercicioId) ? 2 : 1;
    return suma + s.pesoKg * s.reps * lados;
  }, 0);
  return Math.round(total * 10) / 10;
}

/**
 * Los datos de una sesión listos para mostrar en la lista de historial.
 * @param {Sesion} sesion
 * @param {Set<string>} [unilaterales]
 * @returns {{id: string, inicioTs: number, duracionMin: number|null, series: number, ejercicios: number, volumenKg: number, terminada: boolean}}
 */
export function resumenSesion(sesion, unilaterales) {
  const ejercicios = new Set(sesion.series.map((s) => s.ejercicioId));
  const terminada = sesion.finTs !== null && sesion.finTs !== undefined;
  return {
    id: sesion.id,
    inicioTs: sesion.inicioTs,
    duracionMin: terminada ? Math.round((/** @type {number} */ (sesion.finTs) - sesion.inicioTs) / 60000) : null,
    series: sesion.series.length,
    ejercicios: ejercicios.size,
    volumenKg: volumenTotal(sesion, unilaterales),
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

/**
 * ¿La sesión completó todas las series que pedía el plan?
 *
 * Sirve para la etiqueta "INCOMPLETO" del historial. No es un reproche: es información.
 * Una sesión corta sigue siendo una sesión, y marcarla distinto evita que el usuario mire
 * su historial y no entienda por qué una tiene menos volumen que las otras.
 *
 * @param {Sesion} sesion
 * @param {import('../tipos.js').EjercicioPlanificado[]} plan
 * @returns {boolean}
 */
export function sesionCompleta(sesion, plan) {
  if (!plan || plan.length === 0) return true;
  return plan.every((p) => {
    const hechas = sesion.series.filter((s) => s.ejercicioId === p.ejercicioId).length;
    return hechas >= p.series;
  });
}

/**
 * ¿En esta sesión superó su mejor marca en algún ejercicio?
 *
 * Solo cuenta si ya había historial de ese ejercicio: la primera vez que hacés algo no es
 * un récord, es simplemente la primera vez. Marcar eso como récord vaciaría la etiqueta de
 * significado en la primera semana, que es justo cuando más importa que signifique algo.
 *
 * @param {Sesion} sesion
 * @param {Sesion[]} sesionesPrevias       Solo las terminadas y anteriores a esta.
 * @param {Set<string>} [ejerciciosInvertidos]  Ids donde MENOS es mejor (los asistidos).
 * @returns {boolean}
 */
export function esRecord(sesion, sesionesPrevias, ejerciciosInvertidos) {
  const previas = sesionesPrevias.filter((s) => s.inicioTs < sesion.inicioTs);

  const ejerciciosDeHoy = new Set(sesion.series.map((s) => s.ejercicioId));

  for (const ejercicioId of ejerciciosDeHoy) {
    const invertido = !!(ejerciciosInvertidos && ejerciciosInvertidos.has(ejercicioId));

    const pesosPrevios = previas
      .flatMap((s) => s.series)
      .filter((s) => s.ejercicioId === ejercicioId)
      .map((s) => s.pesoKg);

    if (pesosPrevios.length === 0) continue;   // primera vez: no es récord

    const pesosHoy = sesion.series.filter((s) => s.ejercicioId === ejercicioId).map((s) => s.pesoKg);

    if (invertido) {
      // En un asistido, el récord es haber necesitado MENOS ayuda que nunca.
      if (Math.min(...pesosHoy) < Math.min(...pesosPrevios)) return true;
    } else {
      if (Math.max(...pesosHoy) > Math.max(...pesosPrevios)) return true;
    }
  }
  return false;
}

/**
 * Los siete días de la semana en curso, para la tira del historial.
 *
 * La semana arranca el lunes, como se cuenta acá. Devuelve siempre siete elementos, en
 * orden, con la inicial del día y si entrenó ese día.
 *
 * @param {Sesion[]} sesiones
 * @param {number} [hoyTs]
 * @returns {Array<{inicial: string, entrenado: boolean, esHoy: boolean, esFuturo: boolean}>}
 */
export function semanaEntrenada(sesiones, hoyTs = Date.now()) {
  const INICIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const hoy = new Date(hoyTs);
  hoy.setHours(0, 0, 0, 0);

  // getDay() devuelve 0 para domingo; lo corremos para que el lunes sea el 0.
  const diaDeLaSemana = (hoy.getDay() + 6) % 7;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - diaDeLaSemana);

  const entrenados = new Set(
    sesionesTerminadas(sesiones).map((s) => new Date(s.inicioTs).toDateString())
  );

  return INICIALES.map((inicial, i) => {
    const dia = new Date(lunes);
    dia.setDate(lunes.getDate() + i);
    return {
      inicial,
      entrenado: entrenados.has(dia.toDateString()),
      esHoy: i === diaDeLaSemana,
      esFuturo: i > diaDeLaSemana
    };
  });
}
