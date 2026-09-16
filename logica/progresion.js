// @ts-check
/**
 * logica/progresion.js — Cuánto peso sugerirle al usuario en el próximo ejercicio.
 *
 * Es el único lugar del proyecto donde un error es INVISIBLE. Si una pantalla se rompe,
 * la ves. Si esto sugiere 42,5 kg donde correspondían 45, entrenás seis semanas mal y no
 * te enterás nunca. Por eso está separado, no toca la pantalla ni la base, y tiene tests.
 *
 * El esquema es "doble progresión", y los números los pone el socio en datos/reglas.json:
 *   1. Te quedás con el mismo peso hasta llegar al techo de repeticiones en TODAS las series.
 *   2. Cuando lo lográs, sube el peso y volvés al piso de repeticiones.
 *   3. Si te estancás varias sesiones seguidas, baja el peso y volvés a subir desde ahí.
 *
 * Dos cosas que hay que tener presentes al leer este archivo:
 *
 * · **La subida es en kilos absolutos, no en porcentaje.** Un porcentaje mentía: con 2,5%
 *   sobre 60 kg el salto da 1,5 kg, menos que el disco más chico, así que el redondeo se
 *   lo comía y el parámetro no hacía nada hasta los 100 kg. El socio habría creído que lo
 *   regulaba sin que pasara nada.
 *
 * · **Los botones Fácil / Justo / No llegué solo cambian el TAMAÑO del salto**, nunca si
 *   hay salto. Las repeticiones son objetivas; el esfuerzo percibido es subjetivo y los
 *   principiantes lo estiman mal. Ver el comentario largo en la rama de "subir".
 *
 * · **En los ejercicios asistidos, progresar es BAJAR el número.** Los kilos que registra
 *   el usuario en dominadas asistidas son los kilos de AYUDA de la máquina. Menos ayuda es
 *   mejor. Si esto se escribe mal, la app le dice a alguien que está mejorando que se
 *   ponga más ayuda, y nadie se da cuenta nunca.
 */

/** @typedef {import('../tipos.js').Equipo} Equipo */
/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').Ejercicio} Ejercicio */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */
/** @typedef {import('../tipos.js').IntentoEjercicio} IntentoEjercicio */
/** @typedef {import('../tipos.js').Sugerencia} Sugerencia */
/** @typedef {import('../tipos.js').ModoCarga} ModoCarga */

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
 * Cómo hay que leer el número de kilos de este ejercicio.
 *
 * No está en la planilla: se deduce de las casillas que marca el socio. Si marcó las dos
 * (lastre y asistencia), gana asistencia y el validador se lo hace notar, porque un solo
 * número no puede significar las dos cosas a la vez.
 * @param {Ejercicio} ejercicio
 * @returns {ModoCarga}
 */
export function modoDeCarga(ejercicio) {
  if (ejercicio.admiteAsistencia) return 'asistencia';
  if (ejercicio.admiteLastre) return 'lastre';
  if (ejercicio.esPesoCorporal) return 'peso-corporal';
  return 'peso';
}

/**
 * Con cuánto arrancar la primera vez.
 *
 * El valor vive en el ejercicio, porque es propiedad del ejercicio y no de la rutina: si
 * estuviera en cada rutina, el mismo ejercicio podría tener tres pesos iniciales distintos
 * sin que nadie se entere. La rutina lo puede pisar, pero tiene que decirlo explícitamente.
 * @param {Ejercicio} ejercicio
 * @param {EjercicioPlanificado} plan
 * @returns {number|null}
 */
