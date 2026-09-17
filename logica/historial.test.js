// @ts-check
/**
 * logica/historial.test.js — Tests de las cuentas sobre el historial.
 *
 * Correr con:  node --test
 *
 * El test más importante es el último bloque: comprueba que el historial guardado y la
 * lógica de progresión se entiendan entre ellos. Cada pieza puede estar bien por separado
 * y el conjunto estar mal, y eso no lo agarra ningún test de una sola pieza.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  sesionesTerminadas, sesionEnCurso, pesoPredominante, intentosDeEjercicio,
  ultimoPorEjercicio, volumenTotal, resumenSesion, diasEntrenadosEnLosUltimos,
  sesionCompleta, esRecord, semanaEntrenada
} from './historial.js';
import { sugerirCarga } from './progresion.js';

/** @typedef {import('../tipos.js').Sesion} Sesion */
/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
/** @type {Reglas} */
const reglas = JSON.parse(readFileSync(join(RAIZ, 'datos/reglas.json'), 'utf8'));
/** @type {import('../tipos.js').Ejercicio[]} */
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'datos/ejercicios.json'), 'utf8'));
const pressBanca = catalogo.find((e) => e.id === 'press-banca');
if (!pressBanca) throw new Error('falta press-banca en datos/ejercicios.json');

const DIA = 24 * 60 * 60 * 1000;
const HOY = Date.parse('2026-09-15T18:00:00Z');

/**
 * Arma una sesión de prueba.
 * @param {{id?: string, inicioTs: number, finTs?: number|null, series: Array<[string, number, number, number]>}} datos
 *   Cada serie es [ejercicioId, numero, pesoKg, reps].
 * @returns {Sesion}
 */
function sesion({ id = 's' + Math.random(), inicioTs, finTs = inicioTs + 45 * 60000, series }) {
  return {
    id, rutinaId: 'full-body-principiante', diaId: 'a', inicioTs, finTs,
    series: series.map(([ejercicioId, numero, pesoKg, reps]) => ({
      ejercicioId, numero, pesoKg, reps, completadaTs: inicioTs + numero * 120000
    }))
  };
}

// =====================================================================

describe('sesionesTerminadas', () => {
  test('deja afuera la que está en curso y ordena de la más nueva a la más vieja', () => {
    const lista = [
      sesion({ id: 'vieja', inicioTs: HOY - 7 * DIA, series: [['press-banca', 1, 40, 10]] }),
      sesion({ id: 'abierta', inicioTs: HOY, finTs: null, series: [['press-banca', 1, 45, 8]] }),
      sesion({ id: 'nueva', inicioTs: HOY - DIA, series: [['press-banca', 1, 42.5, 9]] })
    ];
    assert.deepEqual(sesionesTerminadas(lista).map((s) => s.id), ['nueva', 'vieja']);
  });
});

describe('sesionEnCurso', () => {
  test('encuentra la sesión abierta', () => {
    const abierta = sesion({ id: 'abierta', inicioTs: HOY, finTs: null, series: [] });
    const s = sesionEnCurso([sesion({ inicioTs: HOY - DIA, series: [] }), abierta]);
    assert.equal(s && s.id, 'abierta');
  });

  test('devuelve null si están todas cerradas', () => {
    assert.equal(sesionEnCurso([sesion({ inicioTs: HOY, series: [] })]), null);
  });

  test('no se rompe sin sesiones', () => {
    assert.equal(sesionEnCurso([]), null);
  });
});

describe('pesoPredominante', () => {
  const serie = (/** @type {number} */ numero, /** @type {number} */ pesoKg, /** @type {number} */ reps) =>
    ({ ejercicioId: 'x', numero, pesoKg, reps, completadaTs: 0 });

  test('el peso que más se repite', () => {
    assert.equal(pesoPredominante([serie(1, 40, 12), serie(2, 40, 11), serie(3, 35, 10)]), 40);
  });

  test('si hay empate, gana el más pesado', () => {
    assert.equal(pesoPredominante([serie(1, 40, 10), serie(2, 35, 12)]), 40);
  });

  test('sin series devuelve cero', () => {
    assert.equal(pesoPredominante([]), 0);
  });
});

