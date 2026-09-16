/*
 * tools/validar-datos.mjs — Revisa los archivos de datos/ y explica qué está mal.
 *
 * Herramienta de desarrollo. Sin dependencias.
 *
 * Uso:  node tools/validar-datos.mjs
 *
 * Para qué existe: las reglas de entrenamiento las maneja el socio, no el código. Eso es
 * lo correcto, pero significa que un dato mal cargado puede romper la app en el gimnasio.
 * Este script lo agarra antes, y lo dice en castellano señalando la fila exacta, en vez
 * de dejar que el usuario vea una pantalla en blanco.
 *
 * Es distinto del chequeo de tipos (// @ts-check). Ese revisa el código que escribimos
 * nosotros; este revisa los datos que entran. Hacen falta los dos.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let fallas = 0;
const mal = (m) => { fallas++; console.log('  \x1b[31mERROR\x1b[0m ' + m); };
const bien = (m) => console.log('  \x1b[32mOK\x1b[0m    ' + m);
const titulo = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/** Lee un JSON y explica el problema en castellano si no se puede. */
function leerJson(ruta) {
  const completo = join(RAIZ, ruta);
  if (!existsSync(completo)) { mal('falta el archivo ' + ruta); return null; }
  try {
    return JSON.parse(readFileSync(completo, 'utf8'));
  } catch (e) {
    mal(ruta + ' no es un JSON válido: ' + e.message);
    mal('  (casi siempre es una coma de más al final de una lista, o una comilla sin cerrar)');
    return null;
  }
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const esTexto = (v) => typeof v === 'string' && v.trim().length > 0;

// ============================================================ reglas.json

titulo('reglas.json');

const reglas = leerJson('datos/reglas.json');

if (reglas) {
  if (!esNumero(reglas.descansoPorDefectoSeg) || reglas.descansoPorDefectoSeg <= 0) {
    mal('descansoPorDefectoSeg tiene que ser un número de segundos mayor que cero');
  }

  const p = reglas.progresion || {};
  if (!esNumero(p.subirPorcentaje) || p.subirPorcentaje <= 0) mal('progresion.subirPorcentaje tiene que ser mayor que cero');
  if (!esNumero(p.bajarPorcentaje) || p.bajarPorcentaje <= 0) mal('progresion.bajarPorcentaje tiene que ser mayor que cero');
  if (!Number.isInteger(p.sesionesFallidasParaBajar) || p.sesionesFallidasParaBajar < 1) {
    mal('progresion.sesionesFallidasParaBajar tiene que ser un número entero de 1 para arriba');
  }

  const equipos = reglas.equipos || {};
  const clavesEquipo = Object.keys(equipos);
  if (clavesEquipo.length === 0) mal('no hay ningún equipo definido en reglas.equipos');

  for (const clave of clavesEquipo) {
    const eq = equipos[clave];
    if (!esTexto(eq.nombre)) mal('el equipo "' + clave + '" no tiene nombre');
    if (!esNumero(eq.incrementoMinimoKg) || eq.incrementoMinimoKg < 0) {
      mal('el equipo "' + clave + '" tiene un incrementoMinimoKg inválido (tiene que ser 0 o más)');
    }
    if (!esNumero(eq.pesoBaseKg) || eq.pesoBaseKg < 0) {
      mal('el equipo "' + clave + '" tiene un pesoBaseKg inválido');
    }
  }

  if (fallas === 0) bien(clavesEquipo.length + ' equipos definidos: ' + clavesEquipo.join(', '));
}

// ========================================================= ejercicios.json

titulo('ejercicios.json');

const ejercicios = leerJson('datos/ejercicios.json');
/** @type {Set<string>} */
const idsEjercicio = new Set();
const fallasAntesDeEjercicios = fallas;

if (ejercicios) {
  if (!Array.isArray(ejercicios)) {
    mal('ejercicios.json tiene que ser una lista, o sea empezar con [ y terminar con ]');
  } else {
    ejercicios.forEach((e, i) => {
      const donde = 'ejercicio ' + (i + 1) + (esTexto(e.id) ? ' ("' + e.id + '")' : '');
      if (!esTexto(e.id)) mal(donde + ' no tiene id');
      else if (idsEjercicio.has(e.id)) mal(donde + ' tiene un id repetido: cada ejercicio necesita uno propio');
      else idsEjercicio.add(e.id);

      if (!esTexto(e.nombre)) mal(donde + ' no tiene nombre');
      if (!esTexto(e.grupo)) mal(donde + ' no tiene grupo muscular');

      if (!esTexto(e.equipo)) {
        mal(donde + ' no tiene equipo');
      } else if (reglas && reglas.equipos && !reglas.equipos[e.equipo]) {
        mal(donde + ' usa el equipo "' + e.equipo + '", que no existe en reglas.json. ' +
            'Los que existen son: ' + Object.keys(reglas.equipos).join(', '));
      }
    });
    if (fallas === fallasAntesDeEjercicios) bien(idsEjercicio.size + ' ejercicios, todos con id propio');
  }
}

// ============================================================ rutinas.json

titulo('rutinas.json');

const rutinas = leerJson('datos/rutinas.json');

if (rutinas) {
  const fallasAntesDeRutinas = fallas;
  if (!Array.isArray(rutinas)) {
    mal('rutinas.json tiene que ser una lista');
  } else {
    const idsRutina = new Set();
    let totalEjercicios = 0;

    rutinas.forEach((r, i) => {
      const dondeR = 'rutina ' + (i + 1) + (esTexto(r.id) ? ' ("' + r.id + '")' : '');
      if (!esTexto(r.id)) mal(dondeR + ' no tiene id');
      else if (idsRutina.has(r.id)) mal(dondeR + ' tiene un id repetido');
      else idsRutina.add(r.id);

      if (!esTexto(r.nombre)) mal(dondeR + ' no tiene nombre');

      if (!Array.isArray(r.dias) || r.dias.length === 0) {
        mal(dondeR + ' no tiene días');
        return;
      }

      const idsDia = new Set();
      r.dias.forEach((d, j) => {
        const dondeD = dondeR + ', día ' + (j + 1) + (esTexto(d.nombre) ? ' ("' + d.nombre + '")' : '');
        if (!esTexto(d.id)) mal(dondeD + ' no tiene id');
        else if (idsDia.has(d.id)) mal(dondeD + ' repite el id de otro día de la misma rutina');
        else idsDia.add(d.id);

        if (!esTexto(d.nombre)) mal(dondeD + ' no tiene nombre');

        if (!Array.isArray(d.ejercicios) || d.ejercicios.length === 0) {
          mal(dondeD + ' no tiene ejercicios');
          return;
        }

        d.ejercicios.forEach((ep, k) => {
          const donde = dondeD + ', ejercicio ' + (k + 1) +
                        (esTexto(ep.ejercicioId) ? ' ("' + ep.ejercicioId + '")' : '');
          totalEjercicios++;

          if (!esTexto(ep.ejercicioId)) {
            mal(donde + ' no dice a qué ejercicio apunta');
          } else if (idsEjercicio.size && !idsEjercicio.has(ep.ejercicioId)) {
            mal(donde + ' apunta a un ejercicio que no está en ejercicios.json');
          }

          if (!Number.isInteger(ep.series) || ep.series < 1) mal(donde + ' tiene un número de series inválido');
          if (!Number.isInteger(ep.repsMin) || ep.repsMin < 1) mal(donde + ' tiene un repsMin inválido');
          if (!Number.isInteger(ep.repsMax) || ep.repsMax < 1) mal(donde + ' tiene un repsMax inválido');

          if (Number.isInteger(ep.repsMin) && Number.isInteger(ep.repsMax) && ep.repsMin > ep.repsMax) {
            mal(donde + ': repsMin (' + ep.repsMin + ') es mayor que repsMax (' + ep.repsMax + '). Están al revés.');
          }
          if (ep.repsMin === ep.repsMax) {
            mal(donde + ': repsMin y repsMax son iguales (' + ep.repsMin + '). ' +
                'Sin rango, el peso nunca sube. Poné un techo más alto que el piso.');
          }

          if (!esNumero(ep.descansoSeg) || ep.descansoSeg <= 0) mal(donde + ' tiene un descanso inválido');
          else if (ep.descansoSeg > 600) mal(donde + ' tiene un descanso de ' + ep.descansoSeg + ' s: parece un error');

          if (ep.pesoInicialKg !== null && (!esNumero(ep.pesoInicialKg) || ep.pesoInicialKg < 0)) {
            mal(donde + ' tiene un pesoInicialKg inválido (tiene que ser un número, o null si lo elige el usuario)');
          }

          // Un peso inicial que no se puede armar con ese equipo confunde desde el arranque.
          const ej = Array.isArray(ejercicios) ? ejercicios.find((x) => x.id === ep.ejercicioId) : null;
          const eq = ej && reglas && reglas.equipos ? reglas.equipos[ej.equipo] : null;
          if (eq && esNumero(ep.pesoInicialKg) && eq.incrementoMinimoKg > 0) {
            if (ep.pesoInicialKg < eq.pesoBaseKg) {
              mal(donde + ': el peso inicial ' + ep.pesoInicialKg + ' kg es menor que el piso de ' +
                  eq.nombre + ' (' + eq.pesoBaseKg + ' kg)');
            } else {
              const pasos = (ep.pesoInicialKg - eq.pesoBaseKg) / eq.incrementoMinimoKg;
              if (Math.abs(pasos - Math.round(pasos)) > 0.001) {
                mal(donde + ': ' + ep.pesoInicialKg + ' kg no se puede armar con ' + eq.nombre +
                    ', que sube de a ' + eq.incrementoMinimoKg + ' kg desde ' + eq.pesoBaseKg + ' kg');
              }
            }
          }
        });
      });
    });

    if (fallas === fallasAntesDeRutinas) bien(idsRutina.size + ' rutinas, ' + totalEjercicios + ' ejercicios planificados');
  }
}

// =================================================================== final

titulo('Resumen');
if (fallas === 0) {
  console.log('  Los datos están bien. Se puede publicar.\n');
} else {
  console.log('  \x1b[31m' + fallas + ' problema(s).\x1b[0m Arreglalos en la planilla y volvé a generar los JSON.\n');
}
process.exitCode = fallas ? 1 : 0;
