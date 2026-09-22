// @ts-check
/**
 * app.js — El arranque de la app, la navegación, y las pantallas de Hoy e Historial.
 *
 * La navegación es mostrar una sección y ocultar las otras. No hay librería de ruteo: son
 * tres pantallas.
 */

import { cargarCatalogo, descansoDe, descansoDespuesDe } from './logica/catalogo.js';
import { listarSesiones, guardarSesion, guardarAjuste, leerAjuste } from './logica/almacen.js';
import {
  sesionEnCurso, sesionesTerminadas, resumenSesion,
  sesionCompleta, esRecord, semanaEntrenada, intentosDeEjercicio
} from './logica/historial.js';
import { sugerirCarga, objetivosEnLinea } from './logica/progresion.js';
import { asegurarPersistencia } from './logica/respaldo.js';
import { crearTemporizador } from './logica/temporizador.js';
import { crearPantallaSesion } from './pantallas/sesion.js';
import { icono } from './iconos.js';

/** @typedef {import('./tipos.js').Sesion} Sesion */
/** @typedef {import('./logica/catalogo.js').Catalogo} Catalogo */

/**
 * VERSIÓN — tiene que coincidir con la de sw.js. El verificador lo revisa.
 *
 * Se muestra abajo de todo en Hoy. Parece un detalle, pero sin esto no hay forma de saber
 * si lo que estás mirando en el teléfono es la versión nueva o una vieja que quedó
 * guardada, y se pierde media hora discutiendo si un cambio se aplicó o no.
 */
const VERSION = 'v8';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const escapar = (/** @type {any} */ s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const dosDigitos = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * ¿Está abierta desde el ícono de la pantalla de inicio, o es una pestaña del navegador?
 *
 * Importa: los bordes seguros (lo que evita que el título quede abajo del Dynamic Island)
 * SOLO existen en modo instalado. En una pestaña valen cero.
 */
function estaInstalada() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         /** @type {any} */ (window.navigator).standalone === true;
}

/** @type {Catalogo} */
let catalogo;
/** @type {Sesion[]} */
let sesiones = [];
/** @type {ReturnType<typeof crearPantallaSesion>} */
let pantallaSesion;
let onboardingListo = false;
let diasElegidos = 3;

// ===================================================================== arranque

arrancar();

async function arrancar() {
  try {
    catalogo = await cargarCatalogo();
  } catch (e) {
    mostrarErrorFatal(e);
    return;
  }

  asegurarPersistencia().catch(() => {});
  registrarServiceWorker();

  try {
    sesiones = await listarSesiones();
    onboardingListo = !!(await leerAjuste('onboardingListo', false));
    diasElegidos = Number(await leerAjuste('diasPorSemana', 3)) || 3;
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

  dibujarNavegacion();
  $('cargando').hidden = true;
  $('app').hidden = false;
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

  // Si ya había uno controlando la página, un cambio de controlador quiere decir que entró
  // una versión nueva: recargamos para que la veas, en vez de dejarte mirando la anterior.
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').catch(() => {
    // Sin service worker la app anda, pero no abre sin señal. No es para frenar todo.
  });
}

// =================================================================== navegación

function dibujarNavegacion() {
  $('navegacion').innerHTML = `
    <button type="button" data-ir="hoy" class="nav-boton activo">${icono('pesa', 22)}<span>Hoy</span></button>
    <button type="button" data-ir="historial" class="nav-boton">${icono('lista', 22)}<span>Historial</span></button>`;
}

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

// Puede haber pasado tiempo con la app en el bolsillo y el descanso ya terminó.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && pantallaSesion) pantallaSesion.refrescar();
});

// ================================================================ pantalla HOY

/** Cuánto va a durar, más o menos: las series más los descansos. */
function duracionEstimadaMin(/** @type {import('./tipos.js').DiaRutina} */ dia) {
  const SEGUNDOS_POR_SERIE = 45;
  let total = 0;
  for (const p of dia.ejercicios) {
    total += p.series * (SEGUNDOS_POR_SERIE + descansoDe(catalogo, p));
    total += descansoDespuesDe(catalogo, p);
  }
  return Math.round(total / 60 / 5) * 5;
}

