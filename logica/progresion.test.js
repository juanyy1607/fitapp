// @ts-check
/**
 * logica/progresion.test.js — Tests de la regla de progresión.
 *
 * Correr con:   node --test
 *
 * Sin dependencias: el corredor de tests viene adentro de Node.
 *
 * Estos tests son la regla escrita como ejemplos. Si alguien cambia la lógica y un test
 * de acá se pone rojo, no es que el test esté desactualizado: es que se cambió el criterio
 * de entrenamiento que cerró el socio. Eso se discute con él, no se arregla en el código.
 *
 * Los tests usan el datos/reglas.json REAL, no una copia inventada: si el socio carga un
 * número que rompe la progresión, se quejan antes de que llegue al teléfono de nadie.
 *
 * Los EJERCICIOS, en cambio, salen de un catálogo propio de los tests. Ver el comentario
 * largo donde se carga.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  sugerirCarga, redondearACargaPosible, todasAlTecho, objetivosIniciales,
  avanzarObjetivos, redondear2, modoDeCarga, equipoDeCarga, saltoDe,
  describirObjetivos, objetivosEnLinea, elTechoAplica
} from './progresion.js';
import { normalizarEjercicio } from './catalogo.js';

/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').Ejercicio} Ejercicio */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */
/** @typedef {import('../tipos.js').IntentoEjercicio} IntentoEjercicio */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
/** @type {Reglas} */
const reglas = JSON.parse(readFileSync(join(RAIZ, 'datos/reglas.json'), 'utf8'));

/*
 * Los tests usan su propio catálogo, no el del socio.
 *
 * datos/ejercicios.json tiene el catálogo real y lo maneja el socio: si los tests
 * dependieran de él, renombrar un ejercicio en la planilla rompería la suite de progresión,
 * que no tiene nada que ver. Peor todavía, alguien podría "arreglar" el test cambiando los
 * datos del socio.
 *
 * El fixture está escrito en el MISMO formato que la planilla (columnas con guión bajo,
 * casillas "si"/"no") y pasa por el mismo `normalizarEjercicio` que usa la app, así que
 * los tests siguen cubriendo la traducción de verdad.
 *
 * El catálogo real igual se revisa, más abajo, en su propio bloque de tests.
 */
/** @type {Ejercicio[]} */
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'logica/ejercicios-de-prueba.json'), 'utf8'))
  .map(normalizarEjercicio);

/** El catálogo real del socio, ya traducido: lo que la app va a cargar de verdad. */
/** @type {Ejercicio[]} */
const catalogoReal = JSON.parse(readFileSync(join(RAIZ, 'datos/ejercicios.json'), 'utf8'))
  .map(normalizarEjercicio);

/** @param {string} id @returns {Ejercicio} */
const ej = (id) => {
  const e = catalogo.find((x) => x.id === id);
  if (!e) throw new Error('falta el ejercicio de prueba "' + id + '" en logica/ejercicios-de-prueba.json');
  return e;
};

/** Barra, rango 6 a 10, tres series. Es el ejemplo con el que el socio explicó la regla. */
/** @type {EjercicioPlanificado} */
const PLAN = { ejercicioId: 'press-banca', series: 3, repsMin: 6, repsMax: 10, descansoSeg: 120 };

/** @type {EjercicioPlanificado} */
const PLAN_CORPORAL = { ejercicioId: 'plancha', series: 3, repsMin: 20, repsMax: 45, descansoSeg: 60 };
/** @type {EjercicioPlanificado} */
const PLAN_ASISTIDO = { ejercicioId: 'dominadas-asistidas', series: 3, repsMin: 6, repsMax: 10, descansoSeg: 120 };

const AYER = Date.parse('2026-09-17T18:00:00Z');

/**
 * Un intento pasado, escrito corto.
 * @param {number} pesoKg
 * @param {number[]} reps
 * @param {(number|null)[]} objetivos
 * @returns {IntentoEjercicio}
 */
const intento = (pesoKg, reps, objetivos) => ({ fechaTs: AYER, pesoKg, reps, objetivos });

// =====================================================================
// Las piezas sueltas de la regla.
// =====================================================================

