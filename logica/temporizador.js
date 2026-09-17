// @ts-check
/**
 * logica/temporizador.js — El temporizador de descanso, aislado del resto de la app.
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE PUEDE HABER QUE REHACER SEGÚN LO QUE DIGA ANDROID.
 *
 * Por eso está solo, con una interfaz chica y explícita:
 *
 *     const t = crearTemporizador();
 *     t.arrancar(90, () => { ... });   // arranca y avisa al terminar
 *     t.restanteMs();                  // cuánto falta, para dibujar la pantalla
 *     t.cancelar();
 *
 * La pantalla de sesión solo conoce esas cuatro cosas. No sabe nada de audio, ni de WAV,
 * ni de por qué el JavaScript se congela. Si mañana en Android hay que resolverlo de otra
 * forma, se cambia lo de adentro de este archivo y la pantalla no se entera.
 *
 * ── Cómo funciona hoy (medido en iPhone el 15/09) ──
 *
 * No existe ninguna API para programar una notificación local a futuro en una PWA, y el
 * sistema congela el JavaScript a los pocos segundos de bloquear la pantalla: medimos
 * brechas de 27 y 54 segundos. O sea que un setTimeout común no llega a ejecutarse.
 *
 * La solución que sí funcionó: fabricamos UN archivo de audio que es silencio durante todo
 * el descanso y trae la alarma adentro, al final, y lo reproducimos de una sola vez. El
 * que cuenta el tiempo pasa a ser el hardware de audio, no el JavaScript. Aunque el
 * sistema congele la página entera, el sonido ya está en la cola de reproducción.
 *
 * Medido con la pantalla apagada: la alarma sonó con +167 y +163 ms de desvío sobre 90
 * segundos, mientras el JavaScript estaba congelado casi 2 segundos. También funcionó en
 * modo avión y por AirPods.
 *
 * El setTimeout que hay acá abajo NO es el que hace sonar la alarma: solo avisa a la
 * pantalla para que se actualice. Puede llegar tarde y no pasa nada.
 */

const TASA = 8000;          // muestras por segundo. Alcanza de sobra para un pitido.
const SEG_ALARMA = 4;       // cuánto dura la alarma al final del archivo.
const FRECUENCIA = 880;     // Hz. Un la agudo, que se escucha bien desde el bolsillo.

/**
 * Fabrica el archivo de audio: silencio, y después la alarma.
 *
 * Devuelve el WAV crudo. Está separado de todo lo demás para poder testearlo sin
 * navegador: `node --test` comprueba que el silencio dure lo que tiene que durar y que la
 * alarma empiece exactamente donde corresponde.
 *
 * @param {number} segundosSilencio  Lo que dura el descanso.
 * @returns {ArrayBuffer}
 */
export function construirWavAlarma(segundosSilencio) {
  const nSilencio = Math.round(TASA * Math.max(0, segundosSilencio));
  const nAlarma = TASA * SEG_ALARMA;
  const n = nSilencio + nAlarma;
  const bytes = 44 + n * 2;

  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);

  const txt = (/** @type {number} */ pos, /** @type {string} */ t) => {
    for (let j = 0; j < t.length; j++) v.setUint8(pos + j, t.charCodeAt(j));
  };

  txt(0, 'RIFF'); v.setUint32(4, bytes - 8, true); txt(8, 'WAVE');
  txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, TASA, true); v.setUint32(28, TASA * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, n * 2, true);

  // Tramo 1: casi silencio. Amplitud mínima pero NO cero: el silencio digital exacto
  // algunos sistemas lo descartan, y entonces deja de contar como "audio sonando" —que es
  // justamente lo que mantiene viva la página.
  for (let i = 0; i < nSilencio; i++) v.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);

  // Tramo 2: la alarma. Pitidos cortos y separados, que desde el bolsillo se escuchan
  // mejor que un tono continuo.
  for (let i = 0; i < nAlarma; i++) {
    const t = i / TASA;
    const dentroDelPitido = (t % 0.5) < 0.22;
    let muestra = 0;
    if (dentroDelPitido) {
      const pos = (t % 0.5) / 0.22;
      const sobre = Math.sin(Math.PI * pos);   // ataque y caída, para que no chasquee
      muestra = Math.sin(2 * Math.PI * FRECUENCIA * t) * sobre * 22000;
    }
    v.setInt16(44 + (nSilencio + i) * 2, muestra, true);
  }

  return buf;
}

