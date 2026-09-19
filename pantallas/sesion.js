// @ts-check
/**
 * pantallas/sesion.js — La pantalla de entrenar. La más importante de la app.
 *
 * TODO lo de acá está subordinado a que **registrar una serie sea UN TOQUE.** Escribir
 * números en el teclado del celular con las manos transpiradas es la razón número uno por
 * la que la gente deja de registrar, y el que deja de registrar se va: 82% de retención a
 * 90 días para los que registran 5 o más días en su primera semana, contra 12% para los
 * que registran 0 o 1.
 *
 * Las cuatro reglas que no se rompen:
 *
 * 1. **El teclado numérico no se abre nunca.** Los ± saltan el incremento real del equipo,
 *    así que es imposible tipear 400 en vez de 40 y es imposible registrar un peso que no
 *    se puede armar con los discos que hay. Tocar el número abre el teclado, pero es la
 *    salida de emergencia, no el camino esperado.
 * 2. **"Listo" queda en la misma posición exacta** entre una serie y la siguiente. Por eso
 *    los números tienen ancho mínimo fijo y los ± miden siempre lo mismo: si el layout se
 *    corriera un pixel, se rompería el ritmo en la tarea más repetitiva de la app.
 * 3. **Lo de la vez pasada se ve en la misma tarjeta donde se carga**, arriba a la derecha.
 *    Ni en otra pantalla ni en un modal.
 * 4. **Borrar una serie pide dos toques.**
 *
 * El descanso está aparte a propósito, en logica/temporizador.js: es lo único que Android
 * puede obligarnos a rehacer.
 */

import { sugerirCarga, modoDeCarga, equipoDeCarga } from '../logica/progresion.js';
import { intentosDeEjercicio, sesionesTerminadas, ultimoPorEjercicio } from '../logica/historial.js';
import { descansoDe, descansoDespuesDe } from '../logica/catalogo.js';
import { icono } from '../iconos.js';

/** @typedef {import('../tipos.js').Sesion} Sesion */
/** @typedef {import('../tipos.js').Ejercicio} Ejercicio */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */
/** @typedef {import('../logica/catalogo.js').Catalogo} Catalogo */