describe('objetivosIniciales — con qué objetivos se estrena un peso', () => {
  test('rango 6-10 y tres series: 6, 7 y la última al fallo', () => {
    assert.deepEqual(objetivosIniciales(PLAN), [6, 7, null]);
  });

  test('la última serie siempre va al fallo, sea cual sea el número de series', () => {
    assert.deepEqual(objetivosIniciales({ ...PLAN, series: 4 }), [6, 7, 8, null]);
    assert.deepEqual(objetivosIniciales({ ...PLAN, series: 2 }), [6, null]);
  });

  test('con una sola serie, esa serie va al fallo', () => {
    assert.deepEqual(objetivosIniciales({ ...PLAN, series: 1 }), [null]);
  });

  test('los objetivos iniciales nunca se pasan del techo del rango', () => {
    // Rango cortito de 8 a 9 con cuatro series: sin el tope, la tercera pediría 10.
    const objetivos = objetivosIniciales({ ...PLAN, series: 4, repsMin: 8, repsMax: 9 });
    assert.deepEqual(objetivos, [8, 9, 9, null]);
  });

  test('rango 6-8 con CINCO series: ningún objetivo inicial se pasa de 8', () => {
    /*
     * El caso con el que hay que tener cuidado al generalizar. La regla es
     * objetivo_serie_n = min(piso + n - 1, techo), con la última siempre al fallo.
     * Sin el min, la serie 4 arrancaría en 9 y la 5 en 10: dos objetivos por encima del
     * techo del rango, en la primera sesión, antes de que el usuario haga nada.
     */
    const objetivos = objetivosIniciales({ ...PLAN, series: 5, repsMin: 6, repsMax: 8 });
    assert.deepEqual(objetivos, [6, 7, 8, 8, null]);

    for (const o of objetivos) {
      if (o === null) continue;
      assert.ok(o <= 8, 'el objetivo inicial ' + o + ' se pasa del techo del rango (8)');
    }
    assert.equal(objetivos[objetivos.length - 1], null, 'la última siempre va al fallo');
  });

  test('la fórmula vale para cualquier cantidad de series y cualquier rango', () => {
    for (const series of [1, 2, 3, 4, 5, 8]) {
      for (const [repsMin, repsMax] of [[6, 8], [1, 3], [8, 20], [10, 11]]) {
        const plan = { ...PLAN, series, repsMin, repsMax };
        const objetivos = objetivosIniciales(plan);

        assert.equal(objetivos.length, series);
        assert.equal(objetivos[series - 1], null, 'la última siempre al fallo');

        objetivos.forEach((o, i) => {
          if (o === null) return;
          assert.equal(o, Math.min(repsMin + i, repsMax),
            'serie ' + (i + 1) + ' con rango ' + repsMin + '-' + repsMax);
          assert.ok(o >= repsMin && o <= repsMax, 'el objetivo ' + o + ' se fue del rango');
        });
      }
    }
  });
});

describe('avanzarObjetivos — cada serie avanza por su cuenta', () => {
  test('la serie que llega a su objetivo sube uno', () => {
    assert.deepEqual(avanzarObjetivos([6, 7, null], [6, 7, 9], PLAN), [7, 8, null]);
  });

  test('la serie que se pasa de su objetivo igual sube UNO SOLO', () => {
    // Hizo 9 donde le pedían 6. El objetivo va a 7, no a 9: la regla es de a una.
    assert.deepEqual(avanzarObjetivos([6, 7, null], [9, 9, 12], PLAN), [7, 8, null]);
  });

  test('la serie que no llega mantiene su objetivo', () => {
    assert.deepEqual(avanzarObjetivos([8, 9, null], [7, 8, 9], PLAN), [8, 9, null]);
  });

  test('nunca baja, por mal que le haya ido', () => {
    assert.deepEqual(avanzarObjetivos([9, 10, null], [1, 1, 1], PLAN), [9, 10, null]);
  });

  test('el objetivo se frena en el techo del rango', () => {
    assert.deepEqual(avanzarObjetivos([10, 10, null], [10, 10, 10], PLAN), [10, 10, null]);
  });

  test('la serie al fallo sigue al fallo: no tiene número que subir', () => {
    assert.deepEqual(avanzarObjetivos([6, 7, null], [10, 10, 20], PLAN)[2], null);
  });

  test('una serie que no se registró no se toca', () => {
    // Abandonó la sesión después de la segunda serie.
    assert.deepEqual(avanzarObjetivos([6, 7, null], [6, 7], PLAN), [7, 8, null]);
  });
});

describe('todasAlTecho — la condición para subir el peso', () => {
  test('las tres en el techo, sí', () => {
    assert.equal(todasAlTecho([10, 10, 10], PLAN), true);
  });

  test('pasarse del techo también cuenta', () => {
    assert.equal(todasAlTecho([10, 11, 15], PLAN), true);
  });

  test('una sola por debajo alcanza para que no', () => {
    assert.equal(todasAlTecho([10, 9, 10], PLAN), false);
  });

  test('dos series perfectas de tres no alcanzan', () => {
    assert.equal(todasAlTecho([10, 10], PLAN), false);
  });
});

// =====================================================================
// Los cuatro casos que pidió el socio. Son la regla contada como historias.
// =====================================================================

