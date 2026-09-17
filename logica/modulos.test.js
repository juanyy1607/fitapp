// @ts-check
/**
 * logica/modulos.test.js — Prueba de humo de todos los módulos.
 *
 * Correr con:  node --test
 *
 * No prueba comportamiento: prueba que cada archivo se pueda cargar y exporte lo que dice
 * exportar. Suena poco, pero atrapa las dos cosas que más rompen en un proyecto sin paso
 * de compilación: una ruta de `import` mal escrita, y un nombre que se exporta con un
 * nombre y se importa con otro. Sin compilador, esos errores aparecen recién en el
 * teléfono, en el gimnasio, con la pantalla en blanco.
 *
 * almacen.js y catalogo.js usan IndexedDB y fetch, que no existen en Node. Se pueden
 * IMPORTAR igual, porque esas APIs se tocan adentro de las funciones y no al cargar el
 * archivo. Por eso este test las importa pero no las ejecuta: eso se prueba en el teléfono.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('todos los módulos cargan y exportan lo que dicen', () => {
  test('progresion.js', async () => {
    const m = await import('./progresion.js');
    for (const nombre of ['sugerirCarga', 'redondearACargaPosible', 'completoElRango', 'fallosSeguidos', 'redondear2', 'modoDeCarga', 'pesoInicialDe']) {
      assert.equal(typeof m[nombre], 'function', 'falta exportar ' + nombre);
    }
  });

  test('historial.js', async () => {
    const m = await import('./historial.js');
    for (const nombre of ['sesionesTerminadas', 'sesionEnCurso', 'pesoPredominante', 'intentosDeEjercicio',
                          'ultimoPorEjercicio', 'volumenTotal', 'resumenSesion', 'diasEntrenadosEnLosUltimos']) {
      assert.equal(typeof m[nombre], 'function', 'falta exportar ' + nombre);
    }
  });

  test('almacen.js (se importa, no se ejecuta: necesita IndexedDB)', async () => {
    const m = await import('./almacen.js');
    for (const nombre of ['guardarSesion', 'obtenerSesion', 'listarSesiones', 'borrarSesion', 'contarSesiones',
                          'guardarAjuste', 'leerAjuste', 'exportarTodo', 'importarSesiones', 'borrarTodo']) {
      assert.equal(typeof m[nombre], 'function', 'falta exportar ' + nombre);
    }
  });

  test('catalogo.js (se importa, no se ejecuta: necesita fetch)', async () => {
    const m = await import('./catalogo.js');
    for (const nombre of ['cargarCatalogo', 'nombreDeEjercicio', 'equipoDeEjercicio', 'buscarDia', 'descansoDe', 'descansoDespuesDe']) {
      assert.equal(typeof m[nombre], 'function', 'falta exportar ' + nombre);
    }
  });

  test('respaldo.js', async () => {
    const m = await import('./respaldo.js');
    for (const nombre of ['asegurarPersistencia', 'prepararRespaldo', 'exportarHistorial',
                          'importarHistorial', 'estadoRespaldo']) {
      assert.equal(typeof m[nombre], 'function', 'falta exportar ' + nombre);
    }
  });

  test('tipos.js carga aunque no tenga código', async () => {
    await import('../tipos.js');
  });
});

describe('importarHistorial rechaza basura sin tocar la base', () => {
  test('un texto que no es JSON', async () => {
    const { importarHistorial } = await import('./respaldo.js');
    await assert.rejects(() => importarHistorial('esto no es json'), /no se pudo leer como JSON/);
  });

  test('un JSON que no es un respaldo nuestro', async () => {
    const { importarHistorial } = await import('./respaldo.js');
    await assert.rejects(() => importarHistorial('{"hola":1}'), /no tiene una lista de sesiones/);
  });

  test('un respaldo con sesiones ilegibles', async () => {
    const { importarHistorial } = await import('./respaldo.js');
    await assert.rejects(() => importarHistorial('{"sesiones":[{"roto":true}]}'), /ninguna sesión que se pueda leer/);
  });
});

describe('los módulos nuevos de la app', () => {
  test('temporizador.js', async () => {
    const m = await import('./temporizador.js');
    for (const nombre of ['construirWavAlarma', 'crearTemporizador']) {
      assert.equal(typeof m[nombre], 'function', 'falta exportar ' + nombre);
    }
  });

  test('pantallas/sesion.js (se importa, no se ejecuta: necesita DOM)', async () => {
    const m = await import('../pantallas/sesion.js');
    assert.equal(typeof m.crearPantallaSesion, 'function');
  });
});

describe('iconos.js', () => {
  test('todos los íconos devuelven un SVG del mismo estilo', async () => {
    const { icono, NOMBRES } = await import('../iconos.js');
    assert.ok(NOMBRES.length >= 5, 'esperaba al menos cinco íconos');
    for (const nombre of NOMBRES) {
      const svg = icono(nombre);
      assert.match(svg, /^<svg /, nombre + ' no devuelve un SVG');
      assert.match(svg, /viewBox="0 0 24 24"/, nombre + ' no usa la grilla de 24');
      assert.match(svg, /stroke="currentColor"/, nombre + ' no hereda el color del contenedor');
      assert.match(svg, /stroke-width="2"/, nombre + ' no usa el trazo de 2');
      assert.doesNotMatch(svg, /fill="(?!none)/, nombre + ' usa relleno: los íconos son de trazo');
    }
  });

  test('un nombre que no existe devuelve vacío en vez de romper la pantalla', async () => {
    const { icono } = await import('../iconos.js');
    assert.equal(icono('no-existe'), '');
  });
});