const escapar = (/** @type {any} */ s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Muestra 42.5 como "42,5" y 40 como "40". */
const nro = (/** @type {number} */ n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** "01", "02"… para la numeración de las listas. */
const dosDigitos = (/** @type {number} */ n) => String(n).padStart(2, '0');

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
  /**
   * Lo que está por confirmarse. `pesoKg` puede ser null: es la primera vez con este
   * ejercicio y la app no recomienda peso, así que el campo arranca vacío y lo llena el
   * usuario con lo que haya usado de verdad.
   * @type {{pesoKg: number|null, reps: number}|null}
   */
  let borrador = null;
  /** @type {'peso'|'reps'|null} */
  let editando = null;
  /** Índice de la serie que está esperando el segundo toque para borrarse. */
  let borrandoSerie = -1;
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
    return sugerirCarga(intentosDeEjercicio(sesionesPrevias, p.ejercicioId), p, e, catalogo.reglas);
  }

  /**
   * De a cuánto se mueve el ± del peso: lo que salta el equipo de verdad.
   *
   * El equipo sale de `equipoDeCarga` y no de la columna `equipo` a secas, porque en los
   * asistidos el número que se anota son los kilos de AYUDA de la máquina, no los de la
   * barra. Ver el comentario largo de esa función en progresion.js.
   *
   * Si el ejercicio todavía no tiene equipo cargado en la planilla, saltos de 1 kg: la
   * misma suposición que hace la progresión, para que la pantalla no se contradiga con
   * la sugerencia que le acaba de mostrar al usuario.
   */
  function pasoDePeso() {
    const e = ejercicioActual();
    if (!e) return 1;
    const eq = equipoDeCarga(e, catalogo.reglas);
    if (!eq) return 1;
    return eq.incrementoMinimoKg > 0 ? eq.incrementoMinimoKg : 0;
  }

  function pisoDePeso() {
    const e = ejercicioActual();
    if (!e) return 0;
    const eq = equipoDeCarga(e, catalogo.reglas);
    return eq ? eq.pesoBaseKg : 0;
  }

  /**
   * El objetivo de repeticiones de UNA serie, contando desde 1.
   *
   * `null` quiere decir "al fallo": esa serie no tiene número, se hacen todas las que
   * salgan. Es distinto de que no haya objetivo.
   * @param {number} numeroSerie
   * @returns {number|null}
   */
  function objetivoDeSerie(numeroSerie) {
    const s = sugerenciaActual();
    if (!s) return null;
    const objetivo = s.objetivos[numeroSerie - 1];
    return objetivo === undefined ? null : objetivo;
  }

  /**
   * Deja el peso y las repeticiones ya cargados, para que el usuario solo confirme.
   *
   * El peso: la primera serie del ejercicio trae lo que sugiere la progresión; las
   * siguientes, lo que acaba de hacer, que es el mejor pronóstico que hay y vuelve a las
   * series 2 y 3 literalmente un toque. La primera vez con un ejercicio no viene nada:
   * queda en null y el campo se muestra vacío.
   *
   * Las repeticiones: el objetivo de ESTA serie, que ahora es propio de cada una. En la
   * serie al fallo no hay número, así que proponemos lo de la serie anterior.
   */
  function prepararBorrador() {
    const hechas = seriesHechas();
    const p = planActual();
    const ultima = hechas[hechas.length - 1];
    const objetivo = objetivoDeSerie(hechas.length + 1);

    /** @type {number|null} */
    let pesoKg;
    if (ultima) {
      pesoKg = ultima.pesoKg;
    } else {
      const s = sugerenciaActual();
      pesoKg = s ? s.pesoKg : null;
    }

    /*
     * En los ejercicios sin kilos —peso corporal, banda— la pantalla ni siquiera muestra
     * el campo de peso, así que el usuario no tendría cómo llenarlo. Ahí "vacío" es cero,
     * no "falta un dato": si no, el botón Listo quedaría deshabilitado para siempre.
     */
    const e = ejercicioActual();
    if (pesoKg === null && e && (modoDeCarga(e) === 'peso-corporal' || pasoDePeso() === 0)) pesoKg = 0;

    const reps = objetivo !== null ? objetivo
      : ultima ? ultima.reps
        : (p ? p.repsMin : 10);

    borrador = { pesoKg, reps };
  }

  // ------------------------------------------------------------------ acciones

  async function confirmarSerie() {
    const p = planActual();
    if (!sesion || !p || !borrador) return;

    // Sin peso no se puede confirmar: es la primera vez y todavía no anotó con cuánto lo
    // hizo. El botón está deshabilitado, pero esto también cubre el Enter del teclado.
    if (borrador.pesoKg === null) return;

    const hechas = seriesHechas();
    const numero = hechas.length + 1;

    /*
     * El objetivo se guarda junto con lo que hizo, y no se puede recalcular después.
     *
     * Es el dato que hace andar toda la regla de progresión: 7 repeticiones es un objetivo
     * cumplido si le pedían 7, y uno fallado si le pedían 9. El número solo no lo dice.
     */
    sesion.series.push({
      ejercicioId: p.ejercicioId,
      numero,
      pesoKg: borrador.pesoKg,
      reps: borrador.reps,
      objetivo: objetivoDeSerie(numero),
      completadaTs: Date.now()
    });
    await guardar(sesion);

    const eraLaUltima = numero >= p.series;

    // El descanso arranca solo. Entre series es uno; al terminar el ejercicio es otro, más
    // largo, porque hay que cambiar de aparato y capaz esperar que se desocupe.
    temporizador.arrancar(eraLaUltima ? descansoDespuesDe(catalogo, p) : descansoDe(catalogo, p), dibujar);
    arrancarTick();

    /*
     * Al terminar el ejercicio se pasa derecho al siguiente.
     *
     * Antes acá había una pantalla preguntando Fácil / Justo / No llegué. Murió con la
     * regla nueva: el botón existía para detectar que alguien había arrancado demasiado
     * liviano, y ahora eso se ve solo, porque hace el techo del rango de una y el peso
     * sube. Registrar una serie volvió a ser un solo toque.
     */
    if (eraLaUltima) { avanzar(); return; }

    prepararBorrador();
    editando = null;
    borrandoSerie = -1;
    dibujar();
  }

  /** Regla 4: borrar pide dos toques. El primero arma, el segundo borra. */
  async function tocarBorrar(/** @type {number} */ numero) {
    if (borrandoSerie !== numero) { borrandoSerie = numero; dibujar(); return; }

    const p = planActual();
    if (!sesion || !p) return;

    sesion.series = sesion.series.filter((s) => !(s.ejercicioId === p.ejercicioId && s.numero === numero));
    // Las que quedan se renumeran, o quedarían huecos que no significan nada.
    sesion.series
      .filter((s) => s.ejercicioId === p.ejercicioId)
      .sort((a, b) => a.numero - b.numero)
      .forEach((s, i) => { s.numero = i + 1; });

    await guardar(sesion);
    borrandoSerie = -1;
    prepararBorrador();
    dibujar();
  }

  function avanzar() {
    indice++;
    if (indice < plan.length) prepararBorrador();
    editando = null;
    borrandoSerie = -1;
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

  // El descanso redibuja cada medio segundo. Sin descanso corriendo no hay ningún reloj
  // andando: no gastamos batería de gusto.
  function arrancarTick() {
    detenerTick();
    tick = setInterval(dibujar, 500);
  }
  function detenerTick() {
    if (tick) { clearInterval(tick); tick = null; }
  }

  // ------------------------------------------------------------------ dibujo

  function dibujar() {
    if (!sesion) { contenedor.innerHTML = ''; return; }

    const terminada = indice >= plan.length;
    contenedor.innerHTML =
      (terminada ? dibujarFinal() : dibujarCabecera() + dibujarEjercicio()) +
      dibujarDescanso();

    const entrada = contenedor.querySelector('.valor-entrada');
    if (entrada instanceof HTMLInputElement) { entrada.focus(); entrada.select(); }
  }

  /**
   * El link al video del ejercicio.
   *
   * Es un link que abre YouTube afuera, no un reproductor incrustado. A propósito, por
   * tres razones: el reproductor de YouTube no funciona sin señal y la app se usa en el
   * subsuelo de un gimnasio; incrustarlo carga scripts de Google en cada pantalla, que es
   * justo lo que este proyecto no tiene; y al lado de una serie en curso un video que
   * arranca solo es más molesto que útil.
   *
   * `rel="noopener"` va siempre con `target="_blank"`: sin eso, la página que se abre
   * puede manipular la nuestra.
   * @param {Ejercicio|null} e
   * @returns {string}
   */
  function enlaceVideo(e) {
    if (!e || !e.video) return '';
    return `<a class="link-video" href="${escapar(e.video)}" target="_blank" rel="noopener">
              ${icono('play', 16)}<span>Ver el video</span>
            </a>`;
  }

  function dibujarCabecera() {
    const e = ejercicioActual();
    const segmentos = plan.map((_, i) => {
      const clase = i < indice ? 'hecho' : (i === indice ? 'actual' : '');
      return '<div class="segmento ' + clase + '"></div>';
    }).join('');

    return `
      <div class="sesion-cabecera">
        <div>
          <span class="etiqueta">Ejercicio ${indice + 1} de ${plan.length}</span>
          <h1 class="sesion-nombre">${escapar(e ? e.nombre : '')}</h1>
          ${enlaceVideo(e)}
        </div>
        <button type="button" class="sesion-salir" data-accion="terminar-sesion"
                aria-label="Terminar entrenamiento">${icono('cruz', 22)}</button>
      </div>
      <div class="segmentos">${segmentos}</div>`;
  }

  function dibujarEjercicio() {
    const p = planActual();
    const e = ejercicioActual();
    if (!p || !e || !borrador) return '';

    const hechas = seriesHechas();
    const modo = modoDeCarga(e);
    const paso = pasoDePeso();
    const sinPeso = modo === 'peso-corporal' || paso === 0;
    const unidad = modo === 'asistencia' ? 'kg ayuda' : 'kg';

    const filasHechas = hechas.map((h) => `
      <div class="hecha">
        <span class="tilde">${icono('tilde', 14)}</span>
        <span class="hecha-texto">Serie ${h.numero} · ${sinPeso ? '' : nro(h.pesoKg) + ' kg × '}${h.reps}${
          // Contra qué objetivo se hizo. Sin esto, la lista pierde justo el dato que la
          // regla nueva hace importar: 7 repeticiones puede ser un objetivo cumplido o uno
          // fallado, y el número solo no lo dice.
          h.objetivo === null || h.objetivo === undefined
            ? '<span class="hecha-meta"> · al fallo</span>'
            : h.reps >= h.objetivo
              ? '<span class="hecha-meta lograda"> · objetivo ' + h.objetivo + '</span>'
              : '<span class="hecha-meta"> · objetivo ' + h.objetivo + '</span>'
        }</span>
        <button type="button" class="hecha-borrar${borrandoSerie === h.numero ? ' confirmando' : ''}"
                data-accion="borrar" data-numero="${h.numero}"
                aria-label="${borrandoSerie === h.numero ? 'Tocá otra vez para borrar' : 'Borrar serie'}">
          ${icono('tacho', 18)}
        </button>
      </div>`).join('');

    // Regla 3: lo de la vez pasada, en la misma tarjeta.
    const ultimaVez = ultimoPorEjercicio(sesionesPrevias).get(p.ejercicioId);

    const numeroSerie = hechas.length + 1;
    const objetivo = objetivoDeSerie(numeroSerie);
    const sinPesoTodavia = borrador.pesoKg === null;

    const bloquePeso = sinPeso ? '' : `
      <div class="valor-bloque">
        <button type="button" class="mas-menos grande" data-accion="paso" data-campo="peso" data-delta="-1"
                ${sinPesoTodavia || borrador.pesoKg - paso < pisoDePeso() ? 'disabled' : ''} aria-label="Bajar peso">−</button>
        ${editando === 'peso'
          ? `<input class="valor-entrada" type="number" inputmode="decimal" step="${paso}"
                    value="${sinPesoTodavia ? '' : borrador.pesoKg}" placeholder="0" data-campo="peso">`
          : `<button type="button" class="peso-grande${sinPesoTodavia ? ' vacio' : ''}" data-accion="editar" data-campo="peso">${
              sinPesoTodavia ? '—' : nro(borrador.pesoKg)}<span class="unidad">${unidad}</span></button>`}
        <button type="button" class="mas-menos grande" data-accion="paso" data-campo="peso" data-delta="1"
                aria-label="Subir peso">+</button>
      </div>
      ${sinPesoTodavia
        ? '<p class="nota-lado">Primera vez con este ejercicio: probá un peso y anotá el que hayas usado.</p>'
        : ''}
      <div class="separador"></div>`;

    return `
      ${filasHechas ? `<div class="hechas">${filasHechas}</div>` : ''}

      <div class="tarjeta-serie">
        <div class="tarjeta-serie-cabecera">
          <span class="etiqueta">Serie ${numeroSerie} de ${p.series}</span>
          ${ultimaVez ? `<span class="etiqueta vez-pasada">La vez pasada · ${nro(ultimaVez.pesoKg)} kg × ${ultimaVez.reps}</span>` : ''}
        </div>

        <div class="objetivo-serie${objetivo === null ? ' al-fallo' : ''}">
          ${objetivo === null
            ? 'Última serie: <strong>al fallo</strong>. Hacé todas las que te salgan.'
            : 'Objetivo de esta serie: <strong>' + objetivo + ' repeticiones</strong>'}
        </div>

        ${bloquePeso}

        <div class="valor-bloque">
          <button type="button" class="mas-menos chico" data-accion="paso" data-campo="reps" data-delta="-1"
                  ${borrador.reps <= 1 ? 'disabled' : ''} aria-label="Bajar repeticiones">−</button>
          ${editando === 'reps'
            ? `<input class="valor-entrada" type="number" inputmode="numeric" step="1" value="${borrador.reps}" data-campo="reps">`
            : `<button type="button" class="reps-grande" data-accion="editar" data-campo="reps">${borrador.reps}<span class="unidad">reps</span></button>`}
          <button type="button" class="mas-menos chico" data-accion="paso" data-campo="reps" data-delta="1"
                  aria-label="Subir repeticiones">+</button>
        </div>

        ${e.esUnilateral ? '<p class="nota-lado">Anotá el peso de UNA mancuerna y las repeticiones de UN lado.</p>' : ''}
      </div>

      <div class="zona-confirmar">
        <button type="button" class="boton-principal" data-accion="confirmar"
                ${sinPeso || !sinPesoTodavia ? '' : 'disabled'}>Listo</button>
      </div>`;
  }

  function dibujarFinal() {
    const series = sesion ? sesion.series.length : 0;
    return `
      <span class="etiqueta">Entrenamiento terminado</span>
      <h1 class="titulo-pantalla">Listo</h1>
      <p class="secundario">${series} ${series === 1 ? 'serie registrada' : 'series registradas'}. Bien ahí.</p>
      <div class="barra-inferior">
        <button type="button" class="boton-principal" data-accion="terminar-sesion">Guardar y cerrar</button>
      </div>`;
  }

  /*
   * EL MOMENTO DEL DESCANSO — PROVISORIO A PROPÓSITO.
   *
   * Es lo único que falta diseñar de verdad, y no se puede decidir todavía: si la alarma
   * aguanta con el teléfono en el bolsillo en Android, esto tiene que estar pensado para
   * guardar el teléfono; si no aguanta, para mirarlo. Son dos diseños opuestos.
   */
  function dibujarDescanso() {
    const restante = temporizador.restanteMs();
    if (restante === null) return '';
    if (restante <= -10000) return '';   // a los 10 s de sonar, se va sola

    const total = Math.max(1, temporizador.totalSegundos());
    const seg = Math.max(0, Math.ceil(restante / 1000));
    const mm = String(Math.floor(seg / 60)).padStart(2, '0');
    const ss = String(seg % 60).padStart(2, '0');
    const sono = restante <= 0;

    const RADIO = 104;
    const VUELTA = 2 * Math.PI * RADIO;
    const avance = Math.min(1, Math.max(0, seg / total));

    /*
     * Qué viene después del descanso.
     *
     * Al terminar un ejercicio ya se avanzó al siguiente, así que `planActual()` es el que
     * viene y esto muestra su primera serie. Antes acá se bifurcaba porque en el medio
     * aparecía la pantalla de esfuerzo; ahora no hay nada en el medio.
     */
    const p = planActual();
    const eSiguiente = ejercicioActual();
    const siguiente = p
      ? (eSiguiente ? eSiguiente.nombre + ' · ' : '') + 'Serie ' + (seriesHechas().length + 1) + ' de ' + p.series
      : 'Terminar';

    // Sin peso todavía (primera vez con el ejercicio) no hay nada que adelantar.
    const valorSiguiente = borrador && borrador.pesoKg !== null
      ? nro(borrador.pesoKg) + ' kg × ' + borrador.reps
      : '';

    const problema = temporizador.problema();

    return `
      <div class="descanso">
        <div class="anillo">
          <svg viewBox="0 0 236 236">
            <circle class="anillo-pista" cx="118" cy="118" r="${RADIO}" fill="none" stroke-width="10"/>
            <circle class="anillo-progreso" cx="118" cy="118" r="${RADIO}" fill="none" stroke-width="10"
                    stroke-linecap="round" stroke-dasharray="${VUELTA.toFixed(1)}"
                    stroke-dashoffset="${(VUELTA * (1 - avance)).toFixed(1)}"/>
          </svg>
          <div class="anillo-numero">${sono ? '00:00' : mm + ':' + ss}</div>
        </div>

        <div class="ajuste-tiempo">
          <button type="button" data-accion="ajustar" data-delta="-30">−30 s</button>
          <button type="button" data-accion="ajustar" data-delta="30">+30 s</button>
        </div>

        <div class="despues">
          <span class="etiqueta">Después</span>
          <div class="despues-valor">${escapar(siguiente)}${valorSiguiente ? ' · ' + valorSiguiente : ''}</div>
        </div>

        ${problema ? `<p class="descanso-provisorio">${escapar(problema)}</p>` : ''}
        <button type="button" class="boton-borde" data-accion="saltar-descanso">
          ${sono ? 'Seguir' : 'Saltar descanso'}
        </button>
        <p class="descanso-provisorio">Diseño provisorio · falta el dato de Android</p>
      </div>`;
  }

  // ------------------------------------------------------------------ eventos

  // Un solo escuchador para toda la pantalla. Como el HTML se redibuja entero, enganchar
  // los botones de a uno obligaría a re-engancharlos cada vez.
  contenedor.addEventListener('click', (ev) => {
    const destino = ev.target instanceof Element ? ev.target.closest('[data-accion]') : null;
    if (!(destino instanceof HTMLElement)) return;

    const accion = destino.dataset.accion;
    const campo = destino.dataset.campo;

    if (accion === 'paso' && borrador && (campo === 'peso' || campo === 'reps')) {
      const delta = Number(destino.dataset.delta) || 0;
      if (campo === 'peso') {
        // Con el campo vacío (primera vez), el + arranca en el piso del equipo: la barra
        // olímpica en 20, una máquina en 0. Es el primer número posible de verdad.
        const desde = borrador.pesoKg === null ? pisoDePeso() - delta * pasoDePeso() : borrador.pesoKg;
        const nuevo = Math.round((desde + delta * pasoDePeso()) * 100) / 100;
        borrador.pesoKg = Math.max(pisoDePeso(), nuevo);
      } else {
        borrador.reps = Math.max(1, borrador.reps + delta);
      }
      dibujar();
    }

    if (accion === 'editar' && (campo === 'peso' || campo === 'reps')) { editando = campo; dibujar(); }
    if (accion === 'confirmar') confirmarSerie();
    if (accion === 'borrar') tocarBorrar(Number(destino.dataset.numero));
    if (accion === 'terminar-sesion') terminarSesion();
    if (accion === 'ajustar') { temporizador.ajustar(Number(destino.dataset.delta) || 0); dibujar(); }
    if (accion === 'saltar-descanso') { temporizador.cancelar(); detenerTick(); dibujar(); }
  });

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
     * @param {Sesion[]} todasLasSesiones
     */
    abrir(laSesion, todasLasSesiones) {
      sesion = laSesion;
      sesionesPrevias = sesionesTerminadas(todasLasSesiones).filter((s) => s.id !== laSesion.id);

      const rutina = catalogo.rutinaPorId.get(laSesion.rutinaId);
      const dia = rutina ? rutina.dias.find((x) => x.id === laSesion.diaId) : null;
      plan = dia ? dia.ejercicios : [];

      // Si la sesión venía a medias (cerraste la app en el gimnasio), retomamos en el
      // primer ejercicio al que le falten series.
      indice = plan.findIndex((p) => {
        const hechas = laSesion.series.filter((s) => s.ejercicioId === p.ejercicioId).length;
        return hechas < p.series;
      });
      if (indice === -1) indice = plan.length;

      editando = null;
      borrandoSerie = -1;
      if (indice < plan.length) prepararBorrador();
      dibujar();
    },

    cerrar() {
      detenerTick();
      temporizador.cancelar();
      sesion = null;
      contenedor.innerHTML = '';
    },

    /** Para que la app redibuje al volver del segundo plano. */
    refrescar: dibujar
  };
}
