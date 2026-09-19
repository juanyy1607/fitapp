// @ts-check
/**
 * logica/progresion.test.js — Tests de la lógica de progresión.
 *
 * Correr con:   node --test
 *
 * Sin dependencias: el corredor de tests viene adentro de Node.
 *
 * Los tests usan el datos/reglas.json REAL, no una copia inventada: si el socio carga un
 * número que rompe la progresión, los tests se quejan antes de que llegue al teléfono de
 * nadie.
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
  sugerirCarga, redondearACargaPosible, completoElRango, fallosSeguidos,
  redondear2, modoDeCarga, pesoInicialDe, huboRetroceso, cabeElSaltoDoble,
  equipoDeCarga
} from './progresion.js';
import { normalizarEjercicio } from './catalogo.js';

/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').Ejercicio} Ejercicio */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
/** @type {Reglas} */
const reglas = JSON.parse(readFileSync(join(RAIZ, 'datos/reglas.json'), 'utf8'));

/*
 * Los tests usan su propio catálogo, no el del socio.
 *
 * Antes usaban datos/ejercicios.json, que en ese momento eran datos de prueba. Ahora ese
 * archivo tiene los 184 ejercicios reales y lo maneja el socio: si los tests dependieran
 * de él, renombrar un ejercicio en la planilla rompería la suite de progresión, que no
 * tiene nada que ver. Peor todavía, alguien podría "arreglar" el test cambiando los datos
 * del socio.
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
  if (!e) throw new Error('falta el ejercicio de prueba "' + id + '" en datos/ejercicios.json');
  return e;
};

/** Un ejercicio de barra: 3 series de 8 a 12. @type {EjercicioPlanificado} */
const PLAN_BARRA = { ejercicioId: 'press-banca', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 120 };
/** @type {EjercicioPlanificado} */
const PLAN_CORPORAL = { ejercicioId: 'plancha', series: 3, repsMin: 20, repsMax: 45, descansoSeg: 60 };
/** @type {EjercicioPlanificado} */
const PLAN_ASISTIDO = { ejercicioId: 'dominadas-asistidas', series: 3, repsMin: 6, repsMax: 10, descansoSeg: 120 };
/** @type {EjercicioPlanificado} */
const PLAN_LASTRE = { ejercicioId: 'dominadas', series: 3, repsMin: 6, repsMax: 10, descansoSeg: 120 };

const intento = (/** @type {number} */ pesoKg, /** @type {number[]} */ reps, /** @type {any} */ esfuerzo) =>
  ({ fechaTs: Date.now(), pesoKg, reps, esfuerzo });

// =====================================================================

describe('redondear2', () => {
  test('arregla la suma de decimales de la computadora', () => {
    assert.equal(redondear2(40 * 1.025), 41);
    assert.equal(redondear2(0.1 + 0.2), 0.3);
  });
});