describe('intentosDeEjercicio', () => {
  test('un intento por sesión, del más reciente al más viejo', () => {
    const lista = [
      sesion({ inicioTs: HOY - 7 * DIA, series: [['press-banca', 1, 40, 10], ['press-banca', 2, 40, 9]] }),
      sesion({ inicioTs: HOY - 2 * DIA, series: [['press-banca', 1, 42.5, 8]] })
    ];
    const intentos = intentosDeEjercicio(lista, 'press-banca');
    assert.equal(intentos.length, 2);
    assert.equal(intentos[0].pesoKg, 42.5, 'el primero tiene que ser el más reciente');
    assert.deepEqual(intentos[1].reps, [10, 9]);
  });

  test('ignora los otros ejercicios de la misma sesión', () => {
    const lista = [sesion({ inicioTs: HOY, series: [['press-banca', 1, 40, 10], ['sentadilla', 1, 60, 8]] })];
    assert.deepEqual(intentosDeEjercicio(lista, 'sentadilla')[0].reps, [8]);
  });

  test('si bajó el peso en la última serie, esa serie no cuenta', () => {
    // 40, 40, 35: el peso del día es 40 y solo cuentan dos series. Así la progresión lo
    // toma como rango no completado, que es lo correcto.
    const lista = [sesion({ inicioTs: HOY, series: [['press-banca', 1, 40, 12], ['press-banca', 2, 40, 12], ['press-banca', 3, 35, 12]] })];
    const intento = intentosDeEjercicio(lista, 'press-banca')[0];
    assert.equal(intento.pesoKg, 40);
    assert.deepEqual(intento.reps, [12, 12]);
  });

  test('la sesión en curso no entra al historial', () => {
    const lista = [sesion({ inicioTs: HOY, finTs: null, series: [['press-banca', 1, 50, 12]] })];
    assert.deepEqual(intentosDeEjercicio(lista, 'press-banca'), []);
  });

  test('un ejercicio que nunca hizo devuelve lista vacía', () => {
    assert.deepEqual(intentosDeEjercicio([sesion({ inicioTs: HOY, series: [['press-banca', 1, 40, 10]] })], 'prensa'), []);
  });
});

describe('ultimoPorEjercicio', () => {
  test('se queda con lo más reciente de cada ejercicio', () => {
    const lista = [
      sesion({ inicioTs: HOY - 7 * DIA, series: [['press-banca', 1, 40, 10], ['sentadilla', 1, 60, 8]] }),
      sesion({ inicioTs: HOY - DIA, series: [['press-banca', 1, 45, 8]] })
    ];
    const mapa = ultimoPorEjercicio(lista);
    assert.equal(mapa.get('press-banca')?.pesoKg, 45);
    assert.equal(mapa.get('sentadilla')?.pesoKg, 60, 'un ejercicio viejo se mantiene si no lo repitió');
    assert.equal(mapa.get('prensa'), undefined);
  });
});

describe('volumenTotal y resumenSesion', () => {
  test('el volumen es peso por repeticiones, sumado', () => {
    const s = sesion({ inicioTs: HOY, series: [['press-banca', 1, 40, 10], ['press-banca', 2, 40, 8]] });
    assert.equal(volumenTotal(s), 720);
  });

  test('el resumen cuenta series, ejercicios y duración', () => {
    const s = sesion({ inicioTs: HOY, finTs: HOY + 45 * 60000, series: [['press-banca', 1, 40, 10], ['sentadilla', 1, 60, 8]] });
    const r = resumenSesion(s);
    assert.equal(r.series, 2);
    assert.equal(r.ejercicios, 2);
    assert.equal(r.duracionMin, 45);
    assert.equal(r.terminada, true);
  });

  test('una sesión en curso no tiene duración', () => {
    assert.equal(resumenSesion(sesion({ inicioTs: HOY, finTs: null, series: [] })).duracionMin, null);
  });
});

describe('diasEntrenadosEnLosUltimos', () => {
  test('cuenta días distintos, no sesiones', () => {
    const lista = [
      sesion({ inicioTs: HOY - DIA, series: [] }),
      sesion({ inicioTs: HOY - DIA + 3600000, series: [] }), // mismo día, otra sesión
      sesion({ inicioTs: HOY - 3 * DIA, series: [] })
    ];
    assert.equal(diasEntrenadosEnLosUltimos(lista, 7, HOY), 2);
  });

  test('deja afuera lo que quedó fuera de la ventana', () => {
    const lista = [sesion({ inicioTs: HOY - 30 * DIA, series: [] })];
    assert.equal(diasEntrenadosEnLosUltimos(lista, 7, HOY), 0);
  });
});

// =====================================================================
// El que de verdad importa: que las dos piezas se entiendan entre ellas.
// =====================================================================

