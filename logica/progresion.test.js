// @ts-check
/**
 * logica/progresion.test.js — Tests de la lógica de progresión.
 *
 * Correr con:   node --test
 *
 * Sin dependencias: el corredor de tests viene adentro de Node.
 *
 * Los tests usan el datos/reglas.json REAL, no una copia inventada. Así, si el socio
 * carga un número que rompe la progresión, los tests se quejan antes de que llegue al
 * teléfono de nadie.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sugerirCarga, redondearACargaPosible, completoElRango, fallosSeguidos, redondear2 } from './progresion.js';

/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
/** @type {Reglas} */
const reglas = JSON.parse(readFileSync(join(RAIZ, 'datos/reglas.json'), 'utf8'));

/** Un ejercicio de barra: 3 series de 8 a 12. @type {EjercicioPlanificado} */
const PLAN_BARRA = { ejercicioId: 'press-banca', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 120, pesoInicialKg: 20 };

/** @type {EjercicioPlanificado} */
const PLAN_CORPORAL = { ejercicioId: 'plancha', series: 3, repsMin: 20, repsMax: 45, descansoSeg: 60, pesoInicialKg: null };

/** Atajo para armar un intento pasado. */
const intento = (/** @type {number} */ pesoKg, /** @type {number[]} */ reps) => ({ fechaTs: Date.now(), pesoKg, reps });

// =====================================================================

describe('redondear2', () => {
  test('arregla la suma de decimales de la computadora', () => {
    // 40 * 1.025 da 41.000000000000006 en JavaScript. Sin esto, eso llega a la pantalla.
    assert.equal(redondear2(40 * 1.025), 41);
    assert.equal(redondear2(0.1 + 0.2), 0.3);
  });
});

describe('redondearACargaPosible', () => {
  const barra = reglas.equipos['barra'];
  const maquina = reglas.equipos['maquina'];
  const corporal = reglas.equipos['peso-corporal'];

  test('con barra solo existen 20, 22.5, 25…', () => {
    assert.equal(redondearACargaPosible(41, barra), 40);
    assert.equal(redondearACargaPosible(41.5, barra), 42.5);
    assert.equal(redondearACargaPosible(22.5, barra), 22.5);
  });

  test('nunca devuelve menos que la barra vacía', () => {
    assert.equal(redondearACargaPosible(5, barra), 20);
    assert.equal(redondearACargaPosible(-100, barra), 20);
  });

  test('una máquina sube de a 5', () => {
    assert.equal(redondearACargaPosible(102.5, maquina), 105);
    assert.equal(redondearACargaPosible(101, maquina), 100);
  });

  test('peso corporal no divide por cero', () => {
    assert.equal(redondearACargaPosible(0, corporal), 0);
    assert.equal(redondearACargaPosible(12.345, corporal), 12.35);
  });
});

describe('completoElRango', () => {
  test('hay que llegar al techo en TODAS las series', () => {
    assert.equal(completoElRango([12, 12, 12], PLAN_BARRA), true);
    assert.equal(completoElRango([12, 12, 11], PLAN_BARRA), false);
  });

  test('dos series perfectas de tres no alcanzan', () => {
    assert.equal(completoElRango([12, 12], PLAN_BARRA), false);
  });

  test('pasarse del techo también cuenta', () => {
    assert.equal(completoElRango([14, 13, 12], PLAN_BARRA), true);
  });

  test('no se rompe con datos vacíos o basura', () => {
    assert.equal(completoElRango([], PLAN_BARRA), false);
    // @ts-expect-error — probamos a propósito con un dato del tipo equivocado
    assert.equal(completoElRango(null, PLAN_BARRA), false);
  });
});

describe('fallosSeguidos', () => {
  test('cuenta los fracasos al mismo peso', () => {
    assert.equal(fallosSeguidos([intento(40, [10, 9, 8]), intento(40, [9, 9, 8])], PLAN_BARRA), 2);
  });

  test('se corta al llegar a una sesión completada', () => {
    assert.equal(fallosSeguidos([intento(40, [10, 9, 8]), intento(40, [12, 12, 12])], PLAN_BARRA), 1);
  });

  test('NO arrastra los fracasos de un peso más pesado', () => {
    // El usuario bajó de 40 a 35. Los dos fracasos con 40 kg ya no cuentan: está
    // intentando otra carga.
    const historial = [intento(35, [10, 9, 8]), intento(40, [9, 8, 8]), intento(40, [9, 8, 7])];
    assert.equal(fallosSeguidos(historial, PLAN_BARRA), 1);
  });

  test('sin historial es cero', () => {
    assert.equal(fallosSeguidos([], PLAN_BARRA), 0);
  });
});

describe('sugerirCarga — primera vez', () => {
  test('sin historial usa el peso inicial de la rutina', () => {
    const s = sugerirCarga([], PLAN_BARRA, 'barra', reglas);
    assert.equal(s.motivo, 'primera-vez');
    assert.equal(s.pesoKg, 20);
    assert.equal(s.repsObjetivo, 8);
  });

  test('sin historial y sin peso inicial devuelve null, no se rompe', () => {
    const s = sugerirCarga([], PLAN_CORPORAL, 'peso-corporal', reglas);
    assert.equal(s.motivo, 'primera-vez');
    assert.equal(s.pesoKg, null);
    assert.match(s.explicacion, /elegí un peso/);
  });
});

