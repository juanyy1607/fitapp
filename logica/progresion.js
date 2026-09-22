// @ts-check
/**
 * logica/progresion.js — Qué objetivo de repeticiones y qué peso le toca al usuario.
 *
 * Es el único lugar del proyecto donde un error es INVISIBLE. Si una pantalla se rompe,
 * la ves. Si esto sugiere 42,5 kg donde correspondían 45, entrenás seis semanas mal y no
 * te enterás nunca. Por eso está separado, no toca la pantalla ni la base, y tiene tests.
 *
 * ------------------------------------------------------------------------------------
 * LA REGLA, que la cerró el socio:
 *
 *   a) Cada ejercicio tiene un rango de repeticiones en el plan. Por ejemplo 6 a 10.
 *
 *   b) Al estrenar un peso, cada serie arranca con su propio objetivo:
 *        serie 1 → el piso del rango (6)
 *        serie 2 → el piso más uno (7)
 *        última  → AL FALLO, sin número
 *
 *   c) Después de cada sesión, serie por serie: si el usuario llegó o pasó su objetivo,
 *      el objetivo de esa serie sube UNA repetición para la próxima, con tope en el techo
 *      del rango. Si no llegó, el objetivo queda igual. NUNCA baja.
 *
 *   d) Cuando en una sesión TODAS las series llegan al techo del rango, en la siguiente
 *      sube el peso y los objetivos vuelven a piso, piso+1, fallo.
 *
 *   e) El peso NUNCA baja solo.
 *
 *   f) En los ejercicios donde NO hay carga que sumar, el techo del rango no aplica: los
 *      objetivos siguen subiendo de a uno, sin límite. Si el ejercicio admite lastre, en
 *      cambio, el techo sí aplica y el ciclo se reinicia agregando disco. Ver
 *      `elTechoAplica`, que es donde se decide.
 *
 * Así se ve una progresión normal con rango 6-10 y tres series:
 *
 *      objetivos          lo que hizo
 *      6  ·  7  · fallo   →  6 /  7 /  9
 *      7  ·  8  · fallo   →  7 /  8 / 10
 *      8  ·  9  · fallo   →  8 /  9 / 10
 *      9  · 10  · fallo   →  9 / 10 / 10
 *     10  · 10  · fallo   → 10 / 10 / 10   ← todas al techo
 *      6  ·  7  · fallo     con el peso siguiente
 *
 * ------------------------------------------------------------------------------------
 * Dos cosas que hay que tener presentes al leer este archivo:
 *
 * · **Los objetivos son estado, no se deducen del peso.** Cada serie guarda el objetivo
 *   que tenía cuando se hizo, y el de la próxima sesión sale de ahí. Por eso
 *   `IntentoEjercicio` trae `objetivos` además de `reps`: sin eso, no hay forma de saber
 *   si el usuario hizo 7 repeticiones porque le pedían 7 o porque le pedían 9.
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
 * De qué equipo salen los escalones de peso de este ejercicio.
 *
 * No siempre es la columna `equipo` de la planilla, y esa es toda la razón de que esta
 * función exista. El socio carga en `equipo` el aparato FÍSICO ("peso-corporal" para una
 * dominada asistida, porque el aparato es la barra) y marca aparte la casilla
 * `admite_asistencia`. Pero el número que el usuario anota en esa pantalla no son los
 * kilos de la barra: son los kilos de AYUDA de la máquina, y esos suben de a 5, no de a 0.
 *
 * Si nos guiáramos por la columna sola, "peso-corporal" tiene incremento 0 y la pantalla
 * le sacaría al usuario la posibilidad de anotar la ayuda. Entonces: manda el modo de
 * carga, y la columna se usa solo cuando el modo es peso común.
 *
 * Devuelve `null` si no hay forma de saberlo, para que quien llame decida qué suponer.
 * @param {Ejercicio} ejercicio
 * @param {Reglas} reglas
 * @returns {Equipo|null}
 */
