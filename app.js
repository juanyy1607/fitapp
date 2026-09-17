// @ts-check
/**
 * app.js — El arranque de la app y la navegación entre pantallas.
 *
 * Hace cuatro cosas y nada más:
 *   1. Carga los datos de entrenamiento y pide almacenamiento protegido.
 *   2. Registra el service worker, para que abra sin señal.
 *   3. Decide qué pantalla mostrar.
 *   4. Si quedó una sesión a medias, ofrece retomarla.
 *
 * La navegación es mostrar una sección y ocultar las otras. No hay ninguna librería de
 * ruteo: son tres pantallas.
 */

import { cargarCatalogo } from './logica/catalogo.js';
import { listarSesiones, guardarSesion } from './logica/almacen.js';
import { sesionEnCurso, sesionesTerminadas, resumenSesion, diasEntrenadosEnLosUltimos } from './logica/historial.js';
import { asegurarPersistencia } from './logica/respaldo.js';
import { crearTemporizador } from './logica/temporizador.js';
import { crearPantallaSesion } from './pantallas/sesion.js';

/** @typedef {import('./tipos.js').Sesion} Sesion */
/** @typedef {import('./logica/catalogo.js').Catalogo} Catalogo */

/**
 * VERSIÓN — tiene que coincidir con la de sw.js. El verificador lo revisa.
 *
 * Se muestra abajo de todo en la pantalla de Hoy. Parece un detalle, pero sin esto no hay
 * forma de saber si lo que estás mirando en el teléfono es la versión nueva o una vieja
 * que quedó guardada, y se pierde media hora discutiendo si un cambio se aplicó o no.
 */
const VERSION = 'v3';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * ¿Está abierta desde el ícono de la pantalla de inicio, o es una pestaña del navegador?
 *
 * Importa más de lo que parece: las zonas seguras (lo que evita que el título quede abajo
 * del Dynamic Island) SOLO existen en modo instalado. En una pestaña de Safari valen cero,
 * así que todo el trabajo de bordes no se ve.
 */
function estaInstalada() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         /** @type {any} */ (window.navigator).standalone === true;
}

const escapar = (/** @type {any} */ s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @type {Catalogo} */
let catalogo;
/** @type {Sesion[]} */
let sesiones = [];
/** @type {ReturnType<typeof crearPantallaSesion>} */
let pantallaSesion;

// ===================================================================== arranque

arrancar();

async function arrancar() {
  try {
    catalogo = await cargarCatalogo();
  } catch (e) {
    mostrarErrorFatal(e);
    return;
  }

  // No bloqueamos el arranque por esto: si falla, la app anda igual.
  asegurarPersistencia().catch(() => {});
  registrarServiceWorker();

  try {
    sesiones = await listarSesiones();
  } catch (e) {
    sesiones = [];
  }

  pantallaSesion = crearPantallaSesion({
    contenedor: $('pantalla-sesion'),
    catalogo,
    temporizador: crearTemporizador(),
    guardar: async (sesion) => {
      await guardarSesion(sesion);
      if (!sesiones.some((s) => s.id === sesion.id)) sesiones.unshift(sesion);
    },
    alTerminarSesion: async () => {
      sesiones = await listarSesiones();
      ir('hoy');
    }
  });

  $('cargando').hidden = true;
  $('app').hidden = false;
  $('navegacion').hidden = false;

  ir('hoy');
}

function mostrarErrorFatal(/** @type {any} */ e) {
  $('cargando').hidden = true;
  const caja = $('error');
  caja.hidden = false;
  caja.innerHTML =
    '<strong>No se pudieron cargar los datos de entrenamiento.</strong><br><br>' +
    escapar(e && e.message ? e.message : e) +
    '<br><br>Si es la primera vez que abrís la app, necesitás conexión una sola vez ' +
    'para que quede guardada en el teléfono.';
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Si ya había uno controlando la página, entonces un cambio de controlador quiere decir
  // que entró una versión nueva. En ese caso recargamos sola para que la veas, en vez de
  // dejarte mirando la anterior sin saberlo.
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').catch(() => {
    // Sin service worker la app funciona, pero no abre sin señal. No es para frenar todo.
  });
}

// =================================================================== navegación

/** @param {'hoy'|'sesion'|'historial'} pantalla */
function ir(pantalla) {
  for (const nombre of ['hoy', 'sesion', 'historial']) {
    $('pantalla-' + nombre).hidden = nombre !== pantalla;
  }
  for (const boton of document.querySelectorAll('[data-ir]')) {
    boton.classList.toggle('activo', boton instanceof HTMLElement && boton.dataset.ir === pantalla);
  }
  // La barra de abajo estorba mientras entrenás: son dos botones que no vas a tocar.
  $('navegacion').hidden = pantalla === 'sesion';

  if (pantalla === 'hoy') dibujarHoy();
  if (pantalla === 'historial') dibujarHistorial();
}

$('navegacion').addEventListener('click', (ev) => {
  const b = ev.target instanceof Element ? ev.target.closest('[data-ir]') : null;
  if (b instanceof HTMLElement && b.dataset.ir) ir(/** @type {any} */ (b.dataset.ir));
});

// La app vuelve del bolsillo: puede haber pasado tiempo y el descanso ya terminó.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && pantallaSesion) pantallaSesion.refrescar();
});