/**
 * Qué le va a pedir la app en este ejercicio la próxima vez, en una línea.
 *
 * Sale de `sugerirCarga`, la MISMA función que usa la pantalla de sesión. Esto no es un
 * detalle de implementación: antes acá se mostraba "3 × 8-12", que era el modelo viejo de
 * tres series iguales contra un rango, mientras el motor ya trabajaba con un objetivo por
 * serie. Las dos pantallas decían cosas distintas del mismo ejercicio, y la que el usuario
 * ve primero era la que estaba mal. Calculándolo con la misma función no se pueden volver
 * a separar.
 *
 * La primera vez con un ejercicio no hay objetivos que valga la pena adelantar: el peso
 * todavía no existe y el ciclo no arrancó. Ahí se muestra el rango del plan y se aclara.
 *
 * @param {import('./tipos.js').EjercicioPlanificado} p
 * @returns {string}
 */
function objetivosDelPlan(p) {
  const e = catalogo.ejercicioPorId.get(p.ejercicioId);
  if (!e) return p.series + (p.series === 1 ? ' serie' : ' series');

  const s = sugerirCarga(intentosDeEjercicio(sesiones, p.ejercicioId), p, e, catalogo.reglas);
  if (s.motivo === 'primera-vez') return p.repsMin + '-' + p.repsMax + ' · primera vez';
  return objetivosEnLinea(s.objetivos);
}

function dibujarHoy() {
  const terminadas = sesionesTerminadas(sesiones);

  // Sin historial y sin haber pasado por la bienvenida, va la bienvenida.
  if (!onboardingListo && terminadas.length === 0) { dibujarBienvenida(); return; }

  const rutina = catalogo.rutinas[0];
  if (!rutina) {
    $('pantalla-hoy').innerHTML = '<p class="vacio">No hay ninguna rutina cargada.</p>';
    return;
  }

  // Cuál día toca: el siguiente al último que hizo.
  let siguiente = 0;
  if (terminadas[0]) {
    const i = rutina.dias.findIndex((d) => d.id === terminadas[0].diaId);
    if (i !== -1) siguiente = (i + 1) % rutina.dias.length;
  }
  const dia = rutina.dias[siguiente];
  const abierta = sesionEnCurso(sesiones);

  const filas = dia.ejercicios.map((p, i) => {
    const e = catalogo.ejercicioPorId.get(p.ejercicioId);
    return `
      <div class="fila-ejercicio">
        <span class="fila-numero">${dosDigitos(i + 1)}</span>
        <span class="fila-nombre">${escapar(e ? e.nombre : p.ejercicioId)}</span>
        <span class="fila-dato">${escapar(objetivosDelPlan(p))}</span>
      </div>`;
  }).join('');

  const otros = rutina.dias
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i !== siguiente)
    .map(({ d, i }) => `
      <button type="button" class="otro-dia" data-dia="${escapar(d.id)}">
        <span>${escapar(d.nombre)}</span>
        <span class="num">${d.ejercicios.length} ejercicios · ${duracionEstimadaMin(d)} min</span>
      </button>`).join('');

  $('pantalla-hoy').innerHTML = `
    <span class="etiqueta">Hoy te toca</span>
    <h1 class="titulo-pantalla">${escapar(dia.nombre)}</h1>
    <p class="secundario">${escapar(rutina.nombre)} · ${duracionEstimadaMin(dia)} min aprox.</p>

    ${abierta ? `
      <div class="aviso">
        <strong>Tenés un entrenamiento a medias.</strong>
        Lo dejaste con ${abierta.series.length} ${abierta.series.length === 1 ? 'serie' : 'series'} registradas.
      </div>
      <button type="button" class="boton-cta" data-retomar="1" style="margin-bottom:24px">Seguir donde estaba</button>
    ` : ''}

    <div class="tarjeta" style="margin-top:24px">${filas}</div>

    <div class="barra-inferior">
      <button type="button" class="boton-cta" data-dia="${escapar(dia.id)}">Empezar entrenamiento</button>
    </div>

    ${otros ? `<div class="otros-dias"><span class="etiqueta">Otros días</span>${otros}</div>` : ''}

    <p class="marca-version">${VERSION} · ${estaInstalada() ? 'instalada' : 'en el navegador'}</p>
    ${estaInstalada() ? '' : `
      <div class="aviso">
        <strong>La estás viendo en el navegador.</strong> Los bordes de la pantalla solo
        funcionan con la app instalada. Compartir → Agregar a inicio, y abrila desde el ícono.
      </div>`}`;
}

// ========================================================= pantalla PRIMERA VEZ

