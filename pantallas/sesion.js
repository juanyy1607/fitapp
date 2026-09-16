// @ts-check
/**
 * pantallas/sesion.js — La pantalla de entrenar. Es la más importante de la app.
 *
 * TODO lo de acá está subordinado a una sola cosa: **registrar una serie tiene que ser UN
 * TOQUE.** Escribir números en el teclado del celular con las manos transpiradas es la
 * razón número uno por la que la gente deja de registrar, y el que deja de registrar se
 * va: 82% de retención a 90 días para los que registran 5 o más días en su primera
 * semana, contra 12% para los que registran 0 o 1.
 *
 * De ahí salen tres decisiones que conviene no deshacer sin pensarlo:
 *
 * 1. **El peso y las repeticiones vienen precargados.** En la primera serie, con lo que
 *    sugiere la progresión; en las siguientes, con lo que acabás de hacer. El camino
 *    normal es tocar "Listo" y nada más.
 *
 * 2. **Para ajustar hay botones + y −, no teclado.** Y saltan de a lo que salta el equipo
 *    de verdad: 2,5 kg en barra, 2 en mancuernas, 5 en máquina. Tocar el número abre el
 *    teclado, pero eso es la salida de emergencia, no el camino esperado.
 *
 * 3. **El esfuerzo se pregunta una vez por ejercicio, no por serie.** Preguntarlo en cada
 *    serie serían unos 36 toques extra por sesión.
 *
 * El descanso está aparte a propósito: la pantalla solo le pide al temporizador que
 * arranque y le pregunta cuánto falta. Ver logica/temporizador.js.
 */

import { sugerirCarga, modoDeCarga } from '../logica/progresion.js';
import { intentosDeEjercicio, sesionesTerminadas } from '../logica/historial.js';
import { nombreDeEjercicio, descansoDe, descansoDespuesDe } from '../logica/catalogo.js';

/** @typedef {import('../tipos.js').Sesion} Sesion */
/** @typedef {import('../tipos.js').Ejercicio} Ejercicio */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */
/** @typedef {import('../logica/catalogo.js').Catalogo} Catalogo */