describe('sugerirCarga — subir', () => {
  test('el caso borde clave: el porcentaje es más chico que el disco más chico', () => {
    // 40 kg + 2,5% = 41 kg. Con barra, 41 no existe y redondea a 40: el usuario quedaría
    // trabado para siempre en 40. Tiene que empujarlo a 42,5.
    const s = sugerirCarga([intento(40, [12, 12, 12])], PLAN_BARRA, 'barra', reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 42.5);
    assert.equal(s.repsObjetivo, 8, 'al subir el peso se vuelve al piso de repeticiones');
  });

  test('con pesos grandes el porcentaje alcanza solo', () => {
    const plan = { ...PLAN_BARRA, ejercicioId: 'sentadilla' };
    const s = sugerirCarga([intento(100, [12, 12, 12])], plan, 'barra', reglas);
    assert.equal(s.pesoKg, 102.5);
  });

  test('nunca sugiere el mismo peso al subir', () => {
    // Recorremos cargas reales de barra y verificamos que SIEMPRE suba.
    for (let peso = 20; peso <= 200; peso += 2.5) {
      const s = sugerirCarga([intento(peso, [12, 12, 12])], PLAN_BARRA, 'barra', reglas);
      assert.ok(
        s.pesoKg !== null && s.pesoKg > peso,
        'con ' + peso + ' kg sugirió ' + s.pesoKg + ', que no es una subida'
      );
    }
  });

  test('en peso corporal sube repeticiones, no kilos', () => {
    const s = sugerirCarga([intento(0, [45, 45, 45])], PLAN_CORPORAL, 'peso-corporal', reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 0);
    assert.match(s.explicacion, /repeticiones/);
  });
});

describe('sugerirCarga — mantener', () => {
  test('si no completó el rango se queda igual y apunta al techo', () => {
    const s = sugerirCarga([intento(40, [12, 11, 10])], PLAN_BARRA, 'barra', reglas);
    assert.equal(s.motivo, 'mantener');
    assert.equal(s.pesoKg, 40);
    assert.equal(s.repsObjetivo, 12);
  });
});

describe('sugerirCarga — el usuario bajó el peso por su cuenta', () => {
  test('respeta la baja en vez de mandarlo de vuelta arriba', () => {
    const historial = [intento(35, [10, 10, 9]), intento(40, [9, 8, 8])];
    const s = sugerirCarga(historial, PLAN_BARRA, 'barra', reglas);
    assert.equal(s.motivo, 'bajaste-el-peso');
    assert.equal(s.pesoKg, 35);
    assert.equal(s.repsObjetivo, 12);
  });

  test('y no lo baja de nuevo por fracasos viejos con más peso', () => {
    const historial = [intento(35, [10, 9, 8]), intento(40, [9, 8, 8]), intento(40, [9, 8, 7])];
    const s = sugerirCarga(historial, PLAN_BARRA, 'barra', reglas);
    assert.notEqual(s.motivo, 'bajar');
    assert.equal(s.pesoKg, 35);
  });
});

describe('sugerirCarga — bajar por estancamiento', () => {
  test('después de dos fracasos seguidos al mismo peso, baja', () => {
    const historial = [intento(40, [10, 9, 8]), intento(40, [9, 9, 8])];
    const s = sugerirCarga(historial, PLAN_BARRA, 'barra', reglas);
    assert.equal(s.motivo, 'bajar');
    // 40 - 10% = 36, que con barra no existe: la carga posible más cercana es 35.
    assert.equal(s.pesoKg, 35);
    assert.equal(s.repsObjetivo, 8);
  });

  test('un solo fracaso no alcanza para bajar', () => {
    const s = sugerirCarga([intento(40, [10, 9, 8])], PLAN_BARRA, 'barra', reglas);
    assert.equal(s.motivo, 'mantener');
  });

  test('nunca baja de la barra vacía', () => {
    const historial = [intento(20, [5, 5, 5]), intento(20, [5, 5, 4])];
    const s = sugerirCarga(historial, PLAN_BARRA, 'barra', reglas);
    assert.equal(s.pesoKg, 20, 'no se puede levantar menos que una barra vacía');
  });
});

describe('sugerirCarga — datos mal cargados', () => {
  test('con un equipo que no está en reglas.json avisa pero no se rompe', () => {
    const s = sugerirCarga([intento(40, [12, 12, 12])], PLAN_BARRA, 'inventado', reglas);
    assert.equal(s.motivo, 'subir');
    assert.ok(s.pesoKg !== null && s.pesoKg > 40);
    assert.match(String(s.advertencia), /no está en reglas\.json/);
  });

  test('todos los equipos del catálogo están definidos en reglas.json', () => {
    const ejercicios = JSON.parse(readFileSync(join(RAIZ, 'datos/ejercicios.json'), 'utf8'));
    for (const e of ejercicios) {
      assert.ok(reglas.equipos[e.equipo], 'el ejercicio "' + e.id + '" usa el equipo "' + e.equipo + '", que no existe en reglas.json');
    }
  });
});