export function equipoDeCarga(ejercicio, reglas) {
  const equipos = reglas.equipos || {};
  const modo = modoDeCarga(ejercicio);
  if (modo === 'asistencia') return equipos['asistencia'] || null;
  if (modo === 'lastre') return equipos['lastre'] || null;
  return equipos[ejercicio.equipo] || null;
}

/**
 * Cuántos kilos se suman cuando toca subir.
 *
 * Por defecto es el `subirKg` del equipo, pero el ejercicio lo puede pisar con su propia
 * columna `subir_kg`. Existe porque el press militar progresa mucho más lento que la
 * sentadilla aunque los dos usen barra: un solo número por equipo no alcanza. Mientras la
 * columna esté vacía —hoy lo está en toda la planilla— manda el equipo.
 *
 * Si no hay ninguno de los dos, cae al escalón más chico del equipo, que es lo mínimo que
 * se puede mover de verdad.
 * @param {Ejercicio} ejercicio
 * @param {Equipo} equipo
 * @returns {number}
 */
export function saltoDe(ejercicio, equipo) {
  if (ejercicio.subirKg !== undefined && ejercicio.subirKg > 0) return ejercicio.subirKg;
  if (equipo.subirKg > 0) return equipo.subirKg;
  return equipo.incrementoMinimoKg || 0;
}

/**
 * Los objetivos de cada serie al estrenar un peso: piso, piso+1, piso+2… y la última al
 * fallo.
 *
 * `null` quiere decir "al fallo": esa serie no tiene número, se hacen todas las que
 * salgan. Es un valor distinto de 0, que querría decir "cero repeticiones".
 *
 * El tope del rango también se respeta acá: con un rango corto (8 a 9) y cuatro series,
 * los objetivos no pueden pasarse del techo.
 * @param {EjercicioPlanificado} plan
 * @returns {(number|null)[]}
 */
export function objetivosIniciales(plan) {
  const cuantas = Math.max(1, plan.series);
  /** @type {(number|null)[]} */
  const objetivos = [];
  for (let i = 0; i < cuantas; i++) {
    // La última siempre al fallo, sea cual sea el número de series.
    objetivos.push(i === cuantas - 1 ? null : Math.min(plan.repsMin + i, plan.repsMax));
  }
  return objetivos;
}

/**
 * ¿El techo del rango aplica en este ejercicio?
 *
 * El techo tiene sentido cuando hay una carga que sumar: llegás arriba del rango, sumás
 * kilos y volvés al piso. Pero hay ejercicios donde no hay ningún kilo que sumar —una
 * flexión, una plancha, una dominada sin posibilidad de lastre, cualquier cosa con banda
 * elástica— y ahí el techo deja de ser una meta y pasa a ser una pared.
 *
 * El número es concreto: un principiante llega al techo del rango en unas cuatro semanas.
 * Si en ese momento la app le congela los objetivos, le está diciendo que ya no progresa
 * más nunca en ese ejercicio. Eso no es una regla de entrenamiento, es un bug.
 *
 * Entonces: si no hay carga que sumar, la progresión es la repetición, y no tiene tope.
 *
 * Ojo con los que SÍ admiten lastre: esos no entran acá. Una dominada con `admite_lastre`
 * tiene modo de carga `lastre`, que sube de a 1,25 kg, así que para ellos el techo sí
 * aplica y el ciclo se reinicia agregando disco.
 * @param {Ejercicio} ejercicio
 * @param {Equipo} equipo
 * @returns {boolean}
 */
export function elTechoAplica(ejercicio, equipo) {
  return (equipo.incrementoMinimoKg || 0) > 0 && saltoDe(ejercicio, equipo) > 0;
}

/**
 * ¿Todas las series llegaron al techo del rango?
 *
 * Es la condición que dispara la subida de peso. Exige DOS cosas: que haya hecho todas las
 * series que pedía el plan, y que en todas haya llegado al techo. Si hizo 2 de 3 series
 * perfectas, no alcanza.
 *
 * La serie al fallo cuenta igual que las demás: llegar al techo es hacer `repsMax` o más,
 * tenga objetivo escrito o no.
 * @param {number[]} reps
 * @param {EjercicioPlanificado} plan
 * @returns {boolean}
 */