describe('CASO 1 — progresión normal, sesión por sesión', () => {
  /*
   * La secuencia que definió el socio, con rango 6-10 y tres series:
   *
   *    objetivos        lo que hizo
   *    6 ·  7 · fallo →  6 /  7 /  9
   *    7 ·  8 · fallo →  7 /  8 / 10
   *    8 ·  9 · fallo →  8 /  9 / 10
   *    9 · 10 · fallo →  9 / 10 / 10
   *   10 · 10 · fallo → 10 / 10 / 10   ← todas al techo, sube el peso
   */
  const pasos = [
    { objetivos: [6, 7, null], hizo: [6, 7, 9], siguientes: [7, 8, null] },
    { objetivos: [7, 8, null], hizo: [7, 8, 10], siguientes: [8, 9, null] },
    { objetivos: [8, 9, null], hizo: [8, 9, 10], siguientes: [9, 10, null] },
    { objetivos: [9, 10, null], hizo: [9, 10, 10], siguientes: [10, 10, null] }
  ];

  for (const paso of pasos) {
    test(`con objetivos ${JSON.stringify(paso.objetivos)} y ${paso.hizo.join('/')} → ${JSON.stringify(paso.siguientes)}`, () => {
      const s = sugerirCarga([intento(40, paso.hizo, paso.objetivos)], PLAN, ej('press-banca'), reglas);
      assert.deepEqual(s.objetivos, paso.siguientes);
      assert.equal(s.pesoKg, 40, 'el peso no tiene que moverse todavía');
      assert.equal(s.motivo, 'seguir');
    });
  }

  test('con 10/10/10 sube el peso y los objetivos vuelven al principio', () => {
    const s = sugerirCarga([intento(40, [10, 10, 10], [10, 10, null])], PLAN, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 42.5, 'la barra sube de a 2,5 kg');
    assert.deepEqual(s.objetivos, [6, 7, null]);
  });

  test('la secuencia entera, encadenada de verdad', () => {
    // Igual que arriba pero sin escribir los objetivos a mano en cada paso: se van
    // arrastrando. Si alguna sesión del medio se desincroniza, esto lo agarra.
    let objetivos = objetivosIniciales(PLAN);
    let peso = 40;
    const hizo = [[6, 7, 9], [7, 8, 10], [8, 9, 10], [9, 10, 10], [10, 10, 10]];
    const esperados = [[7, 8, null], [8, 9, null], [9, 10, null], [10, 10, null], [6, 7, null]];

    hizo.forEach((reps, i) => {
      const s = sugerirCarga([intento(peso, reps, objetivos)], PLAN, ej('press-banca'), reglas);
      assert.deepEqual(s.objetivos, esperados[i], 'sesión ' + (i + 1));
      objetivos = s.objetivos;
      peso = /** @type {number} */ (s.pesoKg);
    });

    assert.equal(peso, 42.5, 'después de las cinco sesiones tiene que haber subido una vez');
  });
});

describe('CASO 2 — estancado en una serie', () => {
  test('la serie 1 sigue avanzando y la 2 mantiene su objetivo', () => {
    // Le pedían 7 y 8. Hizo 7 (llegó) y 7 (no llegó).
    const s = sugerirCarga([intento(40, [7, 7, 9], [7, 8, null])], PLAN, ej('press-banca'), reglas);
    assert.deepEqual(s.objetivos, [8, 8, null]);
    assert.equal(s.pesoKg, 40);
  });

  test('puede quedarse estancada muchas sesiones sin que el peso se mueva', () => {
    let objetivos = /** @type {(number|null)[]} */ ([7, 8, null]);
    for (let i = 0; i < 5; i++) {
      const s = sugerirCarga([intento(40, [10, 7, 9], objetivos)], PLAN, ej('press-banca'), reglas);
      assert.equal(s.pesoKg, 40, 'el peso no sube mientras una serie no llegue al techo');
      objetivos = s.objetivos;
    }
    // La serie 1 llegó al techo del rango; la 2 sigue clavada donde se estancó.
    assert.deepEqual(objetivos, [10, 8, null]);
  });

  test('el peso NUNCA baja, por más sesiones que falle', () => {
    let objetivos = /** @type {(number|null)[]} */ ([9, 10, null]);
    for (let i = 0; i < 6; i++) {
      const s = sugerirCarga([intento(40, [4, 4, 4], objetivos)], PLAN, ej('press-banca'), reglas);
      assert.equal(s.pesoKg, 40, 'sesión ' + (i + 1) + ': el peso se quedó donde estaba');
      assert.notEqual(s.motivo, 'bajar', 'el deload automático ya no existe');
      objetivos = s.objetivos;
    }
    assert.deepEqual(objetivos, [9, 10, null], 'los objetivos tampoco bajaron');
  });
});

describe('CASO 3 — arranque liviano', () => {
  test('hace 10/10/12 la primera sesión y el peso sube de una', () => {
    // Le pedían 6, 7 y fallo. Se pasó en las tres: el peso estaba demasiado liviano.
    const s = sugerirCarga([intento(40, [10, 10, 12], [6, 7, null])], PLAN, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 42.5);
    assert.deepEqual(s.objetivos, [6, 7, null], 'el ciclo vuelve a empezar con el peso nuevo');
  });

  test('si sigue liviano, sube otra vez a la sesión siguiente', () => {
    const s = sugerirCarga([intento(42.5, [11, 11, 14], [6, 7, null])], PLAN, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 45);
  });

  test('sube una sola vez por sesión, no de a varios escalones', () => {
    // Aunque haya hecho el doble del techo, el salto es el del equipo y nada más.
    const s = sugerirCarga([intento(40, [20, 20, 20], [6, 7, null])], PLAN, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, 42.5);
  });
});

