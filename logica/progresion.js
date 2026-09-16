// @ts-check
/**
 * logica/progresion.js — Cuánto peso sugerirle al usuario en el próximo ejercicio.
 *
 * Es el único lugar del proyecto donde un error es INVISIBLE. Si una pantalla se rompe,
 * la ves. Si esto sugiere 42,5 kg donde correspondían 45, entrenás seis semanas mal y no
 * te enterás nunca. Por eso está separado en su propio archivo, no toca la pantalla ni la
 * base de datos, y tiene tests: `node --test`.
 *
 * El esquema es "doble progresión", y los números los pone el socio en datos/reglas.json:
 *   1. Te quedás con el mismo peso hasta llegar al techo de repeticiones en TODAS las series.
 *   2. Cuando lo lográs, sube el peso y volvés al piso de repeticiones.
 *   3. Si te estancás varias sesiones seguidas, baja el peso y volvés a subir desde ahí.
 *
 * Acá no hay nada escrito sobre entrenamiento: solo se aplica lo que dicen los datos.
 */

/** @typedef {import('../tipos.js').Equipo} Equipo */
/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */
/** @typedef {import('../tipos.js').IntentoEjercicio} IntentoEjercicio */
/** @typedef {import('../tipos.js').Sugerencia} Sugerencia */

/**
 * Redondea a dos decimales.
 *
 * Hace falta porque las computadoras suman mal los decimales: 40 * 1.025 da
 * 41.000000000000006. Sin esto, la pantalla mostraría eso.
 * @param {number} n
 * @returns {number}
 */
export function redondear2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Lleva un peso cualquiera a un peso que REALMENTE se puede armar con ese equipo.
 *
 * Una barra olímpica pesa 20 kg vacía y los discos más chicos suelen ser de 1,25 kg por
 * lado, o sea 2,5 kg en total. Entonces las cargas posibles son 20, 22.5, 25… y no existe
 * el 41. Esta función toma "41" y devuelve "40" o "42.5", lo que esté más cerca.
 *
 * @param {number} pesoKg
 * @param {Equipo} equipo
 * @returns {number}
 */
export function redondearACargaPosible(pesoKg, equipo) {
  // Incremento 0 es peso corporal: no hay nada que redondear.
  if (!equipo.incrementoMinimoKg || equipo.incrementoMinimoKg <= 0) return redondear2(pesoKg);

  const pasos = Math.round((pesoKg - equipo.pesoBaseKg) / equipo.incrementoMinimoKg);
  const conPiso = Math.max(0, pasos);
  return redondear2(equipo.pesoBaseKg + conPiso * equipo.incrementoMinimoKg);
}

/**
 * ¿Completó el rango de repeticiones en todas las series?
 *
 * Exige DOS cosas: que haya hecho todas las series que pedía el plan, y que en todas
 * haya llegado al techo. Si hizo 2 de 3 series perfectas, no alcanza.
 *
 * @param {number[]} reps
 * @param {EjercicioPlanificado} plan
 * @returns {boolean}
 */
export function completoElRango(reps, plan) {
  if (!Array.isArray(reps) || reps.length < plan.series) return false;
  return reps.slice(0, plan.series).every((r) => r >= plan.repsMax);
}

/**
 * Cuántas sesiones seguidas viene fallando CON EL MISMO PESO, contando desde la más
 * reciente hacia atrás.
 *
 * Que sea "con el mismo peso" resuelve solo un caso complicado: si el usuario bajó el
 * peso por su cuenta, la cuenta se reinicia. No arrastramos los fracasos que tuvo con una
 * carga más pesada, porque ya no está intentando esa carga.
 *
 * @param {IntentoEjercicio[]} historial  Del más reciente al más viejo.
 * @param {EjercicioPlanificado} plan
 * @returns {number}
 */
export function fallosSeguidos(historial, plan) {
  if (historial.length === 0) return 0;
  const peso = historial[0].pesoKg;
  let cuenta = 0;
  for (const intento of historial) {
    if (intento.pesoKg !== peso) break;
    if (completoElRango(intento.reps, plan)) break;
    cuenta++;
  }
  return cuenta;
}

/**
 * La función principal: qué peso y qué repeticiones sugerirle al usuario.
 *
 * @param {IntentoEjercicio[]} historial  Del más reciente al más viejo. Vacío = primera vez.
 * @param {EjercicioPlanificado} plan     Lo que pide la rutina para este ejercicio.
 * @param {string} claveEquipo            La clave del equipo, sale del catálogo de ejercicios.
 * @param {Reglas} reglas                 El contenido de datos/reglas.json.
 * @returns {Sugerencia}
 */