export function todasAlTecho(reps, plan) {
  if (!Array.isArray(reps) || reps.length < plan.series) return false;
  return reps.slice(0, plan.series).every((r) => r >= plan.repsMax);
}

/**
 * Los objetivos de la próxima sesión, serie por serie.
 *
 * La regla, que es toda la gracia del sistema: **cada serie avanza sola**. Si llegaste a
 * tu objetivo en la serie 1 pero no en la 2, la 1 sube y la 2 se queda esperándote. No hay
 * castigo por no llegar, solo se deja de avanzar esa serie.
 *
 * Y nunca baja. Un mal día —dormiste mal, venías cansado— no te hace retroceder: los
 * objetivos te esperan donde los dejaste.
 *
 * @param {(number|null)[]} objetivos  Los que tenía la sesión que se acaba de hacer.
 * @param {number[]} reps              Lo que hizo en cada serie, en el mismo orden.
 * @param {EjercicioPlanificado} plan
 * @param {boolean} [conTecho]         Si el techo del rango frena a los objetivos. Es
 *                                     false en los ejercicios donde no hay carga que
 *                                     sumar: ahí la repetición es la única progresión que
 *                                     existe y no puede tener tope. Ver `elTechoAplica`.
 * @returns {(number|null)[]}
 */
export function avanzarObjetivos(objetivos, reps, plan, conTecho = true) {
  return objetivos.map((objetivo, i) => {
    // La serie al fallo no tiene número, así que no hay nada que subir: sigue al fallo
    // hasta que todas lleguen al techo y se reinicie con el peso nuevo.
    if (objetivo === null) return null;

    const hechas = reps[i];
    // Serie que no se registró (abandonó la sesión, o borró la serie): no se toca.
    if (typeof hechas !== 'number' || !Number.isFinite(hechas)) return objetivo;

    if (hechas < objetivo) return objetivo;
    return conTecho ? Math.min(objetivo + 1, plan.repsMax) : objetivo + 1;
  });
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
  // Incremento 0 es peso corporal o banda: no hay nada que redondear.
  if (!equipo.incrementoMinimoKg || equipo.incrementoMinimoKg <= 0) return redondear2(pesoKg);

  const pasos = Math.round((pesoKg - equipo.pesoBaseKg) / equipo.incrementoMinimoKg);
  const conPiso = Math.max(0, pasos);
  return redondear2(equipo.pesoBaseKg + conPiso * equipo.incrementoMinimoKg);
}

/**
 * Los objetivos en castellano, para meter en una frase.
 * Ejemplo: "6, 7 y la última al fallo".
 * @param {(number|null)[]} objetivos
 * @returns {string}
 */
export function describirObjetivos(objetivos) {
  const numeros = objetivos.filter((o) => o !== null).map(String);
  const hayFallo = objetivos.some((o) => o === null);

  if (numeros.length === 0) return 'al fallo';
  const lista = numeros.length === 1 ? numeros[0] : numeros.slice(0, -1).join(', ') + ' y ' + numeros[numeros.length - 1];
  return hayFallo ? lista + ', y la última al fallo' : lista;
}

/**
 * Los objetivos en una línea corta, para una lista.
 * Ejemplo: "8 · 9 · al fallo".
 *
 * Es la versión compacta de `describirObjetivos`, que arma una frase. Vive acá al lado, y
 * no en la pantalla que la usa, justamente porque el problema que resuelve es que dos
 * pantallas cuenten lo mismo de dos formas distintas.
 * @param {(number|null)[]} objetivos
 * @returns {string}
 */
export function objetivosEnLinea(objetivos) {
  return objetivos.map((o) => (o === null ? 'al fallo' : String(o))).join(' · ');
}

/**
 * La función principal: con qué peso y con qué objetivos encarar el próximo ejercicio.
 *
 * @param {IntentoEjercicio[]} historial  Del más reciente al más viejo. Vacío = primera vez.
 * @param {EjercicioPlanificado} plan     Lo que pide la rutina.
 * @param {Ejercicio} ejercicio           La ficha del ejercicio (equipo y casillas de carga).
 * @param {Reglas} reglas                 El contenido de datos/reglas.json.
 * @returns {Sugerencia}
 */