export function pesoInicialDe(ejercicio, plan) {
  if (Object.prototype.hasOwnProperty.call(plan, 'pesoInicialKg')) {
    return plan.pesoInicialKg === undefined ? null : plan.pesoInicialKg;
  }
  return ejercicio.pesoInicialKg === undefined ? null : ejercicio.pesoInicialKg;
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
 * Que sea "con el mismo peso" resuelve solo un caso complicado: si el usuario cambió la
 * carga por su cuenta, la cuenta se reinicia. No arrastramos los fracasos que tuvo con
 * otra carga, porque ya no está intentando esa.
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
 * @param {EjercicioPlanificado} plan     Lo que pide la rutina.
 * @param {Ejercicio} ejercicio           La ficha del ejercicio (equipo, modo, peso inicial).
 * @param {Reglas} reglas                 El contenido de datos/reglas.json.
 * @returns {Sugerencia}
 */
export function sugerirCarga(historial, plan, ejercicio, reglas) {
  /** @type {string|undefined} */
  let advertencia;
  const modo = modoDeCarga(ejercicio);

  let equipo = reglas.equipos[ejercicio.equipo];
  if (!equipo) {
    // No reventamos en el medio del gimnasio por un dato mal cargado: suponemos saltos de
    // 1 kg y lo dejamos dicho. tools/validar-datos.mjs tendría que haberlo agarrado antes.
    advertencia = 'El equipo "' + ejercicio.equipo + '" no está en reglas.json. Se supusieron saltos de 1 kg.';
    equipo = { nombre: ejercicio.equipo, incrementoMinimoKg: 1, pesoBaseKg: 0, subirKg: 1 };
  }

  const incremento = equipo.incrementoMinimoKg || 0;
  const subirKg = equipo.subirKg || incremento;

  // En los asistidos el progreso va para abajo: menos ayuda es mejor. Este signo es lo
  // único que separa "te está yendo bien" de "ponete más ayuda".
  const sentido = modo === 'asistencia' ? -1 : 1;

  // --- Primera vez: no hay nada que calcular.
  if (!historial || historial.length === 0) {
    const inicial = pesoInicialDe(ejercicio, plan);
    return {
      pesoKg: inicial,
      repsObjetivo: plan.repsMin,
      motivo: 'primera-vez',
      modo,
      explicacion: inicial === null
        ? 'Primera vez con este ejercicio: elegí un peso con el que llegues cómodo a ' + plan.repsMin + ' repeticiones.'
        : modo === 'asistencia'
          ? 'Primera vez: arrancá con ' + inicial + ' kg de ayuda y apuntá a ' + plan.repsMin + ' repeticiones.'
          : 'Primera vez con este ejercicio: arrancá con ' + inicial + ' kg y apuntá a ' + plan.repsMin + ' repeticiones.',
      advertencia
    };
  }

  const ultimo = historial[0];
  const anterior = historial[1];

  // --- Completó el rango: le toca progresar.
  if (completoElRango(ultimo.reps, plan)) {
    // Peso corporal sin lastre: no hay kilos que mover, se progresa con repeticiones.
    if (modo === 'peso-corporal' || incremento <= 0) {
      return {
        pesoKg: ultimo.pesoKg,
        repsObjetivo: plan.repsMax,
        motivo: 'subir',
        modo,
        explicacion: 'Completaste el rango. Como es peso corporal, el próximo paso es sumar repeticiones.',
        advertencia
      };
    }

    // Asistido y ya sin ayuda: no se puede bajar de cero. Toca cambiar de ejercicio.
    if (modo === 'asistencia' && ultimo.pesoKg <= 0) {
      const siguiente = (ejercicio.sustitutos || [])[0];
      return {
        pesoKg: 0,
        repsObjetivo: plan.repsMax,
        motivo: 'mantener',
        modo,
        explicacion: 'Ya lo estás haciendo sin nada de ayuda. ' +
                     (siguiente ? 'Pasá a la versión sin asistencia.' : 'Sumá repeticiones.'),
        advertencia
      };
    }

    /*
     * Acá entra el botón de esfuerzo, y SOLO acá.
     *
     * Las repeticiones deciden SI progresa; el botón decide CUÁNTO. Marcar "Fácil" no
     * puede hacer que suba sin haber completado el rango, y marcar "No llegué" no puede
     * frenarlo si lo completó. Es a propósito: un principiante estima muy mal cuánto le
     * faltaba para fallar, así que el dato subjetivo no puede mandar sobre el objetivo.
     *
     * Lo que sí aporta el botón es algo que las repeticiones no ven: completar el rango
     * y que además haya sido fácil significa que arrancó demasiado liviano. Ese es el
     * problema real de las primeras semanas, y el salto doble lo corrige.
     */
    const multiplicador = ultimo.esfuerzo === 'facil'
      ? (reglas.progresion.multiplicadorSiFueFacil || 1)
      : 1;
    const saltoDoble = multiplicador > 1;

    let nuevo = redondearACargaPosible(ultimo.pesoKg + sentido * subirKg * multiplicador, equipo);

    // Caso borde importante: si el redondeo devuelve el mismo peso de siempre, el usuario
    // queda trabado para siempre sin que nada falle. Lo empujamos un escalón.
    if (sentido > 0 && nuevo <= ultimo.pesoKg) nuevo = redondearACargaPosible(ultimo.pesoKg + incremento, equipo);
    if (sentido < 0 && nuevo >= ultimo.pesoKg) nuevo = redondearACargaPosible(ultimo.pesoKg - incremento, equipo);
    if (nuevo < 0) nuevo = 0;

    return {
      pesoKg: nuevo,
      repsObjetivo: plan.repsMin,
      motivo: 'subir',
      modo,
      explicacion: (modo === 'asistencia'
        ? 'Completaste ' + plan.repsMax + ' repeticiones con ' + ultimo.pesoKg + ' kg de ayuda. ' +
          'Bajá la ayuda a ' + nuevo + ' kg y volvé a ' + plan.repsMin + '.'
        : 'Completaste ' + plan.repsMax + ' repeticiones en las ' + plan.series + ' series con ' +
          ultimo.pesoKg + ' kg. Subí a ' + nuevo + ' kg y volvé a ' + plan.repsMin + '.') +
        (saltoDoble ? ' Como lo marcaste fácil, el salto es doble.' : ''),
      advertencia
    };
  }

  // --- Retrocedió por su cuenta desde la sesión anterior: lo respetamos.
  // Ojo con el signo: en asistidos, retroceder es SUBIR los kilos de ayuda.
  const retrocedio = anterior && (sentido > 0
    ? ultimo.pesoKg < anterior.pesoKg
    : ultimo.pesoKg > anterior.pesoKg);

  if (retrocedio) {
    return {
      pesoKg: ultimo.pesoKg,
      repsObjetivo: plan.repsMax,
      motivo: 'bajaste-el-peso',
      modo,
      explicacion: modo === 'asistencia'
        ? 'La última vez subiste la ayuda a ' + ultimo.pesoKg + ' kg. Quedate ahí hasta llegar a ' +
          plan.repsMax + ' repeticiones en las ' + plan.series + ' series.'
        : 'La última vez bajaste a ' + ultimo.pesoKg + ' kg. Quedate ahí hasta llegar a ' +
          plan.repsMax + ' repeticiones en las ' + plan.series + ' series.',
      advertencia
    };
  }

  // --- Se estancó demasiadas veces seguidas: aflojamos la carga para volver a arrancar.
  const fallos = fallosSeguidos(historial, plan);
  if (fallos >= reglas.progresion.sesionesFallidasParaBajar && incremento > 0) {
    // El deload sí es porcentual, y acá el porcentaje no miente: a cualquier carga
    // razonable, un 10% da más que el disco más chico. Igual ponemos un piso de un
    // escalón para que no se quede en cero cuando la carga es muy baja.
    const magnitud = Math.max(Math.abs(ultimo.pesoKg) * reglas.progresion.bajarPorcentaje / 100, incremento);
    let nuevo = redondearACargaPosible(ultimo.pesoKg - sentido * magnitud, equipo);

    if (sentido > 0 && nuevo >= ultimo.pesoKg) nuevo = redondearACargaPosible(ultimo.pesoKg - incremento, equipo);
    if (sentido < 0 && nuevo <= ultimo.pesoKg) nuevo = redondearACargaPosible(ultimo.pesoKg + incremento, equipo);
    if (nuevo < equipo.pesoBaseKg) nuevo = equipo.pesoBaseKg;

    return {
      pesoKg: nuevo,
      repsObjetivo: plan.repsMin,
      motivo: 'bajar',
      modo,
      explicacion: modo === 'asistencia'
        ? 'Van ' + fallos + ' sesiones con ' + ultimo.pesoKg + ' kg de ayuda sin completar el rango. ' +
          'Subí la ayuda a ' + nuevo + ' kg y volvé a bajarla desde ahí.'
        : 'Van ' + fallos + ' sesiones con ' + ultimo.pesoKg + ' kg sin completar el rango. ' +
          'Bajá a ' + nuevo + ' kg y volvé a subir desde ahí.',
      advertencia
    };
  }

  // --- Caso normal: sigue igual hasta completar el rango.
  return {
    pesoKg: ultimo.pesoKg,
    repsObjetivo: plan.repsMax,
    motivo: 'mantener',
    modo,
    explicacion: modo === 'asistencia'
      ? 'Seguí con ' + ultimo.pesoKg + ' kg de ayuda. Te falta llegar a ' + plan.repsMax + ' repeticiones.'
      : 'Seguí con ' + ultimo.pesoKg + ' kg. Te falta llegar a ' + plan.repsMax +
        ' repeticiones en las ' + plan.series + ' series.',
    advertencia
  };
}
