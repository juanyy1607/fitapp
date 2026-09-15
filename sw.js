/*
 * sw.js — Service worker.
 *
 * Hace dos trabajos independientes:
 *   1. Cachear la app para que abra sin señal (requisito del subsuelo del gimnasio).
 *   2. Ser el banco de pruebas de la ESTRATEGIA B: temporizador corriendo adentro del
 *      service worker en vez de adentro de la página.
 *
 * Sobre la estrategia B, para que quede claro qué estamos midiendo:
 * un service worker NO es un proceso que queda corriendo. El navegador lo despierta
 * cuando pasa algo y lo mata apenas termina. `event.waitUntil(promesa)` es la única
 * forma de decirle "no me mates hasta que esta promesa termine". Los navegadores
 * igual le ponen un techo a eso. Si la estrategia B falla, va a ser porque el navegador
 * mató al worker antes de tiempo, no porque esté mal escrita.
 */
importScripts('db.js');

var CACHE = 'banco-timer-v1';

var ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-512.png'
];

// ---------------------------------------------------------------- ciclo de vida

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ARCHIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(claves.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
      .then(revisarVencidos)
  );
});

// ------------------------------------------------------------------- offline

/*
 * Estrategia de caché: primero el caché, después la red.
 *
 * Elegí esto y no "primero la red" a propósito: el requisito es que la app abra en el
 * subsuelo sin señal. Con "primero la red", cada apertura sin señal tiene que esperar a
 * que la conexión falle antes de usar el caché, y eso agrega demora. Así abre instantáneo.
 *
 * El precio es que una versión nueva de la app entra recién en la SEGUNDA apertura:
 * servimos lo cacheado y en paralelo bajamos lo nuevo para la próxima vez.
 */
self.addEventListener('fetch', function (evento) {
  var req = evento.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(req).then(function (cacheado) {
      var desdeRed = fetch(req).then(function (respuesta) {
        if (respuesta && respuesta.ok) {
          var copia = respuesta.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        return respuesta;
      }).catch(function () {
        return cacheado || caches.match('./index.html');
      });
      return cacheado || desdeRed;
    })
  );

  // Cada vez que el worker despierta por cualquier motivo, aprovechamos para ver si
  // quedó algún temporizador vencido sin disparar. Eso deja constancia de que el
  // worker había muerto: es exactamente el dato que estamos buscando.
  evento.waitUntil(revisarVencidos());
});

// ------------------------------------------------- ESTRATEGIA B: timer en el SW

self.addEventListener('message', function (evento) {
  var msj = evento.data || {};

  if (msj.tipo === 'ARMAR_TIMER_SW') {
    evento.waitUntil(armarTimer(msj));
  }

  if (msj.tipo === 'CANCELAR_TIMER_SW') {
    evento.waitUntil(
      self.BancoDB.parchearCorrida(msj.idCorrida, { swCancelado: true })
        .then(function () {
          return self.BancoDB.anotar({
            idCorrida: msj.idCorrida,
            tipo: 'sw_timer_cancelado',
            estrategia: 'B'
          });
        })
    );
  }
});

function armarTimer(msj) {
  var idCorrida = msj.idCorrida;
  var venceEn = msj.venceEn;          // marca de tiempo absoluta, no una duración
  var esperar = Math.max(0, venceEn - Date.now());

  return self.BancoDB.anotar({
    idCorrida: idCorrida,
    tipo: 'sw_timer_armado',
    estrategia: 'B',
    venceEn: venceEn,
    venceEnIso: new Date(venceEn).toISOString(),
    esperaMs: esperar
  }).then(function () {
    return new Promise(function (resolver) {
      setTimeout(function () {
        var disparoEn = Date.now();
        var desvio = disparoEn - venceEn;   // negativo = adelantado, positivo = tarde

        Promise.resolve()
          .then(function () {
            return self.registration.showNotification('Descanso terminado', {
              body: 'Estrategia B (service worker) — desvío ' + desvio + ' ms',
              tag: 'banco-timer-b-' + idCorrida,
              renotify: true,
              requireInteraction: true,
              icon: './icons/icon-192.png',
              badge: './icons/icon-192.png',
              data: { idCorrida: idCorrida, estrategia: 'B', venceEn: venceEn }
            });
          })
          .catch(function (e) {
            return self.BancoDB.anotar({
              idCorrida: idCorrida,
              tipo: 'error',
              estrategia: 'B',
              detalle: 'showNotification falló: ' + (e && e.message)
            });
          })
          .then(function () {
            return self.BancoDB.anotar({
              idCorrida: idCorrida,
              tipo: 'disparo',
              estrategia: 'B',
              via: 'service worker + setTimeout',
              venceEn: venceEn,
              disparoEn: disparoEn,
              disparoEnIso: new Date(disparoEn).toISOString(),
              desvioMs: desvio
            });
          })
          .then(function () {
            return self.BancoDB.parchearCorrida(idCorrida, {
              swDisparo: disparoEn,
              swDesvioMs: desvio
            });
          })
          .then(avisarAPaginas)
          .then(resolver, resolver);
      }, esperar);
    });
  });
}

/*
 * Busca corridas cuyo temporizador del SW ya venció pero nunca disparó. Si encuentra
 * alguna, la marca. Eso es evidencia directa de que el navegador mató al worker.
 */
function revisarVencidos() {
  return self.BancoDB.listarCorridas().then(function (corridas) {
    var ahora = Date.now();
    var pendientes = corridas.filter(function (c) {
      return c.estrategias && c.estrategias.indexOf('B') !== -1 &&
             !c.swDisparo && !c.swCancelado && !c.swFallaRegistrada &&
             c.venceEn && c.venceEn < ahora;
    });
    return Promise.all(pendientes.map(function (c) {
      return self.BancoDB.anotar({
        idCorrida: c.idCorrida,
        tipo: 'sw_no_disparo',
        estrategia: 'B',
        detalle: 'El worker despertó después del vencimiento y el timer nunca había disparado: el navegador lo mató.',
        venceEn: c.venceEn,
        detectadoEn: ahora,
        tardeMs: ahora - c.venceEn
      }).then(function () {
        return self.BancoDB.parchearCorrida(c.idCorrida, { swFallaRegistrada: true });
      });
    }));
  }).catch(function () { /* nunca dejar que esto rompa un fetch */ });
}

function avisarAPaginas() {
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(function (clientes) {
      clientes.forEach(function (c) { c.postMessage({ tipo: 'REFRESCAR_LOG' }); });
    });
}

// Que el usuario toque la notificación es la prueba más fuerte de que la vio.
self.addEventListener('notificationclick', function (evento) {
  var datos = evento.notification.data || {};
  evento.notification.close();
  evento.waitUntil(
    self.BancoDB.anotar({
      idCorrida: datos.idCorrida,
      tipo: 'notificacion_tocada',
      estrategia: datos.estrategia,
      detalle: 'El usuario tocó la notificación: prueba de que se entregó y de que la vio.'
    }).then(function () {
      return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    }).then(function (clientes) {
      if (clientes.length) return clientes[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
