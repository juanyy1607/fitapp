/*
 * db.js — Registro persistente en IndexedDB.
 *
 * IMPORTANTE: este archivo se carga DOS veces, en dos mundos distintos:
 *   - En la página, con <script src="db.js">
 *   - En el service worker, con importScripts('db.js')
 *
 * Por eso no puede tocar `document` ni `window` en ningún lado. Solo usa `self`, que
 * existe en los dos mundos. Si el día de mañana agregás algo acá, respetá esa regla o
 * el service worker va a romperse en silencio.
 *
 * El motivo de todo esto: cuando el teléfono está bloqueado en el bolsillo, la página
 * puede estar muerta. Si el log solo lo escribiera la página, los escenarios 5 y 6 no
 * dejarían ninguna evidencia. El service worker tiene que poder anotar por su cuenta.
 */
(function (scope) {
  'use strict';

  var NOMBRE_DB = 'banco-timer';
  var VERSION_DB = 1;
  var STORE_EVENTOS = 'eventos';
  var STORE_CORRIDAS = 'corridas';

  var promesaDB = null;

  function abrir() {
    if (promesaDB) return promesaDB;
    promesaDB = new Promise(function (resolver, rechazar) {
      var req = indexedDB.open(NOMBRE_DB, VERSION_DB);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_EVENTOS)) {
          var ev = db.createObjectStore(STORE_EVENTOS, { keyPath: 'id', autoIncrement: true });
          ev.createIndex('porCorrida', 'idCorrida');
          ev.createIndex('porFecha', 'ts');
        }
        if (!db.objectStoreNames.contains(STORE_CORRIDAS)) {
          db.createObjectStore(STORE_CORRIDAS, { keyPath: 'idCorrida' });
        }
      };
      req.onsuccess = function () { resolver(req.result); };
      req.onerror = function () { rechazar(req.error); };
    });
    return promesaDB;
  }

  // Envuelve una transacción en una promesa que se resuelve cuando REALMENTE se
  // escribió en disco (evento `complete`), no cuando se encoló el pedido. En el
  // service worker esto es crítico: si no esperás el `complete`, el navegador puede
  // matar al worker antes de que el dato toque el disco.
  function enTransaccion(nombreStore, modo, trabajo) {
    return abrir().then(function (db) {
      return new Promise(function (resolver, rechazar) {
        var tx = db.transaction(nombreStore, modo);
        var store = tx.objectStore(nombreStore);
        var resultado;
        try { resultado = trabajo(store); } catch (e) { rechazar(e); return; }
        tx.oncomplete = function () { resolver(resultado && resultado.result !== undefined ? resultado.result : resultado); };
        tx.onerror = function () { rechazar(tx.error); };
        tx.onabort = function () { rechazar(tx.error); };
      });
    });
  }

  function leerTodo(nombreStore) {
    return abrir().then(function (db) {
      return new Promise(function (resolver, rechazar) {
        var req = db.transaction(nombreStore, 'readonly').objectStore(nombreStore).getAll();
        req.onsuccess = function () { resolver(req.result || []); };
        req.onerror = function () { rechazar(req.error); };
      });
    });
  }

  /*
   * Anota un evento. `datos` trae como mínimo { tipo }.
   *
   * Campos que agregamos siempre:
   *   ts      — marca de tiempo real (Date.now()), la única fuente de verdad del log
   *   tsIso   — la misma fecha legible, para leer el JSON sin convertir a mano
   *   origen  — 'pagina' o 'sw', para saber quién anotó (importante: si un evento lo
   *             anotó el SW y no la página, es porque la página estaba muerta)
   */
  function anotar(datos) {
    var ahora = Date.now();
    var evento = Object.assign({
      ts: ahora,
      tsIso: new Date(ahora).toISOString(),
      origen: (typeof WorkerGlobalScope !== 'undefined' && scope instanceof WorkerGlobalScope) ? 'sw' : 'pagina'
    }, datos);
    return enTransaccion(STORE_EVENTOS, 'readwrite', function (store) {
      store.add(evento);
    }).then(function () { return evento; });
  }

  function guardarCorrida(corrida) {
    return enTransaccion(STORE_CORRIDAS, 'readwrite', function (store) {
      store.put(corrida);
    }).then(function () { return corrida; });
  }

  function obtenerCorrida(idCorrida) {
    return abrir().then(function (db) {
      return new Promise(function (resolver, rechazar) {
        var req = db.transaction(STORE_CORRIDAS, 'readonly').objectStore(STORE_CORRIDAS).get(idCorrida);
        req.onsuccess = function () { resolver(req.result || null); };
        req.onerror = function () { rechazar(req.error); };
      });
    });
  }

  // Actualiza campos de una corrida sin pisar el resto. Lo usan tanto la página
  // (para marcar "¿te avisó?") como el SW (para marcar que disparó).
  function parchearCorrida(idCorrida, campos) {
    return obtenerCorrida(idCorrida).then(function (corrida) {
      if (!corrida) return null;
      return guardarCorrida(Object.assign(corrida, campos));
    });
  }

  function listarEventos() {
    return leerTodo(STORE_EVENTOS).then(function (filas) {
      return filas.sort(function (a, b) { return a.ts - b.ts; });
    });
  }

  function listarCorridas() {
    return leerTodo(STORE_CORRIDAS).then(function (filas) {
      return filas.sort(function (a, b) { return a.inicioTs - b.inicioTs; });
    });
  }

  function exportar() {
    return Promise.all([listarCorridas(), listarEventos()]).then(function (r) {
      return {
        exportadoEn: new Date().toISOString(),
        agente: (typeof navigator !== 'undefined' && navigator.userAgent) || 'desconocido',
        corridas: r[0],
        eventos: r[1]
      };
    });
  }

  function borrarTodo() {
    return Promise.all([
      enTransaccion(STORE_EVENTOS, 'readwrite', function (s) { s.clear(); }),
      enTransaccion(STORE_CORRIDAS, 'readwrite', function (s) { s.clear(); })
    ]);
  }

  scope.BancoDB = {
    anotar: anotar,
    guardarCorrida: guardarCorrida,
    obtenerCorrida: obtenerCorrida,
    parchearCorrida: parchearCorrida,
    listarEventos: listarEventos,
    listarCorridas: listarCorridas,
    exportar: exportar,
    borrarTodo: borrarTodo
  };
})(self);