describe('CASO 4 — bajón puntual', () => {
  test('mantiene los objetivos y no castiga', () => {
    // Venía con objetivos 8 y 9, durmió mal y no llegó a ninguno.
    const s = sugerirCarga([intento(40, [6, 6, 7], [8, 9, null])], PLAN, ej('press-banca'), reglas);
    assert.deepEqual(s.objetivos, [8, 9, null], 'los objetivos lo esperan donde los dejó');
    assert.equal(s.pesoKg, 40, 'el peso tampoco baja');
    assert.equal(s.motivo, 'seguir');
  });

  test('después del bajón retoma exactamente donde había quedado', () => {
    const bajon = sugerirCarga([intento(40, [6, 6, 7], [8, 9, null])], PLAN, ej('press-banca'), reglas);
    const vuelta = sugerirCarga([intento(40, [8, 9, 10], bajon.objetivos)], PLAN, ej('press-banca'), reglas);
    assert.deepEqual(vuelta.objetivos, [9, 10, null]);
  });

  test('un bajón en la última sesión no borra lo que ya había ganado', () => {
    // La serie 1 ya estaba en 10. Un mal día no la devuelve a 6.
    const s = sugerirCarga([intento(40, [2, 2, 2], [10, 9, null])], PLAN, ej('press-banca'), reglas);
    assert.equal(s.objetivos[0], 10);
  });
});

// =====================================================================
// La primera vez, que ahora no recomienda peso.
// =====================================================================

describe('la primera vez con un ejercicio', () => {
  test('la app NO recomienda peso: el campo va vacío', () => {
    const s = sugerirCarga([], PLAN, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, null, 'el usuario prueba en el gimnasio y anota lo que usó');
    assert.equal(s.motivo, 'primera-vez');
  });

  test('pero sí da los objetivos de arranque', () => {
    const s = sugerirCarga([], PLAN, ej('press-banca'), reglas);
    assert.deepEqual(s.objetivos, [6, 7, null]);
  });

  test('tampoco recomienda peso en un ejercicio que antes tenía peso inicial cargado', () => {
    // La sentadilla tenía pesoInicialKg 20 en los datos viejos. Ya no existe ese campo.
    const s = sugerirCarga([], { ...PLAN, ejercicioId: 'sentadilla' }, ej('sentadilla'), reglas);
    assert.equal(s.pesoKg, null);
  });

  test('la explicación le dice qué hacer, sin inventarle un número', () => {
    const s = sugerirCarga([], PLAN, ej('press-banca'), reglas);
    assert.match(s.explicacion, /probá un peso/i);
    assert.doesNotMatch(s.explicacion, /\d+ kg/, 'no puede aparecer un peso recomendado');
  });
});

// =====================================================================
// Los modos de carga raros: asistido, peso corporal, lastre.
// =====================================================================