export function sugerirCarga(historial, plan, ejercicio, reglas) {
  /** @type {string|undefined} */
  let advertencia;
  const modo = modoDeCarga(ejercicio);
  const iniciales = objetivosIniciales(plan);

  let equipo = equipoDeCarga(ejercicio, reglas);
  if (!equipo) {
    // No reventamos en el medio del gimnasio por un dato mal cargado: suponemos saltos de
    // 1 kg y lo dejamos dicho. tools/validar-datos.mjs tendría que haberlo agarrado antes.
    advertencia = ejercicio.equipo
      ? 'El equipo "' + ejercicio.equipo + '" no está en reglas.json. Se supusieron saltos de 1 kg.'
      : 'Este ejercicio todavía no tiene equipo cargado en la planilla. Se supusieron saltos de 1 kg.';
    equipo = { nombre: ejercicio.equipo || 'sin definir', incrementoMinimoKg: 1, pesoBaseKg: 0, subirKg: 1 };
  }

  const incremento = equipo.incrementoMinimoKg || 0;
  const salto = saltoDe(ejercicio, equipo);
  const conTecho = elTechoAplica(ejercicio, equipo);

  // En los asistidos el progreso va para abajo: menos ayuda es mejor. Este signo es lo
  // único que separa "te está yendo bien" de "ponete más ayuda".
  const sentido = modo === 'asistencia' ? -1 : 1;

  /*
   * --- Primera vez: la app no recomienda peso.
   *
   * Es decisión del socio, y es deliberada: nadie que no esté ahí puede saber con cuántos
   * kilos arranca esta persona en este aparato. El usuario prueba, y anota lo que usó.
   * Por eso `pesoKg` viene en null y la pantalla muestra el campo vacío.
   */
  if (!historial || historial.length === 0) {
    return {
      pesoKg: null,
      objetivos: iniciales,
      motivo: 'primera-vez',
      modo,
      explicacion: 'Primera vez con este ejercicio: probá un peso que te deje llegar a ' +
                   plan.repsMin + ' repeticiones y anotá el que hayas usado. ' +
                   'Los objetivos son ' + describirObjetivos(iniciales) + '.',
      advertencia
    };
  }

  const ultimo = historial[0];

  /*
   * Los objetivos de la sesión pasada. Si el intento no los trae —historial guardado antes
   * de que existiera esta regla— arrancamos de los iniciales. Es una reconstrucción, no el
   * dato real, pero es mejor que quedarse sin nada y siempre queda del lado conservador:
   * el objetivo reconstruido nunca es más alto que el que la persona venía teniendo.
   */
  const objetivosPrevios = Array.isArray(ultimo.objetivos) && ultimo.objetivos.length
    ? ultimo.objetivos
    : iniciales;

  /*
   * --- Ejercicios sin ninguna carga que sumar: el techo del rango no aplica.
   *
   * Flexiones, plancha, una dominada que no admite lastre, cualquier cosa con banda. Acá
   * no hay kilos, así que la única progresión posible es la repetición, y frenarla en el
   * techo sería congelar el ejercicio para siempre a las cuatro semanas.
   *
   * Los objetivos siguen subiendo de a uno por serie, sin límite. Ni siquiera miramos
   * `todasAlTecho`: en estos ejercicios el techo no significa nada.
   */
  if (!conTecho) {
    const objetivos = avanzarObjetivos(objetivosPrevios, ultimo.reps, plan, false);
    const avanzoAlguna = objetivos.some((o, i) => o !== null && o !== objetivosPrevios[i]);
    return {
      pesoKg: ultimo.pesoKg,
      objetivos,
      motivo: 'seguir',
      modo,
      explicacion: 'Acá no hay kilos para sumar, así que la progresión son las repeticiones ' +
                   'y no tienen tope. ' +
                   (avanzoAlguna
                     ? 'Los objetivos de hoy son ' + describirObjetivos(objetivos) + '.'
                     : 'Los objetivos siguen en ' + describirObjetivos(objetivos) + '.'),
      advertencia
    };
  }

  // --- Todas las series al techo: le toca subir el peso y volver a empezar el ciclo.
  if (todasAlTecho(ultimo.reps, plan)) {
    /*
     * Estrena lastre: venía a peso corporal puro y llegó al techo del rango.
     *
     * La app dice que agregue lastre pero NO elige cuántos kilos, igual que la primera vez
     * con cualquier ejercicio: depende de qué discos haya, de si el cinturón existe, y de
     * la persona. `pesoKg` en null hace que la pantalla muestre el campo vacío.
     *
     * De ahí en adelante ya es una progresión con carga como cualquier otra, y sube sola
     * de a un escalón de lastre.
     */
    if (modo === 'lastre' && ultimo.pesoKg <= 0) {
      return {
        pesoKg: null,
        objetivos: iniciales,
        motivo: 'agregar-lastre',
        modo,
        explicacion: 'Llegaste a ' + plan.repsMax + ' repeticiones en todas las series con tu propio ' +
                     'peso. Agregá lastre —un disco o un cinturón— y anotá cuántos kilos pusiste. ' +
                     'Los objetivos vuelven a ' + describirObjetivos(iniciales) + '.',
        advertencia
      };
    }

    // Asistido y ya sin ayuda: no se puede bajar de cero. Toca cambiar de ejercicio.
    if (modo === 'asistencia' && ultimo.pesoKg <= 0) {
      const siguiente = (ejercicio.sustitutos || [])[0];
      return {
        pesoKg: 0,
        objetivos: objetivosPrevios.map((o) => (o === null ? null : plan.repsMax)),
        motivo: 'tope',
        modo,
        explicacion: 'Ya lo estás haciendo sin nada de ayuda. ' +
                     (siguiente ? 'Pasá a la versión sin asistencia.' : 'Sostené ese número.'),
        advertencia
      };
    }

    let nuevo = redondearACargaPosible(ultimo.pesoKg + sentido * salto, equipo);

    // Caso borde importante: si el redondeo devuelve el mismo peso de siempre, el usuario
    // queda trabado para siempre sin que nada falle. Lo empujamos un escalón.
    if (sentido > 0 && nuevo <= ultimo.pesoKg) nuevo = redondearACargaPosible(ultimo.pesoKg + incremento, equipo);
    if (sentido < 0 && nuevo >= ultimo.pesoKg) nuevo = redondearACargaPosible(ultimo.pesoKg - incremento, equipo);
    if (nuevo < 0) nuevo = 0;

    return {
      pesoKg: nuevo,
      objetivos: iniciales,
      motivo: 'subir',
      modo,
      explicacion: (modo === 'asistencia'
        ? 'Llegaste a ' + plan.repsMax + ' repeticiones en todas las series con ' + ultimo.pesoKg +
          ' kg de ayuda. Bajá la ayuda a ' + nuevo + ' kg.'
        : 'Llegaste a ' + plan.repsMax + ' repeticiones en todas las series con ' + ultimo.pesoKg +
          ' kg. Subí a ' + nuevo + ' kg.') +
        ' Los objetivos vuelven a ' + describirObjetivos(iniciales) + '.',
      advertencia
    };
  }

  // --- Caso normal: el mismo peso, y cada serie avanza por su cuenta.
  const objetivos = avanzarObjetivos(objetivosPrevios, ultimo.reps, plan, true);
  const avanzoAlguna = objetivos.some((o, i) => o !== null && o !== objetivosPrevios[i]);

  return {
    pesoKg: ultimo.pesoKg,
    objetivos,
    motivo: 'seguir',
    modo,
    explicacion: (modo === 'asistencia'
      ? 'Seguí con ' + ultimo.pesoKg + ' kg de ayuda. '
      : 'Seguí con ' + ultimo.pesoKg + ' kg. ') +
      (avanzoAlguna
        ? 'Los objetivos de hoy son ' + describirObjetivos(objetivos) + '.'
        : 'Los objetivos siguen en ' + describirObjetivos(objetivos) + '.'),
    advertencia
  };
}
