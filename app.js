/*
 * app.js — Banco de pruebas del temporizador de descanso.
 *
 * Qué mide cada estrategia (ver README.md para el detalle):
 *   A — setTimeout en la página + Notification API
 *   B — setTimeout adentro del service worker (vive en sw.js)
 *   C — Wake Lock (pantalla encendida) + sonido
 *   D — Recuperación por marca de tiempo (NO avisa; solo verifica el contador)
 *   E — Audio silencioso en bucle para que el sistema no congele la página (extra)
 *
 * Regla de oro de todo el archivo: el tiempo SIEMPRE se calcula restando marcas de
 * tiempo absolutas (`venceEn - Date.now()`), nunca sumando de a un segundo. Si el
 * JavaScript se congela 4 minutos, un contador que suma queda 4 minutos atrasado; uno
 * que resta marcas de tiempo muestra el valor correcto apenas despierta.
 */
(function () {
  'use strict';

  var CLAVE_ACTIVA = 'banco-timer:corrida-activa';
  var CLAVE_LATIDO = 'banco-timer:ultimo-latido';
  var CLAVE_AJUSTES = 'banco-timer:ajustes';

  var corrida = null;          // corrida en curso, o null
  var intervaloContador = null;
  var intervaloLatido = null;
  var registroSW = null;
  var ctxAudio = null;
  var wakeLock = null;
  var audioSilencioso = null;
  var nodosProgramados = [];

  var $ = function (id) { return document.getElementById(id); };

  // =====================================================================
  // Arranque
  // =====================================================================

  document.addEventListener('DOMContentLoaded', function () {
    cablearInterfaz();
    restaurarAjustes();
    arrancarLatido();
    registrarServiceWorker();
    refrescarCapacidades();
    revisarCorridaPendiente();
    refrescarLog();
  });

  // =====================================================================
  // Latido: mide cuánto estuvo congelado el JavaScript
  // =====================================================================

  /*
   * Cada segundo dejamos la hora actual en localStorage. Cuando la app vuelve a la
   * vida, comparamos "ahora" contra el último latido: la diferencia es EXACTAMENTE
   * cuánto tiempo el sistema operativo tuvo el JavaScript congelado.
   *
   * Este es el número más importante de todo el experimento. Si la brecha es de 90
   * segundos, ninguna estrategia basada en setTimeout podía haber avisado a tiempo.
   */
  function arrancarLatido() {
    if (intervaloLatido) clearInterval(intervaloLatido);
    localStorage.setItem(CLAVE_LATIDO, String(Date.now()));
    intervaloLatido = setInterval(function () {
      localStorage.setItem(CLAVE_LATIDO, String(Date.now()));
    }, 1000);
  }

  function medirBrechaJS() {
    var ultimo = parseInt(localStorage.getItem(CLAVE_LATIDO) || '0', 10);
    if (!ultimo) return null;
    return Date.now() - ultimo;
  }

  // =====================================================================
  // Service worker
  // =====================================================================

  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      anotar({ tipo: 'error', detalle: 'Este navegador no soporta service workers.' });
      return;
    }
    navigator.serviceWorker.register('./sw.js')
      .then(function (reg) {
        registroSW = reg;
        return navigator.serviceWorker.ready;
      })
      .then(function (reg) {
        registroSW = reg;
        refrescarCapacidades();
        anotar({ tipo: 'sw_listo', detalle: 'Service worker activo y controlando la página.' });
      })
      .catch(function (e) {
        anotar({ tipo: 'error', detalle: 'Falló el registro del service worker: ' + e.message });
        refrescarCapacidades();
      });

    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev.data && ev.data.tipo === 'REFRESCAR_LOG') refrescarLog();
    });
  }

  // =====================================================================
  // Panel de capacidades
  // =====================================================================

  function esStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }

  function refrescarCapacidades() {
    var filas = [
      ['Contexto seguro (HTTPS)', window.isSecureContext,
        window.isSecureContext ? 'sí' : 'NO — sin HTTPS no anda nada de esto'],
      ['Notification API', 'Notification' in window,
        'Notification' in window ? 'disponible' : 'no existe en este navegador'],
      ['Permiso de notificaciones', 'Notification' in window && Notification.permission === 'granted',
        'Notification' in window ? Notification.permission : 'n/d'],
      ['Service worker soportado', 'serviceWorker' in navigator, 'serviceWorker' in navigator ? 'sí' : 'no'],
      ['Service worker activo', !!(registroSW && registroSW.active),
        registroSW && registroSW.active ? 'activo' : 'todavía no'],
      ['Página controlada por el SW', !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        navigator.serviceWorker && navigator.serviceWorker.controller ? 'sí' : 'no (recargá una vez)'],
      ['Screen Wake Lock API', 'wakeLock' in navigator, 'wakeLock' in navigator ? 'disponible' : 'no existe'],
      ['Wake Lock tomado ahora', !!wakeLock, wakeLock ? 'sí' : 'no'],
      ['Web Audio', typeof (window.AudioContext || window.webkitAudioContext) === 'function',
        typeof (window.AudioContext || window.webkitAudioContext) === 'function' ? 'disponible' : 'no existe'],
      ['Modo de visualización', esStandalone(), esStandalone() ? 'INSTALADA (standalone)' : 'pestaña del navegador'],
      ['Conexión', navigator.onLine, navigator.onLine ? 'con red' : 'sin red (modo avión / offline)'],
      ['IndexedDB', 'indexedDB' in window, 'indexedDB' in window ? 'disponible' : 'no existe']
    ];

    $('capacidades').innerHTML = filas.map(function (f) {
      return '<div class="cap ' + (f[1] ? 'ok' : 'no') + '">' +
             '<span class="cap-n">' + f[0] + '</span>' +
             '<span class="cap-v">' + escapar(String(f[2])) + '</span></div>';
    }).join('');

    $('agente').textContent = navigator.userAgent;
  }

  // =====================================================================
  // Audio
  // =====================================================================

  /*
   * El contexto de audio TIENE que crearse durante un toque del usuario. Los navegadores
   * no dejan que una página haga ruido sola. Por eso lo creamos al apretar "Arrancar".
   */
  function asegurarAudio() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!ctxAudio) ctxAudio = new Ctx();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    return ctxAudio;
  }

  /*
   * Agenda beeps en el RELOJ DEL MOTOR DE AUDIO, no con setTimeout.
   *
   * Por qué importa: el motor de audio corre en un hilo aparte del JavaScript. Si el
   * sistema congela el JavaScript, el motor de audio puede seguir andando igual. Es la
   * apuesta más fuerte que tenemos para que suene con la pantalla bloqueada.
   *
   * Ojo al leer el log: `onended` es JavaScript, así que si el JS está congelado el
   * evento se anota TARDE aunque el sonido haya salido a tiempo. Para eso está el
   * botón manual de "¿te avisó?": vos sos el único que sabe si lo escuchaste.
   */
  function programarBeeps(ctx, enSegundos, idCorrida, venceEn) {
    var t0 = ctx.currentTime + enSegundos;
    for (var i = 0; i < 3; i++) {
      var osc = ctx.createOscillator();
      var gan = ctx.createGain();
      var inicio = t0 + i * 0.35;
      osc.type = 'sine';
      osc.frequency.value = 880;
      gan.gain.setValueAtTime(0.0001, inicio);
      gan.gain.exponentialRampToValueAtTime(0.6, inicio + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.25);
      osc.connect(gan).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.3);
      nodosProgramados.push(osc);
      if (i === 0) {
        osc.onended = function () {
          var ahora = Date.now();
          anotar({
            idCorrida: idCorrida, tipo: 'disparo', estrategia: 'C',
            via: 'reloj del motor de audio (oscillator.start programado)',
            venceEn: venceEn, disparoEn: ahora, disparoEnIso: new Date(ahora).toISOString(),
            desvioMs: ahora - venceEn,
            nota: 'El sonido pudo haber salido en hora aunque este registro llegue tarde: onended es JavaScript.'
          });
          refrescarLog();
        };
      }
    }
  }

  function cancelarBeeps() {
    nodosProgramados.forEach(function (n) { try { n.onended = null; n.stop(0); } catch (e) {} });
    nodosProgramados = [];
  }

  function beepInmediato() {
    var ctx = asegurarAudio();
    if (ctx) programarBeeps(ctx, 0.01, corrida ? corrida.idCorrida : null, Date.now());
  }

  /*
   * ESTRATEGIA E — audio casi inaudible en bucle.
   *
   * La idea: los sistemas operativos tratan a una app que está reproduciendo audio como
   * "media activa" y tardan mucho más en congelarla. Fabricamos un WAV de un segundo con
   * un tono casi inaudible y lo dejamos en loop mientras corre el temporizador.
   *
   * Es la técnica que usan los temporizadores web que sí funcionan. Es la candidata con
   * más chances de las cinco. Costo: la batería dura un poco menos.
   */
  function wavCasiSilencioso(segundos) {
    var tasa = 8000, n = tasa * segundos, bytes = 44 + n * 2;
    var buf = new ArrayBuffer(bytes), v = new DataView(buf), i;
    function txt(pos, s) { for (var j = 0; j < s.length; j++) v.setUint8(pos + j, s.charCodeAt(j)); }
    txt(0, 'RIFF'); v.setUint32(4, bytes - 8, true); txt(8, 'WAVE');
    txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, tasa, true); v.setUint32(28, tasa * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, n * 2, true);
    // Amplitud mínima pero NO cero: el silencio digital exacto algunos sistemas lo
    // descartan y entonces no cuenta como "reproduciendo audio".
    for (i = 0; i < n; i++) v.setInt16(44 + i * 2, (i % 2 ? 1 : -1), true);
    var bin = '', u8 = new Uint8Array(buf);
    for (i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  function arrancarAudioSilencioso(idCorrida) {
    if (!audioSilencioso) {
      audioSilencioso = new Audio(wavCasiSilencioso(1));
      audioSilencioso.loop = true;
      audioSilencioso.volume = 0.02;
    }
    return audioSilencioso.play().then(function () {
      anotar({ idCorrida: idCorrida, tipo: 'audio_silencioso_on', estrategia: 'E',
               detalle: 'Bucle de audio casi inaudible en marcha para evitar que el sistema congele la página.' });
    }).catch(function (e) {
      anotar({ idCorrida: idCorrida, tipo: 'error', estrategia: 'E',
               detalle: 'No se pudo arrancar el audio silencioso: ' + e.message });
    });
  }

  function pararAudioSilencioso() {
    if (audioSilencioso) { try { audioSilencioso.pause(); } catch (e) {} }
  }

  // =====================================================================
  // Wake Lock
  // =====================================================================

  /*
   * Mantiene la pantalla encendida. Aviso importante para interpretar los resultados:
   * el sistema SUELTA el wake lock solo apenas la página deja de estar visible, y si el
   * usuario bloquea la pantalla a mano el wake lock no lo impide. O sea que en los
   * escenarios 2, 4, 5 y 6 esta estrategia va a soltarse casi seguro. Anotamos el
   * momento exacto en que se suelta, que es un dato valioso por sí mismo.
   */
  function pedirWakeLock(idCorrida) {
    if (!('wakeLock' in navigator)) {
      return anotar({ idCorrida: idCorrida, tipo: 'error', estrategia: 'C',
                      detalle: 'Este navegador no tiene Screen Wake Lock API.' });
    }
    return navigator.wakeLock.request('screen').then(function (wl) {
      wakeLock = wl;
      wl.addEventListener('release', function () {
        var ahora = Date.now();
        wakeLock = null;
        anotar({ idCorrida: idCorrida, tipo: 'wakelock_soltado', estrategia: 'C',
                 soltadoEn: ahora,
                 detalle: 'El sistema soltó el wake lock. Desde acá la pantalla se puede apagar.' });
        refrescarCapacidades();
        refrescarLog();
      });
      anotar({ idCorrida: idCorrida, tipo: 'wakelock_tomado', estrategia: 'C' });
      refrescarCapacidades();
    }).catch(function (e) {
      anotar({ idCorrida: idCorrida, tipo: 'error', estrategia: 'C',
               detalle: 'No se pudo tomar el wake lock: ' + e.message });
    });
  }

  function soltarWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }

  // =====================================================================
  // Notificaciones
  // =====================================================================

  /*
   * En iOS el constructor `new Notification()` no existe ni siquiera en PWAs instaladas:
   * hay que pasar por el service worker con `registration.showNotification()`. Probamos
   * primero el camino de la página (que es lo que la estrategia A quiere medir) y si no
   * está, caemos al del service worker. Anotamos por cuál de los dos salió.
   */
  function notificar(titulo, cuerpo, datos) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return Promise.resolve('sin permiso');
    }
    try {
      var n = new Notification(titulo, { body: cuerpo, tag: 'banco-timer-a', icon: './icons/icon-192.png' });
      n.onclick = function () {
        anotar({ idCorrida: datos.idCorrida, tipo: 'notificacion_tocada', estrategia: 'A' });
        window.focus();
      };
      return Promise.resolve('constructor Notification (página)');
    } catch (e) {
      if (registroSW) {
        return registroSW.showNotification(titulo, {
          body: cuerpo, tag: 'banco-timer-a', renotify: true, requireInteraction: true,
          icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: datos
        }).then(function () { return 'registration.showNotification (vía SW, típico de iOS)'; })
          .catch(function (e2) { return 'falló: ' + e2.message; });
      }
      return Promise.resolve('falló: ' + e.message);
    }
  }

  // =====================================================================
  // Arrancar / cancelar una corrida
  // =====================================================================

  function estrategiasElegidas() {
    return ['A', 'B', 'C', 'D', 'E'].filter(function (k) { return $('est' + k).checked; });
  }

  function arrancar() {
    if (corrida) return;

    var duracionSeg = parseInt(document.querySelector('input[name="dur"]:checked').value, 10);
    var estrategias = estrategiasElegidas();
    var inicioTs = Date.now();
    var venceEn = inicioTs + duracionSeg * 1000;

    corrida = {
      idCorrida: 'c' + inicioTs + '-' + Math.random().toString(36).slice(2, 7),
      inicioTs: inicioTs,
      inicioIso: new Date(inicioTs).toISOString(),
      duracionSeg: duracionSeg,
      venceEn: venceEn,
      venceEnIso: new Date(venceEn).toISOString(),
      estrategias: estrategias,
      escenario: $('escenario').value,
      dispositivo: $('dispositivo').value,
      instalada: esStandalone(),
      conRed: navigator.onLine,
      agente: navigator.userAgent
    };

    // Si el navegador mata la página, esto es lo único que sobrevive para reconstruir
    // qué estaba pasando cuando volvemos.
    localStorage.setItem(CLAVE_ACTIVA, JSON.stringify(corrida));
    guardarAjustes();

    BancoDB.guardarCorrida(corrida);
    anotar({
      idCorrida: corrida.idCorrida, tipo: 'inicio',
      duracionSeg: duracionSeg, venceEn: venceEn, venceEnIso: corrida.venceEnIso,
      estrategias: estrategias.join(','), escenario: corrida.escenario,
      dispositivo: corrida.dispositivo, instalada: corrida.instalada, conRed: corrida.conRed
    });

    // --- ESTRATEGIA A: setTimeout en la página
    if (estrategias.indexOf('A') !== -1) {
      corrida.timeoutA = setTimeout(function () {
        var ahora = Date.now();
        notificar('Descanso terminado', 'Estrategia A (página) — desvío ' + (ahora - venceEn) + ' ms',
                  { idCorrida: corrida.idCorrida, estrategia: 'A' })
          .then(function (via) {
            anotar({
              idCorrida: corrida.idCorrida, tipo: 'disparo', estrategia: 'A',
              via: 'setTimeout en la página → ' + via,
              venceEn: venceEn, disparoEn: ahora, disparoEnIso: new Date(ahora).toISOString(),
              desvioMs: ahora - venceEn, brechaJsMs: medirBrechaJS()
            });
            refrescarLog();
          });
      }, duracionSeg * 1000);
    }

    // --- ESTRATEGIA B: setTimeout en el service worker
    if (estrategias.indexOf('B') !== -1) {
      if (registroSW && registroSW.active) {
        registroSW.active.postMessage({ tipo: 'ARMAR_TIMER_SW', idCorrida: corrida.idCorrida, venceEn: venceEn });
      } else {
        anotar({ idCorrida: corrida.idCorrida, tipo: 'error', estrategia: 'B',
                 detalle: 'No hay service worker activo para armar el temporizador.' });
      }
    }

    // --- ESTRATEGIA C: wake lock + sonido
    if (estrategias.indexOf('C') !== -1) {
      pedirWakeLock(corrida.idCorrida);
      var ctx = asegurarAudio();
      if (ctx) {
        programarBeeps(ctx, duracionSeg, corrida.idCorrida, venceEn);
        anotar({ idCorrida: corrida.idCorrida, tipo: 'beeps_programados', estrategia: 'C',
                 detalle: 'Beeps agendados en el reloj del motor de audio, a ' + duracionSeg + ' s.' });
      }
      // Red de seguridad por si el motor de audio se suspende: un setTimeout común.
      corrida.timeoutC = setTimeout(function () {
        var ahora = Date.now();
        beepInmediato();
        anotar({ idCorrida: corrida.idCorrida, tipo: 'disparo', estrategia: 'C',
                 via: 'setTimeout de respaldo (beep inmediato)',
                 venceEn: venceEn, disparoEn: ahora, desvioMs: ahora - venceEn,
                 brechaJsMs: medirBrechaJS() });
        refrescarLog();
      }, duracionSeg * 1000);
    }

    // --- ESTRATEGIA D: no arma nada. Se verifica al volver, en revisarCorridaPendiente().
    if (estrategias.indexOf('D') !== -1) {
      anotar({ idCorrida: corrida.idCorrida, tipo: 'd_armada', estrategia: 'D',
               detalle: 'Marca de tiempo guardada. Esta estrategia NO avisa: solo comprueba que el contador esté bien al volver.' });
    }

    // --- ESTRATEGIA E: audio silencioso en bucle
    if (estrategias.indexOf('E') !== -1) {
      asegurarAudio();
      arrancarAudioSilencioso(corrida.idCorrida);
    }

    arrancarContador();
    pintarEstado();
    refrescarLog();
  }

  function cancelar(motivo) {
    if (!corrida) return;
    if (corrida.timeoutA) clearTimeout(corrida.timeoutA);
    if (corrida.timeoutC) clearTimeout(corrida.timeoutC);
    cancelarBeeps();
    soltarWakeLock();
    pararAudioSilencioso();
    if (registroSW && registroSW.active) {
      registroSW.active.postMessage({ tipo: 'CANCELAR_TIMER_SW', idCorrida: corrida.idCorrida });
    }
    anotar({ idCorrida: corrida.idCorrida, tipo: 'cancelada', detalle: motivo || 'Cancelada a mano.' });
    localStorage.removeItem(CLAVE_ACTIVA);
    $('marcado').dataset.corrida = corrida.idCorrida;
    $('marcado').hidden = false;
    corrida = null;
    detenerContador();
    pintarEstado();
    refrescarCapacidades();
    refrescarLog();
  }

  // =====================================================================
  // Contador en pantalla
  // =====================================================================

  function arrancarContador() {
    detenerContador();
    intervaloContador = setInterval(pintarContador, 100);
    pintarContador();
  }

  function detenerContador() {
    if (intervaloContador) clearInterval(intervaloContador);
    intervaloContador = null;
  }

  function pintarContador() {
    if (!corrida) { $('contador').textContent = '--:--'; $('contador').className = 'contador'; return; }
    var restante = corrida.venceEn - Date.now();   // SIEMPRE por resta de marcas de tiempo
    if (restante <= 0) {
      $('contador').textContent = '00:00';
      $('contador').className = 'contador vencido';
      $('sobrante').textContent = 'Venció hace ' + Math.round(-restante / 1000) + ' s';
      return;
    }
    var s = Math.ceil(restante / 1000);
    $('contador').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    $('contador').className = 'contador corriendo';
    $('sobrante').textContent = '';
  }

  function pintarEstado() {
    $('btnArrancar').disabled = !!corrida;
    $('btnCancelar').disabled = !corrida;
    $('estadoCorrida').textContent = corrida
      ? 'Corriendo ' + corrida.duracionSeg + ' s — estrategias ' + corrida.estrategias.join(', ')
      : 'Sin corrida activa';
    if (!corrida) { $('contador').textContent = '--:--'; $('sobrante').textContent = ''; }
  }

  // =====================================================================
  // ESTRATEGIA D: recuperación por marca de tiempo
  // =====================================================================

  /*
   * Se ejecuta al abrir la app y cada vez que vuelve a estar visible. Separa
   * deliberadamente las dos cosas que pediste no mezclar:
   *
   *   1. ¿El CONTADOR muestra el valor correcto al volver? (esto es la estrategia D)
   *   2. ¿La app AVISÓ mientras no la mirabas?             (esto lo miden A, B, C, E)
   *
   * `brechaJsMs` es el dato clave: cuánto estuvo el JavaScript congelado. Si esa brecha
   * cubre el vencimiento, ninguna estrategia basada en setTimeout podía haber avisado.
   */
  function revisarCorridaPendiente() {
    var crudo = localStorage.getItem(CLAVE_ACTIVA);
    if (!crudo) return;

    var guardada;
    try { guardada = JSON.parse(crudo); } catch (e) { localStorage.removeItem(CLAVE_ACTIVA); return; }

    var ahora = Date.now();
    var transcurrido = ahora - guardada.inicioTs;
    var brecha = medirBrechaJS();
    var yaVencio = ahora >= guardada.venceEn;

    anotar({
      idCorrida: guardada.idCorrida,
      tipo: 'reanudacion',
      estrategia: 'D',
      venceEn: guardada.venceEn,
      volvioEn: ahora,
      volvioEnIso: new Date(ahora).toISOString(),
      transcurridoRealMs: transcurrido,
      restanteMs: guardada.venceEn - ahora,
      yaVencio: yaVencio,
      msDesdeVencimiento: yaVencio ? ahora - guardada.venceEn : 0,
      brechaJsMs: brecha,
      contadorCorrecto: true,
      detalle: 'El contador se recalcula por resta de marcas de tiempo, así que al volver siempre muestra el valor real. ' +
               'Esto NO significa que la app haya avisado.'
    });

    if (yaVencio) {
      // La corrida terminó mientras no estábamos. Cerramos y pedimos el veredicto humano.
      localStorage.removeItem(CLAVE_ACTIVA);
      corrida = null;
      $('marcado').dataset.corrida = guardada.idCorrida;
      $('marcado').hidden = false;
      $('avisoReanudacion').hidden = false;
      $('avisoReanudacion').innerHTML =
        '<strong>Volviste después del vencimiento.</strong><br>' +
        'El JavaScript estuvo congelado <strong>' + (brecha === null ? '?' : Math.round(brecha / 1000) + ' s') + '</strong>.<br>' +
        'El temporizador venció hace ' + Math.round((ahora - guardada.venceEn) / 1000) + ' s.<br>' +
        'Marcá abajo si el teléfono te avisó o no.';
    } else {
      // Todavía está corriendo: la retomamos tal cual, sin perder tiempo.
      corrida = guardada;
      corrida.timeoutA = null;
      corrida.timeoutC = null;
      var faltaMs = corrida.venceEn - ahora;
      if (corrida.estrategias.indexOf('A') !== -1) {
        corrida.timeoutA = setTimeout(function () {
          var t = Date.now();
          notificar('Descanso terminado', 'Estrategia A (reanudada)', { idCorrida: corrida.idCorrida, estrategia: 'A' })
            .then(function (via) {
              anotar({ idCorrida: corrida.idCorrida, tipo: 'disparo', estrategia: 'A',
                       via: 'setTimeout reanudado → ' + via, venceEn: corrida.venceEn,
                       disparoEn: t, desvioMs: t - corrida.venceEn, brechaJsMs: medirBrechaJS() });
              refrescarLog();
            });
        }, faltaMs);
      }
      arrancarContador();
    }
    pintarEstado();
  }

  // =====================================================================
  // Visibilidad: registrar cada vez que la app se va y vuelve
  // =====================================================================

  document.addEventListener('visibilitychange', function () {
    var brecha = medirBrechaJS();
    anotar({
      idCorrida: corrida ? corrida.idCorrida : null,
      tipo: 'visibilidad',
      estado: document.visibilityState,
      brechaJsMs: document.visibilityState === 'visible' ? brecha : null
    });
    if (document.visibilityState === 'visible') {
      arrancarLatido();
      // El sistema suelta el wake lock al ocultar la página: si seguimos en carrera, lo repedimos.
      if (corrida && corrida.estrategias.indexOf('C') !== -1 && !wakeLock) pedirWakeLock(corrida.idCorrida);
      if (!corrida) revisarCorridaPendiente();
      refrescarCapacidades();
      refrescarLog();
    }
  });

  window.addEventListener('pagehide', function () {
    anotar({ idCorrida: corrida ? corrida.idCorrida : null, tipo: 'pagehide',
             detalle: 'La página se va a ocultar o a morir.' });
  });

  window.addEventListener('online', function () { anotar({ tipo: 'red', estado: 'online' }); refrescarCapacidades(); });
  window.addEventListener('offline', function () { anotar({ tipo: 'red', estado: 'offline' }); refrescarCapacidades(); });

  // =====================================================================
  // Log en pantalla
  // =====================================================================

  function anotar(datos) {
    return BancoDB.anotar(datos).catch(function (e) {
      console.error('No se pudo anotar en IndexedDB', e);
    });
  }

  function refrescarLog() {
    BancoDB.listarEventos().then(function (eventos) {
      var recientes = eventos.slice(-200).reverse();
      $('conteoLog').textContent = eventos.length + ' eventos guardados';
      $('log').innerHTML = recientes.map(function (e) {
        var hora = new Date(e.ts).toLocaleTimeString('es-AR', { hour12: false }) +
                   '.' + String(e.ts % 1000).padStart(3, '0');
        var partes = [];
        if (e.estrategia) partes.push('<span class="tag est-' + e.estrategia + '">' + e.estrategia + '</span>');
        partes.push('<span class="tag origen">' + e.origen + '</span>');
        if (typeof e.desvioMs === 'number') {
          partes.push('<span class="tag ' + (Math.abs(e.desvioMs) < 2000 ? 'bien' : 'mal') + '">desvío ' + e.desvioMs + ' ms</span>');
        }
        if (typeof e.brechaJsMs === 'number' && e.brechaJsMs !== null) {
          partes.push('<span class="tag ' + (e.brechaJsMs < 2000 ? 'bien' : 'mal') + '">JS congelado ' + e.brechaJsMs + ' ms</span>');
        }
        if (typeof e.tardeMs === 'number') partes.push('<span class="tag mal">tarde ' + e.tardeMs + ' ms</span>');
        var extra = e.detalle || e.via || e.nota || e.estado || '';
        return '<div class="ev tipo-' + e.tipo + '">' +
               '<div class="ev-cab"><span class="ev-hora">' + hora + '</span>' +
               '<span class="ev-tipo">' + escapar(e.tipo) + '</span>' + partes.join('') + '</div>' +
               (extra ? '<div class="ev-det">' + escapar(String(extra)) + '</div>' : '') +
               '</div>';
      }).join('') || '<p class="vacio">Todavía no hay eventos.</p>';
    });
  }

  // =====================================================================
  // Veredicto humano: ¿te avisó de verdad?
  // =====================================================================

  function marcar(aviso) {
    var id = $('marcado').dataset.corrida;
    if (!id) return;
    var nota = $('notaMarcado').value.trim();
    BancoDB.parchearCorrida(id, { avisoPercibido: aviso, notaHumana: nota })
      .then(function () {
        return anotar({ idCorrida: id, tipo: 'veredicto_humano', avisoPercibido: aviso,
                        detalle: (aviso ? 'SÍ me avisó. ' : 'NO me avisó. ') + nota });
      })
      .then(function () {
        $('marcado').hidden = true;
        $('avisoReanudacion').hidden = true;
        $('notaMarcado').value = '';
        refrescarLog();
      });
  }

  // =====================================================================
  // Exportar
  // =====================================================================

  function exportarArchivo() {
    BancoDB.exportar().then(function (datos) {
      var texto = JSON.stringify(datos, null, 2);
      var blob = new Blob([texto], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'banco-timer-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    });
  }

  function copiarPortapapeles() {
    BancoDB.exportar().then(function (datos) {
      var texto = JSON.stringify(datos, null, 2);
      var ok = function () { $('avisoCopia').textContent = 'Copiado al portapapeles.'; setTimeout(function () { $('avisoCopia').textContent = ''; }, 3000); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(ok, function () { copiaManual(texto); });
      } else {
        copiaManual(texto);
      }
    });
  }

  // En iOS el portapapeles falla seguido. Plan B: mostrar el texto para copiar a mano.
  function copiaManual(texto) {
    $('volcado').value = texto;
    $('volcado').hidden = false;
    $('volcado').select();
    $('avisoCopia').textContent = 'No pude copiar solo. Está el texto abajo para copiarlo a mano.';
  }

  // =====================================================================
  // Interfaz
  // =====================================================================

  function guardarAjustes() {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify({
      estrategias: estrategiasElegidas(),
      duracion: document.querySelector('input[name="dur"]:checked').value,
      escenario: $('escenario').value,
      dispositivo: $('dispositivo').value
    }));
  }

  function restaurarAjustes() {
    var crudo = localStorage.getItem(CLAVE_AJUSTES);
    if (!crudo) return;
    try {
      var a = JSON.parse(crudo);
      ['A', 'B', 'C', 'D', 'E'].forEach(function (k) { $('est' + k).checked = a.estrategias.indexOf(k) !== -1; });
      var r = document.querySelector('input[name="dur"][value="' + a.duracion + '"]');
      if (r) r.checked = true;
      if (a.escenario) $('escenario').value = a.escenario;
      if (a.dispositivo) $('dispositivo').value = a.dispositivo;
    } catch (e) {}
  }

  function cablearInterfaz() {
    $('btnArrancar').addEventListener('click', arrancar);
    $('btnCancelar').addEventListener('click', function () { cancelar('Cancelada a mano por el usuario.'); });
    $('btnPermiso').addEventListener('click', function () {
      if (!('Notification' in window)) { alert('Este navegador no tiene Notification API.'); return; }
      Notification.requestPermission().then(function (p) {
        anotar({ tipo: 'permiso_notificaciones', estado: p });
        refrescarCapacidades();
        refrescarLog();
      });
    });
    $('btnProbarNotif').addEventListener('click', function () {
      notificar('Prueba', 'Si ves esto, las notificaciones andan.', { estrategia: 'prueba' })
        .then(function (via) { anotar({ tipo: 'notificacion_prueba', via: via }); refrescarLog(); });
    });
    $('btnProbarSonido').addEventListener('click', function () { asegurarAudio(); beepInmediato(); });
    $('btnExportar').addEventListener('click', exportarArchivo);
    $('btnCopiar').addEventListener('click', copiarPortapapeles);
    $('btnRefrescar').addEventListener('click', function () { refrescarCapacidades(); refrescarLog(); });
    $('btnBorrar').addEventListener('click', function () {
      if (confirm('¿Borrar TODO el registro? No se puede deshacer.')) {
        BancoDB.borrarTodo().then(refrescarLog);
      }
    });
    $('btnSiAviso').addEventListener('click', function () { marcar(true); });
    $('btnNoAviso').addEventListener('click', function () { marcar(false); });
    ['A', 'B', 'C', 'D', 'E'].forEach(function (k) { $('est' + k).addEventListener('change', guardarAjustes); });
    $('escenario').addEventListener('change', guardarAjustes);
    $('dispositivo').addEventListener('change', guardarAjustes);
  }

  function escapar(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