describe('historial + progresión juntos', () => {
  /** @type {EjercicioPlanificado} */
  const plan = { ejercicioId: 'press-banca', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 120 };

  test('una sesión completa hace que la próxima suba el peso', () => {
    const lista = [sesion({ inicioTs: HOY - DIA, series: [['press-banca', 1, 40, 12], ['press-banca', 2, 40, 12], ['press-banca', 3, 40, 12]] })];
    const s = sugerirCarga(intentosDeEjercicio(lista, 'press-banca'), plan, pressBanca, reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 42.5);
  });

  test('bajar en la última serie NO cuenta como completada', () => {
    const lista = [sesion({ inicioTs: HOY - DIA, series: [['press-banca', 1, 40, 12], ['press-banca', 2, 40, 12], ['press-banca', 3, 35, 12]] })];
    const s = sugerirCarga(intentosDeEjercicio(lista, 'press-banca'), plan, pressBanca, reglas);
    assert.equal(s.motivo, 'mantener');
    assert.equal(s.pesoKg, 40);
  });

  test('sin historial cae en primera vez, no en un error', () => {
    const s = sugerirCarga(intentosDeEjercicio([], 'press-banca'), plan, pressBanca, reglas);
    assert.equal(s.motivo, 'primera-vez');
    assert.equal(s.pesoKg, 20);
  });

  test('dos sesiones estancadas seguidas bajan el peso', () => {
    const lista = [
      sesion({ inicioTs: HOY - 7 * DIA, series: [['press-banca', 1, 40, 9], ['press-banca', 2, 40, 8], ['press-banca', 3, 40, 8]] }),
      sesion({ inicioTs: HOY - 2 * DIA, series: [['press-banca', 1, 40, 10], ['press-banca', 2, 40, 9], ['press-banca', 3, 40, 8]] })
    ];
    const s = sugerirCarga(intentosDeEjercicio(lista, 'press-banca'), plan, pressBanca, reglas);
    assert.equal(s.motivo, 'bajar');
    assert.equal(s.pesoKg, 35);
  });

  test('la sesión de hoy todavía abierta no cambia la sugerencia de hoy', () => {
    const lista = [
      sesion({ inicioTs: HOY - 2 * DIA, series: [['press-banca', 1, 40, 12], ['press-banca', 2, 40, 12], ['press-banca', 3, 40, 12]] }),
      sesion({ inicioTs: HOY, finTs: null, series: [['press-banca', 1, 42.5, 8]] })
    ];
    const s = sugerirCarga(intentosDeEjercicio(lista, 'press-banca'), plan, pressBanca, reglas);
    assert.equal(s.pesoKg, 42.5, 'tiene que seguir sugiriendo lo mismo mientras entrenás');
  });
});

// =====================================================================
// Unilaterales: el usuario anota el peso de UNA mancuerna, nunca la suma.
// =====================================================================

describe('volumen con ejercicios unilaterales', () => {
  const unilaterales = new Set(['curl-mancuernas']);

  test('un unilateral cuenta los dos lados', () => {
    // El usuario anotó 10 kg (lo que dice la mancuerna) por 10 repeticiones. El trabajo
    // real fue de los dos lados, así que el volumen es 200, no 100.
    const s = sesion({ inicioTs: HOY, series: [['curl-mancuernas', 1, 10, 10]] });
    assert.equal(volumenTotal(s, unilaterales), 200);
  });

  test('un ejercicio normal cuenta una sola vez', () => {
    const s = sesion({ inicioTs: HOY, series: [['press-banca', 1, 40, 10]] });
    assert.equal(volumenTotal(s, unilaterales), 400);
  });

  test('sin la lista de unilaterales no se rompe: cuenta todo simple', () => {
    const s = sesion({ inicioTs: HOY, series: [['curl-mancuernas', 1, 10, 10]] });
    assert.equal(volumenTotal(s), 100);
  });

  test('el resumen de la sesión usa la misma cuenta', () => {
    const s = sesion({ inicioTs: HOY, series: [['curl-mancuernas', 1, 10, 10], ['press-banca', 1, 40, 10]] });
    assert.equal(resumenSesion(s, unilaterales).volumenKg, 600);
  });

  test('los unilaterales del catálogo real están marcados', () => {
    const marcados = catalogo.filter((e) => e.esUnilateral).map((e) => e.id);
    assert.ok(marcados.includes('curl-mancuernas'), 'el curl con mancuernas es unilateral');
    assert.ok(marcados.length >= 3, 'tendría que haber varios unilaterales en el catálogo');
  });
});

// =====================================================================
// Lo que necesita el historial nuevo: récord, incompleto y la tira de la semana.
// =====================================================================