function dibujarBienvenida() {
  const opciones = [2, 3, 4, 5].map((n) => `
    <button type="button" class="opcion-dia${n === diasElegidos ? ' elegida' : ''}" data-dias="${n}">
      <span class="n">${n}</span>
      <span class="txt">${n === 1 ? 'día' : 'días'}</span>
    </button>`).join('');

  $('pantalla-hoy').innerHTML = `
    <div class="bienvenida">
      <h1 class="frase-fuerte">Lo que no se anota,<br>no se repite.</h1>
      <p class="secundario">
        Anotá cada serie mientras entrenás. La app se encarga de decirte cuánto levantar
        la próxima vez.
      </p>

      <span class="etiqueta" style="display:block;margin-top:36px">¿Cuántos días por semana?</span>
      <div class="opciones-dias">${opciones}</div>

      <button type="button" class="boton-cta" data-empezar="1">Ver mi rutina</button>
    </div>
    <p class="marca-version">${VERSION} · ${estaInstalada() ? 'instalada' : 'en el navegador'}</p>`;
}

$('pantalla-hoy').addEventListener('click', async (ev) => {
  const destino = ev.target instanceof Element
    ? ev.target.closest('[data-dia],[data-retomar],[data-dias],[data-empezar]')
    : null;
  if (!(destino instanceof HTMLElement)) return;

  if (destino.dataset.dias) {
    diasElegidos = Number(destino.dataset.dias);
    await guardarAjuste('diasPorSemana', diasElegidos);
    dibujarBienvenida();
    return;
  }

  if (destino.dataset.empezar) {
    onboardingListo = true;
    await guardarAjuste('onboardingListo', true);
    dibujarHoy();
    return;
  }

  if (destino.dataset.retomar) {
    const abierta = sesionEnCurso(sesiones);
    if (abierta) abrirSesion(abierta);
    return;
  }

  const diaId = destino.dataset.dia;
  if (!diaId) return;

  /** @type {Sesion} */
  const nueva = {
    id: crypto.randomUUID(),
    rutinaId: catalogo.rutinas[0].id,
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
  const invertidos = new Set(catalogo.ejercicios.filter((e) => e.admiteAsistencia).map((e) => e.id));
  const terminadas = sesionesTerminadas(sesiones);

  const semana = semanaEntrenada(sesiones).map((d) => `
    <div class="dia-semana">
      <div class="inicial">${d.inicial}</div>
      <div class="dia-cuadro${d.entrenado ? ' entrenado' : ''}${d.esHoy ? ' hoy' : ''}">
        ${d.entrenado ? icono('tilde', 18) : ''}
      </div>
    </div>`).join('');

  const cabecera = `
    <span class="etiqueta">Esta semana</span>
    <div class="semana">${semana}</div>`;

  if (terminadas.length === 0) {
    $('pantalla-historial').innerHTML = `
      <h1 class="titulo-pantalla">Historial</h1>
      ${cabecera}
      <p class="vacio">Todavía no terminaste ningún entrenamiento.<br>
      Cuando cierres el primero, aparece acá.</p>`;
    return;
  }

  const filas = terminadas.map((s) => {
    const r = resumenSesion(s, unilaterales);
    const rutina = catalogo.rutinaPorId.get(s.rutinaId);
    const dia = rutina ? rutina.dias.find((d) => d.id === s.diaId) : null;
    const fecha = new Date(s.inicioTs);
    const completa = sesionCompleta(s, dia ? dia.ejercicios : []);
    const record = esRecord(s, terminadas, invertidos);

    return `
      <div class="sesion-fila">
        <div class="sesion-fecha">
          <div class="dia">${fecha.getDate()}</div>
          <div class="mes">${fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}</div>
        </div>
        <div class="sesion-linea"></div>
        <div class="sesion-cuerpo">
          <div class="sesion-titulo">
            ${escapar(dia ? dia.nombre : s.diaId)}
            ${record ? '<span class="marca record">Récord</span>' : ''}
            ${!completa ? '<span class="marca incompleto">Incompleto</span>' : ''}
          </div>
          <div class="sesion-datos">
            ${r.series} series · ${r.volumenKg.toLocaleString('es-AR')} kg${
              r.duracionMin !== null ? ' · ' + r.duracionMin + ' min' : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  $('pantalla-historial').innerHTML = `
    <h1 class="titulo-pantalla">Historial</h1>
    ${cabecera}
    <span class="etiqueta">${terminadas.length} ${terminadas.length === 1 ? 'entrenamiento' : 'entrenamientos'}</span>
    <div style="margin-top:8px">${filas}</div>`;
}