/**
 * @typedef {Object} Temporizador
 * @property {(segundos: number, alTerminar?: () => void) => Promise<void>} arrancar
 * @property {(deltaSegundos: number) => void} ajustar  Suma o resta tiempo al descanso en curso.
 * @property {() => void} cancelar
 * @property {() => number|null} restanteMs   null si no hay nada corriendo.
 * @property {() => number} totalSegundos     Lo que dura el descanso actual, para el anillo.
 * @property {() => boolean} activo
 * @property {() => boolean} sono             Si la alarma ya empezó a sonar.
 * @property {() => string|null} problema     Mensaje si el audio no pudo arrancar.
 */

/**
 * Crea un temporizador. Uno solo por pantalla alcanza.
 * @returns {Temporizador}
 */
export function crearTemporizador() {
  /** @type {HTMLAudioElement|null} */
  let audio = null;
  /** @type {string|null} */
  let url = null;
  /** @type {number|null} */
  let venceEn = null;
  /** @type {any} */
  let aviso = null;
  let yaSono = false;
  /** @type {string|null} */
  let problema = null;
  let total = 0;
  /** @type {(() => void)|undefined} */
  let avisarAlTerminar;

  function limpiar() {
    if (aviso) { clearTimeout(aviso); aviso = null; }
    if (audio) {
      try { audio.pause(); } catch (e) { /* da igual */ }
      audio = null;
    }
    if (url) { URL.revokeObjectURL(url); url = null; }
    venceEn = null;
  }

  return {
    /**
     * Arranca el descanso. `alTerminar` es solo para refrescar la pantalla: puede llegar
     * tarde si el sistema congeló el JavaScript, y eso no afecta a la alarma.
     * @param {number} segundos
     * @param {() => void} [alTerminar]
     */
    async arrancar(segundos, alTerminar) {
      limpiar();
      yaSono = false;
      problema = null;
      total = segundos;
      if (alTerminar) avisarAlTerminar = alTerminar;
      venceEn = Date.now() + segundos * 1000;

      try {
        url = URL.createObjectURL(new Blob([construirWavAlarma(segundos)], { type: 'audio/wav' }));
        audio = new Audio(url);
        audio.loop = false;
        audio.volume = 1;

        // Marcamos que sonó cuando el reproductor cruza el final del silencio. No hay
        // ningún setTimeout de por medio: lo dispara el reloj del audio.
        audio.addEventListener('timeupdate', () => {
          if (audio && audio.currentTime >= segundos && !yaSono) {
            yaSono = true;
            if (alTerminar) alTerminar();
          }
        });

        await audio.play();
      } catch (e) {
        // El navegador no deja reproducir audio si el usuario no tocó la pantalla antes.
        // No es fatal: el descanso sigue contando, solo que sin alarma.
        problema = 'No se pudo arrancar el sonido. Tocá la pantalla una vez y volvé a probar.';
      }

      // Red de seguridad para la interfaz. Si el sistema congeló el JavaScript, esto llega
      // tarde; la alarma ya sonó igual desde el archivo.
      aviso = setTimeout(() => {
        if (!yaSono) {
          yaSono = true;
          if (alTerminar) alTerminar();
        }
      }, segundos * 1000);
    },

    /*
     * Sumar o restar tiempo obliga a rehacer el archivo de audio entero, porque la alarma
     * está adentro, en un lugar fijo. No alcanza con mover un contador: hay que fabricar
     * un WAV nuevo con el silencio del largo correcto y volver a arrancarlo.
     *
     * Es el precio de que el tiempo lo lleve el hardware de audio y no el JavaScript. Vale
     * la pena: es lo único que hace sonar la alarma con el teléfono en el bolsillo.
     */
    ajustar(deltaSegundos) {
      const restante = this.restanteMs();
      if (restante === null) return;
      const nuevo = Math.max(5, Math.round(restante / 1000) + deltaSegundos);
      this.arrancar(nuevo, avisarAlTerminar);
    },

    cancelar() {
      limpiar();
      yaSono = false;
      total = 0;
    },

    restanteMs() {
      return venceEn === null ? null : venceEn - Date.now();
    },

    totalSegundos() {
      return total;
    },

    activo() {
      return venceEn !== null && venceEn - Date.now() > 0;
    },

    sono() {
      return yaSono;
    },

    problema() {
      return problema;
    }
  };
}