const escapar = (/** @type {any} */ s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Muestra 42.5 como "42,5" y 40 como "40". */
const nro = (/** @type {number} */ n) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * @param {Object} opciones
 * @param {HTMLElement} opciones.contenedor
 * @param {Catalogo} opciones.catalogo
 * @param {import('../logica/temporizador.js').Temporizador} opciones.temporizador
 * @param {(sesion: Sesion) => Promise<void>} opciones.guardar
 * @param {() => void} opciones.alTerminarSesion
 */
export function crearPantallaSesion({ contenedor, catalogo, temporizador, guardar, alTerminarSesion }) {
  /** @type {Sesion|null} */
  let sesion = null;
  /** @type {Sesion[]} */
  let sesionesPrevias = [];
  /** @type {EjercicioPlanificado[]} */
  let plan = [];
  let indice = 0;
  /** @type {{pesoKg: number, reps: number}|null} */
  let borrador = null;
  /** @type {'peso'|'reps'|null} */
  let editando = null;
  let esperandoEsfuerzo = false;
  /** @type {any} */
  let tick = null;

  // ------------------------------------------------------------------ datos

  const planActual = () => plan[indice];

  /** @returns {Ejercicio|null} */
  function ejercicioActual() {
    const p = planActual();
    return p ? catalogo.ejercicioPorId.get(p.ejercicioId) || null : null;
  }

  function seriesHechas() {
    const p = planActual();
    if (!sesion || !p) return [];
    return sesion.series.filter((s) => s.ejercicioId === p.ejercicioId).sort((a, b) => a.numero - b.numero);
  }

  function sugerenciaActual() {
    const p = planActual();
    const e = ejercicioActual();
    if (!p || !e) return null;
    const intentos = intentosDeEjercicio(sesionesPrevias, p.ejercicioId);
    return sugerirCarga(intentos, p, e, catalogo.reglas);
  }

  /** De a cuánto se mueve el botón + y − del peso: lo que salta el equipo de verdad. */
  function pasoDePeso() {
    const e = ejercicioActual();
    if (!e) return 1;
    const eq = catalogo.reglas.equipos[e.equipo];
    return eq && eq.incrementoMinimoKg > 0 ? eq.incrementoMinimoKg : 0;
  }

  function pisoDePeso() {
    const e = ejercicioActual();
    if (!e) return 0;
    const eq = catalogo.reglas.equipos[e.equipo];
    return eq ? eq.pesoBaseKg : 0;
  }

  /**
   * Deja el peso y las repeticiones ya cargados, para que el usuario solo confirme.
   *
   * Primera serie: lo que sugiere la progresión.
   * Series siguientes: lo que acaba de hacer. Es el mejor pronóstico que hay, y hace que
   * las series 2 y 3 sean literalmente un toque.
   */
  function prepararBorrador() {
    const hechas = seriesHechas();
    if (hechas.length > 0) {
      const ultima = hechas[hechas.length - 1];
      borrador = { pesoKg: ultima.pesoKg, reps: ultima.reps };
      return;
    }
    const s = sugerenciaActual();
    const p = planActual();
    borrador = {
      pesoKg: s && s.pesoKg !== null ? s.pesoKg : pisoDePeso(),
      reps: s ? s.repsObjetivo : (p ? p.repsMin : 10)
    };
  }

  // ------------------------------------------------------------------ acciones

  async function confirmarSerie() {
    const p = planActual();
    if (!sesion || !p || !borrador) return;

    const hechas = seriesHechas();
    sesion.series.push({
      ejercicioId: p.ejercicioId,
      numero: hechas.length + 1,
      pesoKg: borrador.pesoKg,
      reps: borrador.reps,
      completadaTs: Date.now()
    });
    await guardar(sesion);

    const eraLaUltima = hechas.length + 1 >= p.series;

    // El descanso arranca solo. Entre series del mismo ejercicio es uno; al terminar el
    // ejercicio es otro, más largo, porque hay que cambiar de aparato.
    const segundos = eraLaUltima ? descansoDespuesDe(catalogo, p) : descansoDe(catalogo, p);
    temporizador.arrancar(segundos, dibujar);
    arrancarTick();

    if (eraLaUltima) {
      esperandoEsfuerzo = true;
    } else {
      prepararBorrador();
    }
    editando = null;
    dibujar();
  }

  /** @param {'facil'|'justo'|'no-llegue'} valor */
  async function responderEsfuerzo(valor) {
    const p = planActual();
    if (!sesion || !p) return;

    // Queda en la última serie del ejercicio, que es donde se preguntó.
    const hechas = seriesHechas();
    if (hechas.length) hechas[hechas.length - 1].esfuerzo = valor;
    await guardar(sesion);

    esperandoEsfuerzo = false;
    avanzar();
  }

  function avanzar() {
    indice++;
    if (indice < plan.length) prepararBorrador();
    editando = null;
    dibujar();
  }

  async function terminarSesion() {
    if (!sesion) return;
    sesion.finTs = Date.now();
    await guardar(sesion);
    temporizador.cancelar();
    detenerTick();
    alTerminarSesion();
  }

  // El descanso necesita redibujar la cuenta cada medio segundo. Cuando no hay descanso
  // corriendo no hay ningún reloj andando: no gastamos batería de gusto.
  function arrancarTick() {
    detenerTick();
    tick = setInterval(() => {
      if (!temporizador.activo() && temporizador.sono()) { detenerTick(); }
      dibujar();
    }, 500);
  }

  function detenerTick() {
    if (tick) { clearInterval(tick); tick = null; }
  }

  // ------------------------------------------------------------------ dibujo

  function dibujar() {
    if (!sesion) { contenedor.innerHTML = ''; return; }

    const terminada = indice >= plan.length;
    contenedor.innerHTML =
      dibujarCabecera() +
      (terminada ? dibujarFinal() : (esperandoEsfuerzo ? dibujarEsfuerzo() : dibujarEjercicio())) +
      dibujarDescanso();

    // Si estábamos escribiendo un número a mano, el foco se pone solo.
    const entrada = contenedor.querySelector('.valor-entrada');
    if (entrada instanceof HTMLInputElement) { entrada.focus(); entrada.select(); }
  }

  function dibujarCabecera() {
    const hechas = sesion ? sesion.series.length : 0;
    const totalSeries = plan.reduce((n, p) => n + p.series, 0);
    const pct = totalSeries ? Math.min(100, Math.round((hechas / totalSeries) * 100)) : 0;
    return `
      <div class="cabecera-sesion">
        <span class="progreso">Ejercicio ${Math.min(indice + 1, plan.length)} de ${plan.length}</span>
        <button type="button" data-accion="terminar-sesion">Terminar</button>
      </div>
      <div class="barra-progreso"><div style="width:${pct}%"></div></div>`;
  }

  function dibujarEjercicio() {
    const p = planActual();
    const e = ejercicioActual();
    if (!p || !e || !borrador) return '';

    const hechas = seriesHechas();
    const s = sugerenciaActual();
    const modo = modoDeCarga(e);
    const paso = pasoDePeso();
    const piso = pisoDePeso();

    const etiquetaPeso = modo === 'asistencia' ? 'Ayuda' : (modo === 'lastre' ? 'Lastre' : 'Peso');
    const sinPeso = modo === 'peso-corporal' || paso === 0;

    const fichas = hechas.map((h) => `
      <span class="serie-hecha"><span class="n">${h.numero}</span>${
        sinPeso ? '' : nro(h.pesoKg) + ' kg × '
      }${h.reps}</span>`).join('');

    const controlPeso = sinPeso ? '' : `
      <div class="valor">
        <span class="valor-etiqueta">${etiquetaPeso}</span>
        ${editando === 'peso'
          ? `<input class="valor-entrada" type="number" inputmode="decimal" step="${paso}" value="${borrador.pesoKg}" data-campo="peso">`
          : `<button type="button" class="valor-numero" data-accion="editar" data-campo="peso">${nro(borrador.pesoKg)}<span class="unidad">kg</span></button>`}
        <div class="pasos">
          <button type="button" class="paso" data-accion="paso" data-campo="peso" data-delta="-1" ${borrador.pesoKg - paso < piso ? 'disabled' : ''}>−</button>
          <button type="button" class="paso" data-accion="paso" data-campo="peso" data-delta="1">+</button>
        </div>
      </div>`;

    return `
      <h1 class="nombre-ejercicio">${escapar(e.nombre)}</h1>
      <p class="plan-ejercicio">${p.series} series · ${p.repsMin} a ${p.repsMax} repeticiones</p>

      ${s ? `<div class="sugerencia${s.advertencia ? ' advertencia' : ''}">${escapar(s.explicacion)}${
        s.advertencia ? `<br><strong>Ojo:</strong> ${escapar(s.advertencia)}` : ''}</div>` : ''}

      ${fichas ? `<div class="series-hechas">${fichas}</div>` : ''}

      <div class="serie-actual">
        <div class="serie-numero">Serie ${hechas.length + 1} de ${p.series}</div>
        <div class="valores">
          ${controlPeso}
          <div class="valor">
            <span class="valor-etiqueta">Repeticiones</span>
            ${editando === 'reps'
              ? `<input class="valor-entrada" type="number" inputmode="numeric" step="1" value="${borrador.reps}" data-campo="reps">`
              : `<button type="button" class="valor-numero" data-accion="editar" data-campo="reps">${borrador.reps}</button>`}
            <div class="pasos">
              <button type="button" class="paso" data-accion="paso" data-campo="reps" data-delta="-1" ${borrador.reps <= 1 ? 'disabled' : ''}>−</button>
              <button type="button" class="paso" data-accion="paso" data-campo="reps" data-delta="1">+</button>
            </div>
          </div>
        </div>
        <button type="button" class="confirmar" data-accion="confirmar">Listo</button>
        ${e.esUnilateral ? '<p class="por-lado">Anotá el peso de UNA mancuerna y las repeticiones de UN lado.</p>' : ''}
      </div>

      ${hechas.length > 0 ? `<div class="fila-botones" style="margin-top:12px">
        <button type="button" data-accion="terminar-ejercicio">Terminar este ejercicio</button>
      </div>` : ''}`;
  }

  function dibujarEsfuerzo() {
    const e = ejercicioActual();
    return `
      <div class="esfuerzo">
        <h2>¿Cómo te fue con ${escapar(e ? e.nombre : 'este ejercicio')}?</h2>
        <p class="sub">Una sola vez por ejercicio. Sirve para saber cuánto subir la próxima.</p>
        <div class="esfuerzo-botones">
          <button type="button" data-accion="esfuerzo" data-valor="facil">Fácil
            <span class="detalle">Podía hacer varias repeticiones más</span></button>
          <button type="button" data-accion="esfuerzo" data-valor="justo">Justo
            <span class="detalle">Llegué, pero al límite</span></button>
          <button type="button" data-accion="esfuerzo" data-valor="no-llegue">No llegué
            <span class="detalle">Me quedé corto</span></button>
        </div>
      </div>`;
  }

  function dibujarFinal() {
    const series = sesion ? sesion.series.length : 0;
    return `
      <h1 class="nombre-ejercicio">Terminaste</h1>
      <p class="sub">${series} series registradas. Bien ahí.</p>
      <button type="button" class="principal ancho" data-accion="terminar-sesion">Guardar y cerrar</button>`;
  }

  /*
   * EL MOMENTO DEL DESCANSO — PROVISORIO A PROPÓSITO.
   *
   * Este pedazo es lo único que falta diseñar de verdad, y no se puede decidir todavía: si
   * la alarma aguanta con el teléfono en el bolsillo en Android, esto tiene que estar
   * pensado para guardar el teléfono; si no aguanta, tiene que estar pensado para
   * mirarlo. Son dos diseños opuestos.
   *
   * Hasta tener ese dato, una barra mínima que muestra la cuenta y deja seguir.
   */
  function dibujarDescanso() {
    const restante = temporizador.restanteMs();
    if (restante === null) return '';
    if (restante <= -10000) return '';   // a los 10 s de sonar, se va sola

    const problema = temporizador.problema();
    const seg = Math.max(0, Math.ceil(restante / 1000));
    const mm = String(Math.floor(seg / 60)).padStart(2, '0');
    const ss = String(seg % 60).padStart(2, '0');
    const sono = restante <= 0;

    return `
      <div class="descanso${sono ? ' sono' : ''}">
        <span class="descanso-numero">${sono ? '¡Dale!' : mm + ':' + ss}</span>
        <span class="descanso-texto">
          ${problema ? escapar(problema) : (sono ? 'Se terminó el descanso.' : 'Descansando')}
          <br><span class="descanso-provisorio">diseño provisorio · falta el dato de Android</span>
        </span>
        <button type="button" data-accion="saltar-descanso">${sono ? 'Listo' : 'Saltar'}</button>
      </div>`;
  }

  // ------------------------------------------------------------------ eventos

  // Un solo escuchador para toda la pantalla. Como el HTML se redibuja entero, enganchar
  // los botones de a uno obligaría a re-enganchar cada vez; así se hace una sola vez.
  contenedor.addEventListener('click', (ev) => {
    const destino = ev.target instanceof Element ? ev.target.closest('[data-accion]') : null;
    if (!(destino instanceof HTMLElement)) return;

    const accion = destino.dataset.accion;
    const campo = destino.dataset.campo;

    if (accion === 'paso' && borrador && (campo === 'peso' || campo === 'reps')) {
      const delta = Number(destino.dataset.delta) || 0;
      if (campo === 'peso') {
        const nuevo = Math.round((borrador.pesoKg + delta * pasoDePeso()) * 100) / 100;
        borrador.pesoKg = Math.max(pisoDePeso(), nuevo);
      } else {
        borrador.reps = Math.max(1, borrador.reps + delta);
      }
      dibujar();
    }

    if (accion === 'editar' && (campo === 'peso' || campo === 'reps')) { editando = campo; dibujar(); }
    if (accion === 'confirmar') confirmarSerie();
    if (accion === 'esfuerzo') responderEsfuerzo(/** @type {any} */ (destino.dataset.valor));
    if (accion === 'terminar-ejercicio') { esperandoEsfuerzo = true; dibujar(); }
    if (accion === 'terminar-sesion') terminarSesion();
    if (accion === 'saltar-descanso') { temporizador.cancelar(); detenerTick(); dibujar(); }
  });

  // Al escribir un número a mano, se toma al salir del campo o al apretar Enter.
  contenedor.addEventListener('change', (ev) => {
    const entrada = ev.target;
    if (!(entrada instanceof HTMLInputElement) || !borrador) return;
    const valor = Number(entrada.value.replace(',', '.'));
    if (!Number.isFinite(valor)) { editando = null; dibujar(); return; }
    if (entrada.dataset.campo === 'peso') borrador.pesoKg = Math.max(pisoDePeso(), valor);
    if (entrada.dataset.campo === 'reps') borrador.reps = Math.max(1, Math.round(valor));
    editando = null;
    dibujar();
  });

  contenedor.addEventListener('keydown', (ev) => {
    if (ev instanceof KeyboardEvent && ev.key === 'Enter' && ev.target instanceof HTMLInputElement) {
      ev.target.blur();
    }
  });

  // ------------------------------------------------------------------ interfaz

  return {
    /**
     * @param {Sesion} laSesion
     * @param {Sesion[]} todasLasSesiones  Para calcular las sugerencias.
     */
    abrir(laSesion, todasLasSesiones) {
      sesion = laSesion;
      sesionesPrevias = sesionesTerminadas(todasLasSesiones).filter((s) => s.id !== laSesion.id);

      const dia = catalogo.rutinaPorId.get(laSesion.rutinaId);
      const d = dia ? dia.dias.find((x) => x.id === laSesion.diaId) : null;
      plan = d ? d.ejercicios : [];

      // Si la sesión venía a medias (cerró la app en el gimnasio), retomamos donde estaba:
      // el primer ejercicio al que le falten series.
      indice = plan.findIndex((p) => {
        const hechas = laSesion.series.filter((s) => s.ejercicioId === p.ejercicioId).length;
        return hechas < p.series;
      });
      if (indice === -1) indice = plan.length;

      esperandoEsfuerzo = false;
      editando = null;
      if (indice < plan.length) prepararBorrador();
      dibujar();
    },

    cerrar() {
      detenerTick();
      temporizador.cancelar();
      sesion = null;
      contenedor.innerHTML = '';
    },

    /** Para que la app avise cuando vuelve del segundo plano. */
    refrescar: dibujar,

    /** El nombre del ejercicio actual, para mostrarlo en otro lado si hiciera falta. */
    ejercicioActualNombre() {
      const p = planActual();
      return p ? nombreDeEjercicio(catalogo, p.ejercicioId) : '';
    }
  };
}