// ================================================================ pantalla HOY

function dibujarHoy() {
  const abierta = sesionEnCurso(sesiones);
  const terminadas = sesionesTerminadas(sesiones);
  const diasEstaSemana = diasEntrenadosEnLosUltimos(sesiones, 7);

  const rutina = catalogo.rutinas[0];
  if (!rutina) {
    $('pantalla-hoy').innerHTML = '<p class="vacio">No hay ninguna rutina cargada.</p>';
    return;
  }

  // Cuál día toca: el siguiente al último que hizo.
  const ultima = terminadas[0];
  let siguiente = 0;
  if (ultima) {
    const i = rutina.dias.findIndex((d) => d.id === ultima.diaId);
    if (i !== -1) siguiente = (i + 1) % rutina.dias.length;
  }

  const tarjetas = rutina.dias.map((dia, i) => {
    const ejercicios = dia.ejercicios
      .map((p) => catalogo.ejercicioPorId.get(p.ejercicioId))
      .filter(Boolean)
      .map((e) => /** @type {any} */ (e).nombre)
      .join(' · ');
    return `
      <button type="button" class="tarjeta" data-dia="${escapar(dia.id)}">
        <span class="tarjeta-titulo">${escapar(dia.nombre)}${i === siguiente ? ' — te toca' : ''}</span>
        <span class="tarjeta-detalle">${escapar(ejercicios)}</span>
      </button>`;
  }).join('');

  $('pantalla-hoy').innerHTML = `
    <h1>Hoy</h1>
    <p class="sub">${escapar(rutina.nombre)} · ${diasEstaSemana} ${diasEstaSemana === 1 ? 'día' : 'días'} esta semana</p>

    ${abierta ? `
      <div class="aviso">
        <strong>Tenés un entrenamiento a medias.</strong><br>
        Lo dejaste con ${abierta.series.length} ${abierta.series.length === 1 ? 'serie' : 'series'} registradas.
      </div>
      <button type="button" class="principal ancho" data-retomar="1" style="margin-bottom:20px">Seguir donde estaba</button>
    ` : ''}

    ${tarjetas}

    <p class="marca-version">
      ${VERSION} · ${estaInstalada() ? 'instalada' : 'en el navegador'}
    </p>
    ${estaInstalada() ? '' : `
      <div class="aviso">
        <strong>La estás viendo en el navegador.</strong><br>
        Los bordes de la pantalla (lo que evita que el título quede abajo del Dynamic Island)
        solo funcionan con la app instalada. Para verla como va a ser de verdad:
        Compartir → Agregar a inicio, y abrila desde el ícono.
      </div>`}`;
}

$('pantalla-hoy').addEventListener('click', async (ev) => {
  const destino = ev.target instanceof Element ? ev.target.closest('[data-dia],[data-retomar]') : null;
  if (!(destino instanceof HTMLElement)) return;

  if (destino.dataset.retomar) {
    const abierta = sesionEnCurso(sesiones);
    if (abierta) abrirSesion(abierta);
    return;
  }

  const diaId = destino.dataset.dia;
  if (!diaId) return;

  const rutina = catalogo.rutinas[0];
  /** @type {Sesion} */
  const nueva = {
    id: crypto.randomUUID(),
    rutinaId: rutina.id,
    diaId,
    inicioTs: Date.now(),
    finTs: null,
    series: []
  };
  await guardarSesion(nueva);
  sesiones.unshift(nueva);
  abrirSesion(nueva);
});

function abrirSesion(/** @type {Sesion} */ sesion) {
  pantallaSesion.abrir(sesion, sesiones);
  ir('sesion');
}

// ========================================================== pantalla HISTORIAL

function dibujarHistorial() {
  const unilaterales = new Set(catalogo.ejercicios.filter((e) => e.esUnilateral).map((e) => e.id));
  const terminadas = sesionesTerminadas(sesiones);

  if (terminadas.length === 0) {
    $('pantalla-historial').innerHTML = `
      <h1>Historial</h1>
      <p class="vacio">Todavía no hay entrenamientos guardados.<br>Cuando termines el primero, aparece acá.</p>`;
    return;
  }

  const filas = terminadas.map((s) => {
    const r = resumenSesion(s, unilaterales);
    const dia = catalogo.rutinaPorId.get(s.rutinaId);
    const nombreDia = dia ? (dia.dias.find((d) => d.id === s.diaId) || {}).nombre : s.diaId;
    const fecha = new Date(s.inicioTs).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    return `
      <div class="tarjeta">
        <span class="tarjeta-titulo">${escapar(nombreDia || '')} · ${escapar(fecha)}</span>
        <span class="tarjeta-detalle">
          ${r.series} series · ${r.ejercicios} ejercicios · ${r.volumenKg.toLocaleString('es-AR')} kg movidos${
            r.duracionMin !== null ? ' · ' + r.duracionMin + ' min' : ''}
        </span>
      </div>`;
  }).join('');

  $('pantalla-historial').innerHTML = `
    <h1>Historial</h1>
    <p class="sub">${terminadas.length} ${terminadas.length === 1 ? 'entrenamiento' : 'entrenamientos'}</p>
    ${filas}`;
}
