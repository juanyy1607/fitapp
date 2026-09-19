// @ts-check
/**
 * logica/catalogo.test.js — Tests de la traducción de la planilla.
 *
 * Correr con:   node --test
 *
 * Por qué esto merece tests propios: un error acá es invisible. Si `casilla()` se comiera
 * un "si" y devolviera false, la app no se rompe ni muestra ningún error: simplemente
 * dejaría de tratar un ejercicio como unilateral, y el usuario anotaría el peso de las dos
 * mancuernas donde correspondía una. Se entera seis semanas después, si se entera.
 *
 * Es el mismo riesgo que tiene progresion.js, y por la misma razón se cubre igual.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizarEjercicio, normalizarConcepto } from './catalogo.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('normalizarEjercicio — las casillas si/no', () => {
  test('"si" es verdadero y "no" es falso', () => {
    const e = normalizarEjercicio({ id: 'x', nombre: 'X', grupo: 'pierna', es_unilateral: 'si', es_peso_corporal: 'no' });
    assert.equal(e.esUnilateral, true);
    assert.equal(e.esPesoCorporal, false);
  });

  test('acepta "sí" con tilde, porque alguien la va a escribir', () => {
    assert.equal(normalizarEjercicio({ es_unilateral: 'sí' }).esUnilateral, true);
  });

  test('no le importan las mayúsculas ni los espacios de más', () => {
    assert.equal(normalizarEjercicio({ es_unilateral: '  SI ' }).esUnilateral, true);
  });

  test('vacío es falso, no undefined: la app pregunta por esto con un if', () => {
    const e = normalizarEjercicio({ id: 'x' });
    assert.equal(e.esUnilateral, false);
    assert.equal(e.admiteAsistencia, false);
    assert.equal(e.admiteLastre, false);
  });

  test('cualquier cosa que no sea "si" cuenta como no', () => {
    assert.equal(normalizarEjercicio({ es_unilateral: 'tal vez' }).esUnilateral, false);
  });

  test('si el JSON ya viene con booleanos de verdad, los respeta', () => {
    assert.equal(normalizarEjercicio({ esUnilateral: true }).esUnilateral, true);
    assert.equal(normalizarEjercicio({ es_unilateral: false }).esUnilateral, false);
  });
});

describe('normalizarEjercicio — las celdas vacías', () => {
  /*
   * La regla de fondo: vacío se traduce a que el campo NO ESTÉ, no a "" ni a [].
   * Así los valores por defecto del resto del código funcionan solos, con `||`, sin que
   * cada lugar tenga que acordarse de chequear el string vacío.
   */
  test('un campo de texto vacío desaparece', () => {
    const e = normalizarEjercicio({ id: 'x', nombre: 'X', tecnica: '', nivel: '', video: '' });
    assert.equal('tecnica' in e, false);
    assert.equal('nivel' in e, false);
    assert.equal('video' in e, false);
  });

  test('una lista vacía desaparece, no queda como []', () => {
    const e = normalizarEjercicio({ id: 'x', sustitutos: '', musculos_secundarios: '' });
    assert.equal('sustitutos' in e, false);
    assert.equal('musculosSecundarios' in e, false);
  });

  test('un número vacío desaparece, no queda como 0', () => {
    const e = normalizarEjercicio({ id: 'x', descanso_seg: '' });
    assert.equal('descansoSeg' in e, false);
  });

  test('descanso 0 no es lo mismo que descanso vacío', () => {
    assert.equal(normalizarEjercicio({ descanso_seg: 0 }).descansoSeg, 0);
    assert.equal(normalizarEjercicio({ descanso_seg: '0' }).descansoSeg, 0);
  });

  test('los campos obligatorios quedan como "" y no desaparecen', () => {
    // Si el id desapareciera, el Map de búsqueda tendría una clave undefined y el
    // validador no podría decir cuál es la fila que está mal.
    const e = normalizarEjercicio({});
    assert.equal(e.id, '');
    assert.equal(e.nombre, '');
    assert.equal(e.grupo, '');
    assert.equal(e.equipo, '');
  });
});