describe('los ejercicios asistidos: progresar es BAJAR la ayuda', () => {
  test('al llegar al techo en todas, baja los kilos de ayuda', () => {
    const s = sugerirCarga([intento(30, [10, 10, 10], [10, 10, null])], PLAN_ASISTIDO,
                           ej('dominadas-asistidas'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 25, 'la máquina de asistidas salta de a 5 kg, y para abajo');
    assert.deepEqual(s.objetivos, [6, 7, null]);
  });

  test('la ayuda nunca sube sola', () => {
    const s = sugerirCarga([intento(30, [2, 2, 2], [8, 9, null])], PLAN_ASISTIDO,
                           ej('dominadas-asistidas'), reglas);
    assert.equal(s.pesoKg, 30, 'por mal que le vaya, la app no le pone más ayuda');
  });

  test('sin nada de ayuda ya no hay a dónde bajar, y se lo decimos', () => {
    const s = sugerirCarga([intento(0, [10, 10, 10], [10, 10, null])], PLAN_ASISTIDO,
                           ej('dominadas-asistidas'), reglas);
    assert.equal(s.motivo, 'tope');
    assert.equal(s.pesoKg, 0);
    assert.match(s.explicacion, /sin nada de ayuda/i);
  });

  test('el modo se deduce de la casilla, no de la columna equipo', () => {
    assert.equal(modoDeCarga(ej('dominadas-asistidas')), 'asistencia');
    const eq = equipoDeCarga(ej('dominadas-asistidas'), reglas);
    assert.ok(eq && eq.incrementoMinimoKg > 0, 'tiene que salir del equipo de asistencia');
  });
});

describe('sin carga que sumar y sin lastre: el techo del rango no aplica', () => {
  /*
   * La corrección que pidió el socio. Antes, al llegar al techo, la app congelaba los
   * objetivos ahí: flexiones, plancha y dominadas quedaban muertas a las cuatro semanas.
   * Ahora, cuando no hay ningún kilo que sumar, la repetición es la progresión y no tiene
   * tope.
   */
  test('pasado el techo, los objetivos siguen subiendo de a uno', () => {
    const s = sugerirCarga([intento(0, [45, 45, 50], [45, 45, null])], PLAN_CORPORAL,
                           ej('plancha'), reglas);
    assert.equal(s.motivo, 'seguir');
    assert.deepEqual(s.objetivos, [46, 46, null], 'el techo del rango era 45 y se pasa de largo');
  });

  test('ya arrancando por encima del techo, sigue subiendo', () => {
    const s = sugerirCarga([intento(0, [60, 60, 70], [60, 60, null])], PLAN_CORPORAL,
                           ej('plancha'), reglas);
    assert.deepEqual(s.objetivos, [61, 61, null]);
  });

  test('nunca devuelve el motivo "tope": ya no se congela', () => {
    const s = sugerirCarga([intento(0, [45, 45, 45], [45, 45, null])], PLAN_CORPORAL,
                           ej('plancha'), reglas);
    assert.notEqual(s.motivo, 'tope');
  });

  test('diez sesiones seguidas al tope siguen avanzando, no se traban', () => {
    let objetivos = /** @type {(number|null)[]} */ ([45, 45, null]);
    for (let i = 0; i < 10; i++) {
      const hizo = objetivos.map((o) => (o === null ? 99 : o));
      const s = sugerirCarga([intento(0, hizo, objetivos)], PLAN_CORPORAL, ej('plancha'), reglas);
      objetivos = s.objetivos;
    }
    assert.deepEqual(objetivos, [55, 55, null], 'diez sesiones, diez repeticiones más');
  });

  test('la serie que no llega sigue sin avanzar, igual que siempre', () => {
    const s = sugerirCarga([intento(0, [45, 30, 50], [45, 45, null])], PLAN_CORPORAL,
                           ej('plancha'), reglas);
    assert.deepEqual(s.objetivos, [46, 45, null]);
  });

  test('la explicación dice por qué no hay tope', () => {
    const s = sugerirCarga([intento(0, [45, 45, 50], [45, 45, null])], PLAN_CORPORAL,
                           ej('plancha'), reglas);
    assert.match(s.explicacion, /no tienen tope/i);
  });

  test('el peso se queda en cero: no hay nada que cargar', () => {
    const s = sugerirCarga([intento(0, [45, 45, 50], [45, 45, null])], PLAN_CORPORAL,
                           ej('plancha'), reglas);
    assert.equal(s.pesoKg, 0);
  });

  test('avanzarObjetivos sin techo no respeta el repsMax del plan', () => {
    assert.deepEqual(avanzarObjetivos([10, 10, null], [10, 10, 10], PLAN, false), [11, 11, null]);
    assert.deepEqual(avanzarObjetivos([10, 10, null], [10, 10, 10], PLAN, true), [10, 10, null]);
  });

  test('con banda elástica pasa lo mismo que con peso corporal', () => {
    const conBanda = { ...ej('plancha'), esPesoCorporal: false, equipo: 'banda' };
    const s = sugerirCarga([intento(0, [45, 45, 50], [45, 45, null])], PLAN_CORPORAL, conBanda, reglas);
    assert.equal(s.motivo, 'seguir');
    assert.deepEqual(s.objetivos, [46, 46, null]);
  });
});

describe('elTechoAplica — dónde el techo del rango tiene sentido', () => {
  test('no aplica en peso corporal puro', () => {
    assert.equal(elTechoAplica(ej('plancha'), reglas.equipos['peso-corporal']), false);
  });

  test('no aplica con banda, que no se mide en kilos', () => {
    assert.equal(elTechoAplica(ej('plancha'), reglas.equipos['banda']), false);
  });

  test('sí aplica en cualquier cosa con kilos', () => {
    assert.equal(elTechoAplica(ej('press-banca'), reglas.equipos['barra']), true);
    assert.equal(elTechoAplica(ej('dominadas'), reglas.equipos['lastre']), true);
    assert.equal(elTechoAplica(ej('dominadas-asistidas'), reglas.equipos['asistencia']), true);
  });
});

describe('sin carga pero CON lastre: al llegar al techo, se agrega disco', () => {
  const PLAN_LASTRE = { ...PLAN, ejercicioId: 'dominadas' };

  test('a peso corporal y al techo, la app manda a agregar lastre', () => {
    const s = sugerirCarga([intento(0, [10, 10, 10], [10, 10, null])], PLAN_LASTRE,
                           ej('dominadas'), reglas);
    assert.equal(s.motivo, 'agregar-lastre');
  });

  test('los objetivos vuelven al piso del rango', () => {
    const s = sugerirCarga([intento(0, [10, 10, 10], [10, 10, null])], PLAN_LASTRE,
                           ej('dominadas'), reglas);
    assert.deepEqual(s.objetivos, [6, 7, null]);
  });

  test('la app NO elige cuántos kilos: eso lo carga el usuario', () => {
    const s = sugerirCarga([intento(0, [10, 10, 10], [10, 10, null])], PLAN_LASTRE,
                           ej('dominadas'), reglas);
    assert.equal(s.pesoKg, null, 'depende de qué discos haya y de la persona');
    assert.match(s.explicacion, /agregá lastre/i);
    assert.match(s.explicacion, /anotá cuántos kilos/i);
  });

  test('acá el techo SÍ aplica: los objetivos no se pasan de largo', () => {
    const s = sugerirCarga([intento(0, [9, 9, 10], [9, 9, null])], PLAN_LASTRE,
                           ej('dominadas'), reglas);
    assert.equal(s.motivo, 'seguir');
    assert.deepEqual(s.objetivos, [10, 10, null], 'frenan en el techo, que es 10');
  });

  test('una vez que hay lastre puesto, sube solo de a un escalón', () => {
    const s = sugerirCarga([intento(5, [10, 10, 10], [10, 10, null])], PLAN_LASTRE,
                           ej('dominadas'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 6.25, 'el lastre salta de a 1,25 kg');
    assert.deepEqual(s.objetivos, [6, 7, null]);
  });

  test('el ciclo entero: peso corporal → primer disco → progresión con carga', () => {
    // Al techo sin lastre: la app pide que agregue disco.
    const estrena = sugerirCarga([intento(0, [10, 10, 10], [10, 10, null])], PLAN_LASTRE,
                                 ej('dominadas'), reglas);
    assert.equal(estrena.motivo, 'agregar-lastre');
    assert.equal(estrena.pesoKg, null);

    // El usuario decide 2,5 kg y entrena una sesión con esos objetivos.
    const conDisco = sugerirCarga([intento(2.5, [6, 7, 9], estrena.objetivos)], PLAN_LASTRE,
                                  ej('dominadas'), reglas);
    assert.equal(conDisco.motivo, 'seguir');
    assert.equal(conDisco.pesoKg, 2.5);
    assert.deepEqual(conDisco.objetivos, [7, 8, null]);

    // Y desde ahí sube sola, sin volver a preguntar.
    const sube = sugerirCarga([intento(2.5, [10, 10, 10], [10, 10, null])], PLAN_LASTRE,
                              ej('dominadas'), reglas);
    assert.equal(sube.motivo, 'subir');
    assert.equal(sube.pesoKg, 3.75);
  });
});

// =====================================================================
// De a cuánto sube: el equipo, y la columna que lo pisa.
// =====================================================================

describe('saltoDe — cuántos kilos se suman', () => {
  test('por defecto, el del equipo', () => {
    const equipo = reglas.equipos['barra'];
    assert.equal(saltoDe(ej('press-banca'), equipo), equipo.subirKg);
  });

  test('la columna subir_kg del ejercicio pisa la del equipo', () => {
    const equipo = reglas.equipos['barra'];
    const lento = { ...ej('press-banca'), subirKg: 1 };
    assert.equal(saltoDe(lento, equipo), 1);
  });

  test('y eso se ve en la sugerencia: el press militar puede subir más lento que la sentadilla', () => {
    const lento = { ...ej('press-militar'), subirKg: 1 };
    const s = sugerirCarga([intento(40, [10, 10, 10], [10, 10, null])],
                           { ...PLAN, ejercicioId: 'press-militar' }, lento, reglas);
    // 41 no se puede armar con una barra que salta de a 2,5: queda en el escalón más cercano.
    assert.equal(s.pesoKg, 40 + reglas.equipos['barra'].incrementoMinimoKg);
  });

  test('un subir_kg vacío o cero no pisa nada', () => {
    const equipo = reglas.equipos['barra'];
    assert.equal(saltoDe({ ...ej('press-banca'), subirKg: 0 }, equipo), equipo.subirKg);
    assert.equal(saltoDe(ej('press-banca'), equipo), equipo.subirKg);
  });
});

describe('redondearACargaPosible — los pesos que se pueden armar de verdad', () => {
  test('una barra olímpica no puede pesar 41 kg', () => {
    assert.equal(redondearACargaPosible(41, reglas.equipos['barra']), 40);
    assert.equal(redondearACargaPosible(41.5, reglas.equipos['barra']), 42.5);
  });

  test('nunca devuelve menos que la barra vacía', () => {
    assert.equal(redondearACargaPosible(5, reglas.equipos['barra']), 20);
  });

  test('con incremento cero no hay nada que redondear', () => {
    assert.equal(redondearACargaPosible(13.7, reglas.equipos['peso-corporal']), 13.7);
  });

  test('la banda no se mide en kilos, así que tampoco redondea', () => {
    assert.equal(redondearACargaPosible(3, reglas.equipos['banda']), 3);
  });

  test('el usuario nunca queda trabado: si el redondeo no mueve, empujamos un escalón', () => {
    // Con salto más chico que el escalón del equipo, redondear devolvería el mismo peso.
    const trabado = { ...ej('press-banca'), subirKg: 0.1 };
    const s = sugerirCarga([intento(40, [10, 10, 10], [10, 10, null])], PLAN, trabado, reglas);
    assert.ok(/** @type {number} */ (s.pesoKg) > 40, 'tiene que subir algo sí o sí');
  });
});

describe('redondear2 — la aritmética de los decimales', () => {
  test('arregla lo que hace mal la computadora', () => {
    assert.equal(redondear2(41.000000000000006), 41);
    assert.equal(redondear2(2.5 * 3), 7.5);
  });
});

describe('describirObjetivos — cómo se cuenta en pantalla', () => {
  test('dos números y la última al fallo', () => {
    assert.equal(describirObjetivos([6, 7, null]), '6 y 7, y la última al fallo');
  });

  test('un solo número y la última al fallo', () => {
    assert.equal(describirObjetivos([6, null]), '6, y la última al fallo');
  });

  test('todas al fallo', () => {
    assert.equal(describirObjetivos([null]), 'al fallo');
  });
});

describe('objetivosEnLinea — la versión corta, para la lista de Hoy', () => {
  test('separa con puntos medios y nombra la del fallo', () => {
    assert.equal(objetivosEnLinea([8, 9, null]), '8 · 9 · al fallo');
  });

  test('aguanta cualquier cantidad de series', () => {
    assert.equal(objetivosEnLinea([6, 7, 8, 8, null]), '6 · 7 · 8 · 8 · al fallo');
    assert.equal(objetivosEnLinea([null]), 'al fallo');
  });

  /*
   * El punto de que esta función exista. La pantalla de Hoy mostraba "3 × 8-12", el modelo
   * viejo de tres series iguales contra un rango, mientras el motor ya trabajaba con un
   * objetivo por serie: las dos pantallas decían cosas distintas del mismo ejercicio.
   */
  test('lo que muestra Hoy sale de sugerirCarga, igual que la pantalla de sesión', () => {
    const s = sugerirCarga([intento(40, [7, 8, 10], [7, 8, null])], PLAN, ej('press-banca'), reglas);
    assert.equal(objetivosEnLinea(s.objetivos), '8 · 9 · al fallo');
  });
});

// =====================================================================
// Historial viejo, guardado antes de que existiera esta regla.
// =====================================================================

describe('historial de antes de esta regla', () => {
  test('un intento sin objetivos no rompe nada', () => {
    const viejo = { fechaTs: AYER, pesoKg: 40, reps: [8, 8, 9] };
    const s = sugerirCarga([viejo], PLAN, ej('press-banca'), reglas);
    assert.ok(Array.isArray(s.objetivos));
    assert.equal(s.objetivos.length, PLAN.series);
    assert.equal(s.pesoKg, 40);
  });

  test('si en ese intento llegó al techo en todas, sube igual', () => {
    const viejo = { fechaTs: AYER, pesoKg: 40, reps: [10, 10, 10] };
    const s = sugerirCarga([viejo], PLAN, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 42.5);
  });
});

// =====================================================================
// Datos mal cargados: la app no puede romperse en el medio del gimnasio.
// =====================================================================

describe('cuando los datos vienen mal', () => {
  test('un equipo que no existe en reglas.json avisa y sigue con saltos de 1 kg', () => {
    const inventado = { ...ej('press-banca'), equipo: 'teletransportador' };
    const s = sugerirCarga([intento(40, [10, 10, 10], [10, 10, null])], PLAN, inventado, reglas);
    assert.ok(s.advertencia, 'tiene que avisar');
    assert.equal(s.pesoKg, 41);
  });

  test('un ejercicio sin equipo cargado también sigue funcionando', () => {
    const sinEquipo = { ...ej('press-banca'), equipo: '' };
    const s = sugerirCarga([intento(40, [10, 10, 10], [10, 10, null])], PLAN, sinEquipo, reglas);
    assert.match(/** @type {string} */ (s.advertencia), /no tiene equipo/i);
    assert.equal(s.pesoKg, 41);
  });

  test('siempre devuelve una explicación para mostrar', () => {
    const casos = [
      sugerirCarga([], PLAN, ej('press-banca'), reglas),
      sugerirCarga([intento(40, [6, 7, 9], [6, 7, null])], PLAN, ej('press-banca'), reglas),
      sugerirCarga([intento(40, [10, 10, 10], [10, 10, null])], PLAN, ej('press-banca'), reglas)
    ];
    for (const s of casos) {
      assert.ok(typeof s.explicacion === 'string' && s.explicacion.length > 0);
    }
  });
});

// =====================================================================
// Los datos del socio.
// =====================================================================

describe('datos/reglas.json', () => {
  test('todos los equipos tienen subirKg', () => {
    for (const [clave, eq] of Object.entries(reglas.equipos)) {
      assert.equal(typeof eq.subirKg, 'number', 'al equipo "' + clave + '" le falta subirKg');
    }
  });

  test('ya no quedan los números de la regla vieja', () => {
    const p = /** @type {any} */ (reglas).progresion;
    if (p) {
      assert.equal(p.bajarPorcentaje, undefined, 'el deload automático ya no existe');
      assert.equal(p.sesionesFallidasParaBajar, undefined, 'el deload automático ya no existe');
      assert.equal(p.multiplicadorSiFueFacil, undefined, 'los botones de esfuerzo ya no existen');
    }
  });

  test('están los equipos nuevos de la planilla', () => {
    assert.ok(reglas.equipos['banda'], 'falta el equipo banda');
    assert.ok(reglas.equipos['disco'], 'falta el equipo disco');
    assert.equal(reglas.equipos['banda'].incrementoMinimoKg, 0, 'la banda no se mide en kilos');
    assert.equal(reglas.equipos['disco'].incrementoMinimoKg, 2.5);
  });
});

describe('el catálogo real de la planilla', () => {
  test('hay ejercicios cargados y todos tienen id, nombre y grupo', () => {
    assert.ok(catalogoReal.length > 0, 'datos/ejercicios.json está vacío');
    for (const e of catalogoReal) {
      assert.ok(e.id, 'hay un ejercicio sin id');
      assert.ok(e.nombre, 'el ejercicio "' + e.id + '" no tiene nombre');
      assert.ok(e.grupo, 'el ejercicio "' + e.id + '" no tiene grupo');
    }
  });

  test('no hay ids repetidos', () => {
    const vistos = new Set();
    for (const e of catalogoReal) {
      assert.ok(!vistos.has(e.id), 'el id "' + e.id + '" está repetido');
      vistos.add(e.id);
    }
  });

  test('todo equipo cargado existe en reglas.json', () => {
    /*
     * No se exige acá que TODOS tengan equipo. Un equipo vacío es un dato que el socio
     * todavía no completó, y la app lo banca suponiendo saltos de 1 kg. Quién está sin
     * cargar lo dice el validador, por nombre, en cada corrida: ese es el canal para eso.
     * Lo que sí es un error de verdad, y se revisa acá, es un equipo escrito que no existe.
     */
    for (const e of catalogoReal) {
      if (!e.equipo) continue;
      assert.ok(reglas.equipos[e.equipo],
        'el ejercicio "' + e.id + '" usa el equipo "' + e.equipo + '", que no está en reglas.json');
    }
  });

  test('ya no queda ningún peso inicial cargado', () => {
    for (const e of catalogoReal) {
      assert.equal(/** @type {any} */ (e).pesoInicialKg, undefined,
        'el ejercicio "' + e.id + '" todavía tiene peso inicial, y la app ya no recomienda peso');
    }
  });

  test('todos los sustitutos apuntan a ejercicios que existen', () => {
    const ids = new Set(catalogoReal.map((e) => e.id));
    for (const e of catalogoReal) {
      for (const s of e.sustitutos || []) {
        assert.ok(ids.has(s), 'el ejercicio "' + e.id + '" tiene como sustituto a "' + s + '", que no existe');
      }
    }
  });

  test('los videos son links, no texto suelto', () => {
    for (const e of catalogoReal) {
      if (e.video === undefined) continue;
      assert.match(e.video, /^https?:\/\//, 'el video de "' + e.id + '" no es un link: ' + e.video);
    }
  });

  test('en los asistidos el escalón sale del equipo de asistencia, no de la columna', () => {
    const asistidos = catalogoReal.filter((e) => e.admiteAsistencia);
    assert.ok(asistidos.length > 0, 'la planilla no tiene ningún ejercicio asistido');
    for (const e of asistidos) {
      const eq = equipoDeCarga(e, reglas);
      assert.ok(eq, 'el asistido "' + e.id + '" se quedó sin equipo de carga');
      assert.ok(eq.incrementoMinimoKg > 0,
        'el asistido "' + e.id + '" tiene escalón 0: el usuario no podría anotar la ayuda');
    }
  });

  test('los de lastre también tienen escalón propio', () => {
    for (const e of catalogoReal.filter((x) => x.admiteLastre)) {
      const eq = equipoDeCarga(e, reglas);
      assert.ok(eq && eq.incrementoMinimoKg > 0, 'el ejercicio con lastre "' + e.id + '" tiene escalón 0');
    }
  });

  test('ninguna ficha rompe la sugerencia, ni sin historial ni con historial', () => {
    for (const e of catalogoReal) {
      const plan = { ...PLAN, ejercicioId: e.id };

      const primera = sugerirCarga([], plan, e, reglas);
      assert.ok(primera.explicacion.length > 0, 'el ejercicio "' + e.id + '" no produjo explicación');
      assert.equal(primera.objetivos.length, plan.series);

      const seguido = sugerirCarga([intento(20, [6, 7, 9], [6, 7, null])], plan, e, reglas);
      assert.ok(typeof seguido.pesoKg === 'number' && Number.isFinite(seguido.pesoKg),
        'el ejercicio "' + e.id + '" devolvió un peso que no es un número');

      const alTecho = sugerirCarga([intento(20, [10, 10, 10], [10, 10, null])], plan, e, reglas);
      assert.ok(typeof alTecho.pesoKg === 'number' && Number.isFinite(alTecho.pesoKg),
        'el ejercicio "' + e.id + '" devolvió un peso que no es un número al llegar al techo');
    }
  });
});