describe('sesionCompleta', () => {
  const plan = [
    { ejercicioId: 'press-banca', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 120 },
    { ejercicioId: 'sentadilla', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 120 }
  ];

  test('con todas las series hechas, está completa', () => {
    const s = sesion({ inicioTs: HOY, series: [
      ['press-banca', 1, 40, 10], ['press-banca', 2, 40, 10], ['press-banca', 3, 40, 10],
      ['sentadilla', 1, 60, 10], ['sentadilla', 2, 60, 10], ['sentadilla', 3, 60, 10]
    ] });
    assert.equal(sesionCompleta(s, plan), true);
  });

  test('si falta una serie de un ejercicio, está incompleta', () => {
    const s = sesion({ inicioTs: HOY, series: [
      ['press-banca', 1, 40, 10], ['press-banca', 2, 40, 10], ['press-banca', 3, 40, 10],
      ['sentadilla', 1, 60, 10], ['sentadilla', 2, 60, 10]
    ] });
    assert.equal(sesionCompleta(s, plan), false);
  });

  test('si se salteó un ejercicio entero, está incompleta', () => {
    const s = sesion({ inicioTs: HOY, series: [
      ['press-banca', 1, 40, 10], ['press-banca', 2, 40, 10], ['press-banca', 3, 40, 10]
    ] });
    assert.equal(sesionCompleta(s, plan), false);
  });

  test('sin plan no se rompe', () => {
    assert.equal(sesionCompleta(sesion({ inicioTs: HOY, series: [] }), []), true);
  });
});

describe('esRecord', () => {
  const previa = sesion({ inicioTs: HOY - 7 * DIA, series: [['press-banca', 1, 40, 10]] });

  test('superar el mejor peso es récord', () => {
    const hoy = sesion({ inicioTs: HOY, series: [['press-banca', 1, 42.5, 8]] });
    assert.equal(esRecord(hoy, [previa]), true);
  });

  test('igualar no es récord', () => {
    const hoy = sesion({ inicioTs: HOY, series: [['press-banca', 1, 40, 12]] });
    assert.equal(esRecord(hoy, [previa]), false);
  });

  test('la primera vez que hacés un ejercicio NO es récord', () => {
    // Si no, la primera semana entera saldría marcada y la etiqueta no querría decir nada.
    const hoy = sesion({ inicioTs: HOY, series: [['prensa', 1, 100, 10]] });
    assert.equal(esRecord(hoy, [previa]), false);
  });

  test('no mira sesiones posteriores a la que se evalúa', () => {
    const futura = sesion({ inicioTs: HOY + DIA, series: [['press-banca', 1, 100, 5]] });
    const hoy = sesion({ inicioTs: HOY, series: [['press-banca', 1, 42.5, 8]] });
    assert.equal(esRecord(hoy, [previa, futura]), true);
  });

  test('en un asistido, el récord es necesitar MENOS ayuda', () => {
    const invertidos = new Set(['dominadas-asistidas']);
    const antes = sesion({ inicioTs: HOY - DIA, series: [['dominadas-asistidas', 1, 30, 8]] });
    const menos = sesion({ inicioTs: HOY, series: [['dominadas-asistidas', 1, 25, 8]] });
    const mas = sesion({ inicioTs: HOY, series: [['dominadas-asistidas', 1, 35, 8]] });
    assert.equal(esRecord(menos, [antes], invertidos), true, 'menos ayuda es mejor');
    assert.equal(esRecord(mas, [antes], invertidos), false, 'más ayuda no es récord');
  });

  test('sin historial previo no hay récord', () => {
    assert.equal(esRecord(sesion({ inicioTs: HOY, series: [['press-banca', 1, 40, 10]] }), []), false);
  });
});

describe('semanaEntrenada', () => {
  // 2026-09-16 cae miércoles.
  const MIERCOLES = Date.parse('2026-09-16T15:00:00');

  test('devuelve siempre siete días, de lunes a domingo', () => {
    const semana = semanaEntrenada([], MIERCOLES);
    assert.equal(semana.length, 7);
    assert.deepEqual(semana.map((d) => d.inicial), ['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  });

  test('marca hoy en el lugar correcto', () => {
    const semana = semanaEntrenada([], MIERCOLES);
    assert.equal(semana.findIndex((d) => d.esHoy), 2, 'el miércoles es el tercer casillero');
  });

  test('marca los días que entrenó', () => {
    const lunes = Date.parse('2026-09-14T10:00:00');
    const semana = semanaEntrenada([sesion({ inicioTs: lunes, series: [] })], MIERCOLES);
    assert.equal(semana[0].entrenado, true);
    assert.equal(semana[1].entrenado, false);
  });

  test('los días que todavía no llegaron quedan marcados como futuros', () => {
    const semana = semanaEntrenada([], MIERCOLES);
    assert.deepEqual(semana.map((d) => d.esFuturo), [false, false, false, true, true, true, true]);
  });

  test('una sesión de la semana pasada no cuenta', () => {
    const semanaPasada = Date.parse('2026-09-08T10:00:00');
    const semana = semanaEntrenada([sesion({ inicioTs: semanaPasada, series: [] })], MIERCOLES);
    assert.equal(semana.some((d) => d.entrenado), false);
  });

  test('la sesión en curso todavía no marca el día', () => {
    const s = sesion({ inicioTs: MIERCOLES, finTs: null, series: [] });
    assert.equal(semanaEntrenada([s], MIERCOLES)[2].entrenado, false);
  });
});
