// @ts-check
/**
 * logica/temporizador.test.js — Tests del archivo de audio del temporizador.
 *
 * Correr con:  node --test
 *
 * El temporizador en sí necesita un navegador, pero la pieza donde puede esconderse un
 * error sí se testea acá: el archivo de audio. Si la alarma quedara un segundo corrida, o
 * el tramo de silencio no fuera silencio, en el gimnasio no habría forma de darse cuenta
 * salvo esperando 90 segundos y escuchando.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { construirWavAlarma } from './temporizador.js';

const TASA = 8000;

/** Lee el WAV y devuelve la cabecera ya interpretada, más las muestras. */
function leerWav(/** @type {ArrayBuffer} */ buf) {
  const v = new DataView(buf);
  const texto = (/** @type {number} */ pos) =>
    String.fromCharCode(v.getUint8(pos), v.getUint8(pos + 1), v.getUint8(pos + 2), v.getUint8(pos + 3));
  const nMuestras = v.getUint32(40, true) / 2;
  return {
    riff: texto(0),
    wave: texto(8),
    canales: v.getUint16(22, true),
    tasa: v.getUint32(24, true),
    bits: v.getUint16(34, true),
    nMuestras,
    segundos: nMuestras / v.getUint32(24, true),
    muestra: (/** @type {number} */ i) => v.getInt16(44 + i * 2, true)
  };
}

/** La amplitud más alta entre dos momentos, en segundos. */
function amplitudMaxima(/** @type {any} */ wav, /** @type {number} */ desdeSeg, /** @type {number} */ hastaSeg) {
  let max = 0;
  const desde = Math.floor(desdeSeg * TASA);
  const hasta = Math.min(Math.floor(hastaSeg * TASA), wav.nMuestras);
  for (let i = desde; i < hasta; i++) max = Math.max(max, Math.abs(wav.muestra(i)));
  return max;
}

describe('construirWavAlarma — la cabecera', () => {
  const wav = leerWav(construirWavAlarma(90));

  test('es un WAV de verdad', () => {
    assert.equal(wav.riff, 'RIFF');
    assert.equal(wav.wave, 'WAVE');
  });

  test('mono, 16 bits, 8000 Hz', () => {
    assert.equal(wav.canales, 1);
    assert.equal(wav.bits, 16);
    assert.equal(wav.tasa, 8000);
  });

  test('dura el descanso más los 4 segundos de alarma', () => {
    assert.equal(wav.segundos, 94);
  });
});

describe('construirWavAlarma — dónde está la alarma', () => {
  const wav = leerWav(construirWavAlarma(90));

  test('los 90 segundos del descanso son casi silencio', () => {
    assert.ok(amplitudMaxima(wav, 0, 90) <= 1,
      'el tramo del descanso tiene que ser inaudible, o suena durante todo el descanso');
  });

  test('pero NO es silencio exacto', () => {
    // Si fuera cero absoluto, algunos sistemas lo descartan y deja de contar como "audio
    // sonando". Eso es justamente lo que mantiene viva la página.
    assert.equal(amplitudMaxima(wav, 0, 90), 1);
  });

  test('la alarma empieza justo al terminar el descanso', () => {
    assert.ok(amplitudMaxima(wav, 90, 94) > 20000, 'tendría que haber un pitido fuerte');
  });

  test('la alarma no se adelanta ni un segundo', () => {
    assert.ok(amplitudMaxima(wav, 88, 90) <= 1, 'todavía tiene que estar en silencio');
  });

  test('son varios pitidos cortos y no un tono continuo', () => {
    // Entre pitido y pitido hay silencio: si fuera un tono continuo, no habría huecos.
    let huecos = 0;
    for (let t = 90; t < 94; t += 0.05) {
      if (amplitudMaxima(wav, t, t + 0.05) < 100) huecos++;
    }
    assert.ok(huecos >= 4, 'esperaba huecos entre pitidos, encontré ' + huecos);
  });
});

describe('construirWavAlarma — los descansos que usa la app', () => {
  for (const segundos of [60, 90, 120, 150, 180]) {
    test('con ' + segundos + ' s la alarma cae en el segundo ' + segundos, () => {
      const wav = leerWav(construirWavAlarma(segundos));
      assert.equal(wav.segundos, segundos + 4);
      assert.ok(amplitudMaxima(wav, 0, segundos) <= 1, 'el descanso tiene que ser silencioso');
      assert.ok(amplitudMaxima(wav, segundos, segundos + 4) > 20000, 'la alarma tiene que sonar');
    });
  }

  test('un descanso de 180 s no pesa más de 3 MB', () => {
    const bytes = construirWavAlarma(180).byteLength;
    assert.ok(bytes < 3 * 1024 * 1024, 'pesó ' + (bytes / 1048576).toFixed(2) + ' MB');
  });
});

describe('construirWavAlarma — casos borde', () => {
  test('con cero segundos la alarma suena de entrada', () => {
    const wav = leerWav(construirWavAlarma(0));
    assert.equal(wav.segundos, 4);
    assert.ok(amplitudMaxima(wav, 0, 4) > 20000);
  });

  test('con un número negativo no se rompe', () => {
    const wav = leerWav(construirWavAlarma(-10));
    assert.equal(wav.segundos, 4);
  });
});