export function sugerirCarga(historial, plan, claveEquipo, reglas) {
  /** @type {string|undefined} */
  let advertencia;

  let equipo = reglas.equipos[claveEquipo];
  if (!equipo) {
    // No reventamos en el medio del gimnasio por un dato mal cargado: suponemos saltos de
    // 1 kg y lo dejamos dicho. tools/validar-datos.mjs tendría que haberlo agarrado antes.
    advertencia = 'El equipo "' + claveEquipo + '" no está en reglas.json. Se supusieron saltos de 1 kg.';
    equipo = { nombre: claveEquipo, incrementoMinimoKg: 1, pesoBaseKg: 0 };
  }

  // --- Primera vez: no hay nada que calcular.
  if (!historial || historial.length === 0) {
    return {
      pesoKg: plan.pesoInicialKg,
      repsObjetivo: plan.repsMin,
      motivo: 'primera-vez',
      explicacion: plan.pesoInicialKg === null
        ? 'Primera vez con este ejercicio: elegí un peso con el que llegues cómodo a ' + plan.repsMin + ' repeticiones.'
        : 'Primera vez con este ejercicio: arrancá con ' + plan.pesoInicialKg + ' kg y apuntá a ' + plan.repsMin + ' repeticiones.',
      advertencia
    };
  }

  const ultimo = historial[0];
  const anterior = historial[1];

  // --- Completó el rango: sube el peso.
  if (completoElRango(ultimo.reps, plan)) {
    const objetivo = ultimo.pesoKg * (1 + reglas.progresion.subirPorcentaje / 100);
    let nuevo = redondearACargaPosible(objetivo, equipo);

    // Caso borde importante: si el porcentaje da un salto MÁS CHICO que el incremento más
    // chico del equipo, el redondeo devuelve el mismo peso de siempre y el usuario queda
    // trabado para siempre. Con 40 kg y 2,5%, el objetivo es 41 y redondea a 40. Acá lo
    // empujamos al primer peso que sí se puede armar.
    if (nuevo <= ultimo.pesoKg) {
      nuevo = redondearACargaPosible(ultimo.pesoKg + (equipo.incrementoMinimoKg || 0), equipo);
    }

    // Peso corporal: no hay peso que subir, se progresa con repeticiones.
    if (!equipo.incrementoMinimoKg || equipo.incrementoMinimoKg <= 0) {
      return {
        pesoKg: ultimo.pesoKg,
        repsObjetivo: plan.repsMax,
        motivo: 'subir',
        explicacion: 'Completaste el rango. Como es peso corporal, el próximo paso es sumar repeticiones.',
        advertencia
      };
    }

    return {
      pesoKg: nuevo,
      repsObjetivo: plan.repsMin,
      motivo: 'subir',
      explicacion: 'Completaste ' + plan.repsMax + ' repeticiones en las ' + plan.series +
                   ' series con ' + ultimo.pesoKg + ' kg. Subí a ' + nuevo + ' kg y volvé a ' + plan.repsMin + '.',
      advertencia
    };
  }

  // --- Bajó el peso por su cuenta desde la sesión anterior: lo respetamos.
  if (anterior && ultimo.pesoKg < anterior.pesoKg) {
    return {
      pesoKg: ultimo.pesoKg,
      repsObjetivo: plan.repsMax,
      motivo: 'bajaste-el-peso',
      explicacion: 'La última vez bajaste a ' + ultimo.pesoKg + ' kg. Quedate ahí hasta llegar a ' +
                   plan.repsMax + ' repeticiones en las ' + plan.series + ' series.',
      advertencia
    };
  }

  // --- Se estancó demasiadas veces seguidas: baja el peso para volver a arrancar.
  const fallos = fallosSeguidos(historial, plan);
  if (fallos >= reglas.progresion.sesionesFallidasParaBajar) {
    const objetivo = ultimo.pesoKg * (1 - reglas.progresion.bajarPorcentaje / 100);
    let nuevo = redondearACargaPosible(objetivo, equipo);

    // Misma trampa que al subir, pero al revés: si el redondeo no baja nada, forzamos un
    // escalón para abajo. Y nunca por debajo del piso (una barra vacía ya pesa 20 kg).
    if (nuevo >= ultimo.pesoKg && equipo.incrementoMinimoKg > 0) {
      nuevo = redondearACargaPosible(ultimo.pesoKg - equipo.incrementoMinimoKg, equipo);
    }
    if (nuevo < equipo.pesoBaseKg) nuevo = equipo.pesoBaseKg;

    return {
      pesoKg: nuevo,
      repsObjetivo: plan.repsMin,
      motivo: 'bajar',
      explicacion: 'Van ' + fallos + ' sesiones con ' + ultimo.pesoKg + ' kg sin completar el rango. ' +
                   'Bajá a ' + nuevo + ' kg y volvé a subir desde ahí.',
      advertencia
    };
  }

  // --- Caso normal: sigue con el mismo peso hasta completar el rango.
  return {
    pesoKg: ultimo.pesoKg,
    repsObjetivo: plan.repsMax,
    motivo: 'mantener',
    explicacion: 'Seguí con ' + ultimo.pesoKg + ' kg. Te falta llegar a ' + plan.repsMax +
                 ' repeticiones en las ' + plan.series + ' series.',
    advertencia
  };
}