describe('normalizarEjercicio — las listas separadas por coma', () => {
  test('parte por coma y limpia los espacios', () => {
    const e = normalizarEjercicio({ sustitutos: 'prensa, sentadilla ,  hack' });
    assert.deepEqual(e.sustitutos, ['prensa', 'sentadilla', 'hack']);
  });

  test('un solo valor sin comas también es una lista', () => {
    assert.deepEqual(normalizarEjercicio({ sustitutos: 'prensa' }).sustitutos, ['prensa']);
  });

  test('las comas de más no generan entradas vacías', () => {
    assert.deepEqual(normalizarEjercicio({ sustitutos: 'a,,b,' }).sustitutos, ['a', 'b']);
  });

  test('si ya viene como lista, la deja como está', () => {
    assert.deepEqual(normalizarEjercicio({ sustitutos: ['a', 'b'] }).sustitutos, ['a', 'b']);
  });
});

describe('normalizarEjercicio — nombres de columna', () => {
  test('lee el nombre de la planilla, con guión bajo', () => {
    const e = normalizarEjercicio({ sub_bloque: 'sentadillas', errores_comunes: 'rodilla adentro' });
    assert.equal(e.subBloque, 'sentadillas');
    assert.equal(e.erroresComunes, 'rodilla adentro');
  });

  test('también acepta el nombre de adentro del código, para no romper datos viejos', () => {
    const e = normalizarEjercicio({ subBloque: 'sentadillas', erroresComunes: 'rodilla adentro' });
    assert.equal(e.subBloque, 'sentadillas');
    assert.equal(e.erroresComunes, 'rodilla adentro');
  });
});

describe('normalizarConcepto', () => {
  test('traduce un concepto con video y sin texto', () => {
    const c = normalizarConcepto({ id: 'que-es-rir', titulo: 'QUE ES RIR', video: 'https://youtu.be/x', texto: '' });
    assert.equal(c.id, 'que-es-rir');
    assert.equal(c.titulo, 'QUE ES RIR');
    assert.equal(c.video, 'https://youtu.be/x');
    assert.equal('texto' in c, false);
  });
});

describe('los archivos de datos reales pasan por la traducción', () => {
  const ejercicios = JSON.parse(readFileSync(join(RAIZ, 'datos/ejercicios.json'), 'utf8'))
    .map(normalizarEjercicio);
  const conceptos = JSON.parse(readFileSync(join(RAIZ, 'datos/conceptos.json'), 'utf8'))
    .map(normalizarConcepto);

  test('todos los ejercicios salen con id, nombre y grupo', () => {
    assert.ok(ejercicios.length > 0);
    for (const e of ejercicios) {
      assert.ok(e.id, 'hay un ejercicio sin id');
      assert.ok(e.nombre, 'el ejercicio "' + e.id + '" quedó sin nombre');
      assert.ok(e.grupo, 'el ejercicio "' + e.id + '" quedó sin grupo');
    }
  });

  test('ninguna casilla quedó como el string "no", que sería verdadero por accidente', () => {
    // El error clásico de traducir una planilla: `if (e.esUnilateral)` con el string "no"
    // adentro da VERDADERO, porque cualquier texto no vacío es verdadero en JavaScript.
    for (const e of ejercicios) {
      for (const campo of ['esUnilateral', 'esPesoCorporal', 'admiteLastre', 'admiteAsistencia']) {
        assert.equal(typeof e[campo], 'boolean',
          'el campo ' + campo + ' de "' + e.id + '" no es booleano: es ' + JSON.stringify(e[campo]));
      }
    }
  });

  test('no quedó ningún campo como string vacío', () => {
    for (const e of ejercicios) {
      for (const [campo, valor] of Object.entries(e)) {
        if (['id', 'nombre', 'grupo', 'equipo'].includes(campo)) continue;
        assert.notEqual(valor, '', 'el campo ' + campo + ' de "' + e.id + '" quedó como string vacío');
      }
    }
  });

  test('los sub-bloques quedaron guardados', () => {
    const conSubBloque = ejercicios.filter((e) => e.subBloque);
    assert.ok(conSubBloque.length > 0, 'no se guardó ningún sub_bloque');
  });

  test('todos los conceptos salen con id y título', () => {
    assert.ok(conceptos.length > 0);
    for (const c of conceptos) {
      assert.ok(c.id, 'hay un concepto sin id');
      assert.ok(c.titulo, 'el concepto "' + c.id + '" quedó sin título');
    }
  });
});
