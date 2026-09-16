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
    for (const nombre of ['sugerirCarga', 'redondearACargaPosible', 'completoElRango', 'fallosSeguidos', 'redondear2']) {
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
    for (const nombre of ['cargarCatalogo', 'nombreDeEjercicio', 'equipoDeEjercicio', 'buscarDia', 'descansoDe']) {
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
