/*
 * sw.js — Service worker de la app.
 *
 * Un solo trabajo: que la app abra sin señal. El gimnasio está en un subsuelo.
 *
 * Ojo: este archivo NO es un módulo (no lleva import/export). Los service workers se
 * cargan distinto que el resto del código, así que acá va JavaScript común.
 *
 * El banco de pruebas tiene el suyo en banco/sw.js, con su propio alcance.
 */

var CACHE = 'fitapp-v1';

/*
 * Todo lo que tiene que estar guardado para que la app abra sin conexión.
 *
 * SI AGREGÁS UN ARCHIVO A LA APP Y NO LO PONÉS ACÁ, va a andar en tu casa y fallar en el
 * gimnasio. Y si ponés uno que no existe, falla la instalación ENTERA y no queda nada
 * cacheado. Por eso `node tools/verificar.mjs` revisa las dos cosas.
 */
var ARCHIVOS = [
  './',
  './index.html',
  './estilos.css',
  './app.js',
  './tipos.js',
  './manifest.webmanifest',

  './datos/reglas.json',
  './datos/ejercicios.json',
  './datos/rutinas.json',

  './logica/progresion.js',
  './logica/historial.js',
  './logica/almacen.js',
  './logica/catalogo.js',
  './logica/respaldo.js',
  './logica/temporizador.js',

  './pantallas/sesion.js',

  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-512.png'
];

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
  );
});

/*
 * Primero el caché, después la red.
 *
 * Elegido a propósito por sobre "primero la red": el requisito es abrir en el subsuelo sin
 * señal. Con "primero la red", cada apertura sin conexión espera a que falle antes de usar
 * el caché, y eso se siente como que la app no arranca.
 *
 * El precio es que una versión nueva entra recién en la segunda apertura: servimos lo
 * guardado y en paralelo bajamos lo nuevo para la próxima vez.
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
        // Sin red y sin caché: si es una navegación, al menos abrimos la app.
        return cacheado || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
      });
      return cacheado || desdeRed;
    })
  );
});