describe('redondearACargaPosible', () => {
  const barra = reglas.equipos['barra'];
  const maquina = reglas.equipos['maquina'];
  const corporal = reglas.equipos['peso-corporal'];

  test('con barra olímpica solo existen 20, 22.5, 25…', () => {
    assert.equal(redondearACargaPosible(41, barra), 40);
    assert.equal(redondearACargaPosible(41.5, barra), 42.5);
    assert.equal(redondearACargaPosible(22.5, barra), 22.5);
  });

  test('nunca devuelve menos que la barra vacía', () => {
    assert.equal(redondearACargaPosible(5, barra), 20);
    assert.equal(redondearACargaPosible(-100, barra), 20);
  });

  test('la barra liviana permite arrancar más abajo', () => {
    const liviana = reglas.equipos['barra-liviana'];
    assert.equal(redondearACargaPosible(5, liviana), 10, 'el piso de la barra liviana es 10 kg');
    assert.equal(redondearACargaPosible(12.5, liviana), 12.5);
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

describe('modoDeCarga', () => {
  test('un ejercicio común es peso normal', () => {
    assert.equal(modoDeCarga(ej('press-banca')), 'peso');
  });
  test('la plancha es peso corporal', () => {
    assert.equal(modoDeCarga(ej('plancha')), 'peso-corporal');
  });
  test('las dominadas con lastre son lastre', () => {
    assert.equal(modoDeCarga(ej('dominadas')), 'lastre');
  });
  test('las dominadas asistidas son asistencia', () => {
    assert.equal(modoDeCarga(ej('dominadas-asistidas')), 'asistencia');
  });
});

describe('pesoInicialDe', () => {
  test('sale del ejercicio, que es donde vive', () => {
    assert.equal(pesoInicialDe(ej('press-banca'), PLAN_BARRA), 20);
  });

  test('la rutina lo puede pisar si lo dice explícitamente', () => {
    const plan = { ...PLAN_BARRA, pesoInicialKg: 30 };
    assert.equal(pesoInicialDe(ej('press-banca'), plan), 30);
  });

  test('la rutina puede pisarlo con null para que lo elija el usuario', () => {
    const plan = { ...PLAN_BARRA, pesoInicialKg: null };
    assert.equal(pesoInicialDe(ej('press-banca'), plan), null);
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
  test('NO arrastra los fracasos de otra carga', () => {
    const historial = [intento(35, [10, 9, 8]), intento(40, [9, 8, 8]), intento(40, [9, 8, 7])];
    assert.equal(fallosSeguidos(historial, PLAN_BARRA), 1);
  });
  test('sin historial es cero', () => {
    assert.equal(fallosSeguidos([], PLAN_BARRA), 0);
  });
});

describe('sugerirCarga — primera vez', () => {
  test('sin historial usa el peso inicial del ejercicio', () => {
    const s = sugerirCarga([], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'primera-vez');
    assert.equal(s.pesoKg, 20);
    assert.equal(s.repsObjetivo, 8);
    assert.equal(s.modo, 'peso');
  });

  test('sin peso inicial devuelve null, no se rompe', () => {
    const s = sugerirCarga([], PLAN_CORPORAL, ej('plancha'), reglas);
    assert.equal(s.pesoKg, null);
    assert.match(s.explicacion, /elegí un peso/);
  });

  test('en un asistido habla de kilos de ayuda, no de peso', () => {
    const s = sugerirCarga([], PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.equal(s.pesoKg, 30);
    assert.match(s.explicacion, /ayuda/);
  });
});

describe('sugerirCarga — subir', () => {
  test('el caso borde clave: el salto tiene que caer en una carga que exista', () => {
    const s = sugerirCarga([intento(40, [12, 12, 12])], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 42.5);
    assert.equal(s.repsObjetivo, 8, 'al subir el peso se vuelve al piso de repeticiones');
  });

  test('en máquina sube de a 5', () => {
    const plan = { ...PLAN_BARRA, ejercicioId: 'prensa' };
    const s = sugerirCarga([intento(100, [12, 12, 12])], plan, ej('prensa'), reglas);
    assert.equal(s.pesoKg, 105);
  });

  test('nunca sugiere el mismo peso al subir, en ningún tramo', () => {
    for (let peso = 20; peso <= 200; peso += 2.5) {
      const s = sugerirCarga([intento(peso, [12, 12, 12])], PLAN_BARRA, ej('press-banca'), reglas);
      assert.ok(s.pesoKg !== null && s.pesoKg > peso,
        'con ' + peso + ' kg sugirió ' + s.pesoKg + ', que no es una subida');
    }
  });

  test('en peso corporal sube repeticiones, no kilos', () => {
    const s = sugerirCarga([intento(0, [45, 45, 45])], PLAN_CORPORAL, ej('plancha'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 0);
    assert.match(s.explicacion, /repeticiones/);
  });

  test('con lastre suma kilos desde cero', () => {
    const s = sugerirCarga([intento(0, [10, 10, 10])], PLAN_LASTRE, ej('dominadas'), reglas);
    assert.equal(s.modo, 'lastre');
    assert.equal(s.pesoKg, 1.25);
  });
});

// =====================================================================
// El signo invertido de los asistidos. Si esto se rompe, la app le dice a alguien que
// está mejorando que se ponga MÁS ayuda, y nadie se entera nunca.
// =====================================================================

describe('sugerirCarga — asistidos: progresar es BAJAR la ayuda', () => {
  test('completar el rango baja los kilos de ayuda', () => {
    const s = sugerirCarga([intento(30, [10, 10, 10])], PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.modo, 'asistencia');
    assert.equal(s.pesoKg, 25, 'menos ayuda es progresar');
    assert.match(s.explicacion, /Bajá la ayuda/);
  });

  test('la ayuda nunca baja de cero', () => {
    for (let ayuda = 0; ayuda <= 60; ayuda += 5) {
      const s = sugerirCarga([intento(ayuda, [10, 10, 10])], PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
      assert.ok(s.pesoKg !== null && s.pesoKg >= 0, 'con ' + ayuda + ' kg de ayuda sugirió ' + s.pesoKg);
      if (ayuda > 0) assert.ok(s.pesoKg !== null && s.pesoKg < ayuda, 'tendría que haber bajado la ayuda');
    }
  });

  test('sin nada de ayuda manda al ejercicio sin asistencia', () => {
    const s = sugerirCarga([intento(0, [10, 10, 10])], PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.equal(s.motivo, 'mantener');
    assert.match(s.explicacion, /sin nada de ayuda/);
  });

  test('estancarse SUBE la ayuda, que acá es el deload', () => {
    const historial = [intento(30, [5, 5, 4]), intento(30, [5, 4, 4])];
    const s = sugerirCarga(historial, PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.equal(s.motivo, 'bajar');
    assert.equal(s.pesoKg, 35, 'el deload de un asistido es más ayuda, no menos');
    assert.match(s.explicacion, /Subí la ayuda/);
  });

  test('subir la ayuda por su cuenta se respeta como retroceso', () => {
    const historial = [intento(35, [8, 7, 7]), intento(30, [5, 5, 4])];
    const s = sugerirCarga(historial, PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.equal(s.motivo, 'bajaste-el-peso');
    assert.equal(s.pesoKg, 35);
  });
});

describe('sugerirCarga — mantener', () => {
  test('si no completó el rango se queda igual y apunta al techo', () => {
    const s = sugerirCarga([intento(40, [12, 11, 10])], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'mantener');
    assert.equal(s.pesoKg, 40);
    assert.equal(s.repsObjetivo, 12);
  });
});

describe('sugerirCarga — el usuario bajó el peso por su cuenta', () => {
  test('respeta la baja en vez de mandarlo de vuelta arriba', () => {
    const historial = [intento(35, [10, 10, 9]), intento(40, [9, 8, 8])];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'bajaste-el-peso');
    assert.equal(s.pesoKg, 35);
    assert.equal(s.repsObjetivo, 12);
  });

  test('y no lo baja de nuevo por fracasos viejos con más peso', () => {
    const historial = [intento(35, [10, 9, 8]), intento(40, [9, 8, 8]), intento(40, [9, 8, 7])];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.notEqual(s.motivo, 'bajar');
    assert.equal(s.pesoKg, 35);
  });
});

describe('sugerirCarga — bajar por estancamiento', () => {
  test('después de dos fracasos seguidos al mismo peso, baja', () => {
    const historial = [intento(40, [10, 9, 8]), intento(40, [9, 9, 8])];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'bajar');
    assert.equal(s.pesoKg, 35);
    assert.equal(s.repsObjetivo, 8);
  });

  test('un solo fracaso no alcanza para bajar', () => {
    const s = sugerirCarga([intento(40, [10, 9, 8])], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'mantener');
  });

  test('nunca baja de la barra vacía', () => {
    const historial = [intento(20, [5, 5, 5]), intento(20, [5, 5, 4])];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, 20, 'no se puede levantar menos que una barra vacía');
  });
});

describe('sugerirCarga — datos mal cargados', () => {
  test('con un equipo que no está en reglas.json avisa pero no se rompe', () => {
    const inventado = { ...ej('press-banca'), equipo: 'inventado' };
    const s = sugerirCarga([intento(40, [12, 12, 12])], PLAN_BARRA, inventado, reglas);
    assert.equal(s.motivo, 'subir');
    assert.ok(s.pesoKg !== null && s.pesoKg > 40);
    assert.match(String(s.advertencia), /no está en reglas\.json/);
  });

  test('todos los equipos del catálogo están definidos en reglas.json', () => {
    for (const e of catalogo) {
      assert.ok(reglas.equipos[e.equipo],
        'el ejercicio "' + e.id + '" usa el equipo "' + e.equipo + '", que no existe en reglas.json');
    }
  });

  test('todos los equipos de reglas.json tienen subirKg', () => {
    for (const [clave, eq] of Object.entries(reglas.equipos)) {
      assert.equal(typeof eq.subirKg, 'number', 'al equipo "' + clave + '" le falta subirKg');
    }
  });

  test('todos los sustitutos apuntan a ejercicios que existen', () => {
    const ids = new Set(catalogo.map((e) => e.id));
    for (const e of catalogo) {
      for (const s of e.sustitutos || []) {
        assert.ok(ids.has(s), 'el ejercicio "' + e.id + '" tiene como sustituto a "' + s + '", que no existe');
      }
    }
  });
});

// =====================================================================
// El catálogo REAL del socio. Acá no se prueba la lógica: se prueba que los 184
// ejercicios de la planilla puedan pasar por la progresión sin romper nada. Es lo que
// separa "los tests pasan" de "la app funciona con los datos de verdad".
// =====================================================================
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

  /*
   * El caso que la planilla real destapó: el socio carga `equipo: peso-corporal` y marca
   * la casilla `admite_asistencia`. Si la app mirara la columna sola, el escalón sería 0
   * y la pantalla no dejaría anotar los kilos de ayuda de la máquina.
   */
  test('en los asistidos, el escalón sale del equipo de asistencia y no de la columna', () => {
    const asistidos = catalogoReal.filter((e) => e.admiteAsistencia);
    assert.ok(asistidos.length > 0, 'la planilla no tiene ningún ejercicio asistido: revisá el fixture');
    for (const e of asistidos) {
      const eq = equipoDeCarga(e, reglas);
      assert.ok(eq, 'el asistido "' + e.id + '" se quedó sin equipo de carga');
      assert.ok(eq.incrementoMinimoKg > 0,
        'el asistido "' + e.id + '" tiene escalón 0: el usuario no podría anotar la ayuda');
    }
  });

  test('ninguna ficha rompe la sugerencia de carga, ni sin historial ni con historial', () => {
    /** @type {EjercicioPlanificado} */
    const plan = { ejercicioId: 'x', series: 3, repsMin: 8, repsMax: 12, descansoSeg: 90 };
    for (const e of catalogoReal) {
      const primera = sugerirCarga([], { ...plan, ejercicioId: e.id }, e, reglas);
      assert.ok(typeof primera.explicacion === 'string' && primera.explicacion.length > 0,
        'el ejercicio "' + e.id + '" no produjo explicación en la primera vez');

      const conHistorial = sugerirCarga(
        [{ fechaTs: Date.now(), pesoKg: 20, reps: [12, 12, 12] }],
        { ...plan, ejercicioId: e.id }, e, reglas
      );
      assert.ok(typeof conHistorial.pesoKg === 'number' && Number.isFinite(conHistorial.pesoKg),
        'el ejercicio "' + e.id + '" devolvió un peso que no es un número');
    }
  });
});

// =====================================================================
// Los botones de esfuerzo. La regla es: las repeticiones deciden SI progresa, el boton
// decide CUANTO. El boton nunca puede frenar ni forzar la progresion.
// =====================================================================

describe('sugerirCarga — botones Fácil / Justo / No llegué', () => {
  test('completar el rango y marcar Fácil da salto doble', () => {
    const s = sugerirCarga([intento(40, [12, 12, 12], 'facil')], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 45, '40 + 2 × 2,5 kg');
    assert.match(s.explicacion, /salto es doble/);
  });

  test('marcar Justo da el salto normal', () => {
    const s = sugerirCarga([intento(40, [12, 12, 12], 'justo')], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, 42.5);
    assert.doesNotMatch(s.explicacion, /salto es doble/);
  });

  test('sin botón contestado se comporta como Justo', () => {
    const s = sugerirCarga([intento(40, [12, 12, 12])], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, 42.5);
  });

  test('marcar No llegué habiendo completado NO frena: mandan los datos objetivos', () => {
    const s = sugerirCarga([intento(40, [12, 12, 12], 'no-llegue')], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 42.5);
  });

  test('marcar Fácil SIN completar el rango no hace subir nada', () => {
    const s = sugerirCarga([intento(40, [12, 11, 10], 'facil')], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'mantener');
    assert.equal(s.pesoKg, 40);
  });

  test('marcar Fácil no evita el deload por estancamiento', () => {
    const historial = [intento(40, [10, 9, 8], 'facil'), intento(40, [9, 9, 8], 'facil')];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'bajar');
    assert.equal(s.pesoKg, 35);
  });

  test('en asistidos con poca ayuda, el tope bloquea el salto doble', () => {
    // Bajar de 30 a 20 kg de ayuda es cargarse 10 kg más del propio cuerpo de golpe: un
    // 33% más de dificultad. El tope lo bloquea y baja un escalón, que es lo correcto.
    const s = sugerirCarga([intento(30, [10, 10, 10], 'facil')], PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.equal(s.pesoKg, 25);
    assert.doesNotMatch(s.explicacion, /salto es doble/);
  });

  test('en asistidos con mucha ayuda, el salto doble sí entra', () => {
    // Con 60 kg de ayuda, bajar 10 es un 16,7%: entra en el tope.
    const s = sugerirCarga([intento(60, [10, 10, 10], 'facil')], PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.equal(s.pesoKg, 50);
    assert.match(s.explicacion, /salto es doble/);
  });

  test('con Fácil la ayuda tampoco baja de cero', () => {
    const s = sugerirCarga([intento(5, [10, 10, 10], 'facil')], PLAN_ASISTIDO, ej('dominadas-asistidas'), reglas);
    assert.ok(s.pesoKg !== null && s.pesoKg >= 0);
  });

  test('en todo el rango, Fácil siempre sube más que Justo', () => {
    for (let peso = 20; peso <= 200; peso += 2.5) {
      const conFacil = sugerirCarga([intento(peso, [12, 12, 12], 'facil')], PLAN_BARRA, ej('press-banca'), reglas);
      const conJusto = sugerirCarga([intento(peso, [12, 12, 12], 'justo')], PLAN_BARRA, ej('press-banca'), reglas);
      // Desde 25 kg el salto doble entra en el tope y tiene que ser estrictamente mayor.
      // Por debajo, el tope lo bloquea y los dos dan lo mismo: eso es correcto, no un error.
      const debeSuperar = peso >= 25;
      const ok = debeSuperar ? conFacil.pesoKg > conJusto.pesoKg : conFacil.pesoKg >= conJusto.pesoKg;
      assert.ok(conFacil.pesoKg !== null && conJusto.pesoKg !== null && ok,
        'con ' + peso + ' kg: fácil dio ' + conFacil.pesoKg + ' y justo dio ' + conJusto.pesoKg);
    }
  });

  test('si el multiplicador es 1, el botón no cambia nada', () => {
    const sinMultiplicador = { ...reglas, progresion: { ...reglas.progresion, multiplicadorSiFueFacil: 1 } };
    const s = sugerirCarga([intento(40, [12, 12, 12], 'facil')], PLAN_BARRA, ej('press-banca'), sinMultiplicador);
    assert.equal(s.pesoKg, 42.5);
  });
});

// =====================================================================
// Las dos guardas del salto doble. Sin estas, el deload no sirve para nada.
// =====================================================================

describe('huboRetroceso', () => {
  test('sin historial o con uno solo, no hubo retroceso', () => {
    assert.equal(huboRetroceso([], 1), false);
    assert.equal(huboRetroceso([intento(40, [12, 12, 12])], 1), false);
  });

  test('subir siempre no es retroceso', () => {
    assert.equal(huboRetroceso([intento(42.5, [8, 8, 8]), intento(40, [12, 12, 12])], 1), false);
  });

  test('haber bajado alguna vez sí lo es', () => {
    assert.equal(huboRetroceso([intento(35, [10, 9, 8]), intento(40, [9, 8, 8])], 1), true);
  });

  test('en asistidos el signo va al revés: bajar la ayuda es progresar', () => {
    assert.equal(huboRetroceso([intento(25, [10, 10, 10]), intento(30, [10, 10, 10])], -1), false);
    assert.equal(huboRetroceso([intento(35, [5, 5, 4]), intento(30, [5, 5, 4])], -1), true);
  });
});

describe('cabeElSaltoDoble', () => {
  test('12,5% entra', () => {
    assert.equal(cabeElSaltoDoble(40, 5, reglas), true);
  });
  test('40% no entra: es el caso de las mancuernas de 10 kg', () => {
    assert.equal(cabeElSaltoDoble(10, 4, reglas), false);
  });
  test('con carga cero no se puede calcular el porcentaje, así que pasa', () => {
    assert.equal(cabeElSaltoDoble(0, 2.5, reglas), true);
  });
});

describe('el salto doble NO rebota después de un deload', () => {
  test('el escenario completo: 60 kg, falla dos veces, baja, y no vuelve a pasarse', () => {
    // Llegó a 60, falló dos sesiones, el deload lo dejó en 55. Ahora completa y marca
    // Fácil. Sin guarda volvería a 60 y después a 65, o sea MÁS ARRIBA del peso donde ya
    // había fallado, en dos sesiones. El deload no habría servido para nada.
    const historial = [
      intento(55, [12, 12, 12], 'facil'),
      intento(60, [10, 9, 8]),
      intento(60, [9, 9, 8])
    ];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.motivo, 'subir');
    assert.equal(s.pesoKg, 57.5, 'sube normal, no doble');
    assert.doesNotMatch(s.explicacion, /salto es doble/);
  });

  test('y sigue desactivado en las sesiones siguientes', () => {
    const historial = [
      intento(57.5, [12, 12, 12], 'facil'),
      intento(55, [12, 12, 12], 'facil'),
      intento(60, [10, 9, 8]),
      intento(60, [9, 9, 8])
    ];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, 60, 'llega a 60 de a un escalón, no de un salto');
  });

  test('sin retroceso previo, el salto doble sigue funcionando', () => {
    const historial = [intento(55, [12, 12, 12], 'facil'), intento(52.5, [12, 12, 12])];
    const s = sugerirCarga(historial, PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, 60);
  });
});

describe('el salto doble no puede ser un salto enorme en cargas chicas', () => {
  /** @type {EjercicioPlanificado} */
  const PLAN_CURL = { ejercicioId: 'curl-mancuernas', series: 3, repsMin: 10, repsMax: 15, descansoSeg: 60 };

  test('mancuernas de 10 kg: el salto doble sería 40% y se bloquea', () => {
    const s = sugerirCarga([intento(10, [15, 15, 15], 'facil')], PLAN_CURL, ej('curl-mancuernas'), reglas);
    assert.equal(s.pesoKg, 12, 'sube un escalón, no dos');
    assert.doesNotMatch(s.explicacion, /salto es doble/);
  });

  test('mancuernas de 40 kg: el mismo salto es 10% y sí entra', () => {
    const s = sugerirCarga([intento(40, [15, 15, 15], 'facil')], PLAN_CURL, ej('curl-mancuernas'), reglas);
    assert.equal(s.pesoKg, 44);
    assert.match(s.explicacion, /salto es doble/);
  });

  test('barra vacía: 25% se bloquea, así que un principiante no salta a 25 kg', () => {
    const s = sugerirCarga([intento(20, [12, 12, 12], 'facil')], PLAN_BARRA, ej('press-banca'), reglas);
    assert.equal(s.pesoKg, 22.5);
  });

  test('pase lo que pase, siempre sube algo', () => {
    for (let peso = 20; peso <= 200; peso += 2.5) {
      const s = sugerirCarga([intento(peso, [12, 12, 12], 'facil')], PLAN_BARRA, ej('press-banca'), reglas);
      assert.ok(s.pesoKg !== null && s.pesoKg > peso, 'con ' + peso + ' kg no subió');
    }
  });
});
