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
let avisos = 0;
const mal = (m) => { fallas++; console.log('  \x1b[31mERROR\x1b[0m ' + m); };
const ojo = (m) => { avisos++; console.log('  \x1b[33mAVISO\x1b[0m ' + m); };
const bien = (m) => console.log('  \x1b[32mOK\x1b[0m    ' + m);
const titulo = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

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
const esLista = (v) => Array.isArray(v);
const NIVELES = ['principiante', 'intermedio', 'avanzado'];

/*
 * Listas cerradas de grupos y músculos.
 *
 * Tienen que ser cerradas porque el armador de rutinas va a agrupar por estos valores. Si
 * una fila dice "pecho" y otra "Pectoral", para la app son dos grupos distintos y el
 * armador reparte mal el volumen sin que nadie vea un error. Si hace falta un valor nuevo,
 * se agrega acá a propósito, no escribiéndolo distinto en una celda.
 */
const GRUPOS = [
  'pecho', 'espalda', 'piernas', 'hombros', 'brazos', 'core',
  'glúteos', 'pantorrillas', 'cuerpo-completo'
];

const MUSCULOS = GRUPOS.concat([
  'tríceps', 'bíceps', 'antebrazos', 'cuádriceps', 'isquiotibiales',
  'dorsales', 'trapecio', 'lumbares', 'abductores', 'aductores'
]);

/**
 * ¿Ese peso se puede armar de verdad con ese equipo?
 * Una barra olímpica sube de a 2,5 kg desde 20, así que 21 kg no existe.
 */
function cargaPosible(pesoKg, eq) {
  if (!eq || !eq.incrementoMinimoKg || eq.incrementoMinimoKg <= 0) return { ok: true };
  if (pesoKg < eq.pesoBaseKg) {
    return { ok: false, motivo: 'es menor que el piso de ' + eq.nombre + ' (' + eq.pesoBaseKg + ' kg)' };
  }
  const pasos = (pesoKg - eq.pesoBaseKg) / eq.incrementoMinimoKg;
  if (Math.abs(pasos - Math.round(pasos)) > 0.001) {
    return {
      ok: false,
      motivo: 'no se puede armar con ' + eq.nombre + ', que sube de a ' + eq.incrementoMinimoKg +
              ' kg desde ' + eq.pesoBaseKg + ' kg'
    };
  }
  return { ok: true };
}

// ============================================================ reglas.json

titulo('reglas.json');

const reglas = leerJson('datos/reglas.json');
const fallasAntesDeReglas = fallas;

if (reglas) {
  if (reglas.provisorio) {
    ojo('los números de reglas.json están marcados como PROVISORIOS: el socio todavía no los confirmó');
  }

  /*
   * Los desacuerdos abiertos se gritan en cada corrida.
   *
   * La razón es una sola: que ninguna decisión de entrenamiento quede cambiada por atrás.
   * Si lo que está implementado no coincide con lo que respondió el socio, tiene que
   * saltar a la vista cada vez que alguien toca los datos, no quedar escondido en un
   * comentario que nadie lee.
   */
  if (Array.isArray(reglas.conflictos) && reglas.conflictos.length) {
    console.log('');
    for (const c of reglas.conflictos) {
      ojo('\x1b[1mCONFLICTO SIN RESOLVER en ' + c.clave + '\x1b[0m');
      console.log('          socio dice     : ' + c.postura_socio);
      console.log('          Juan dice      : ' + c.postura_juan);
      console.log('          implementado   : ' + c.implementado);
      if (c.nota) console.log('          nota           : ' + c.nota);
    }
    console.log('');
  }

  // El porcentaje de subida se sacó a propósito: con 2,5% sobre 60 kg el salto daba 1,5 kg,
  // menos que el disco más chico, así que el redondeo se lo comía y el parámetro no hacía
  // nada hasta los 100 kg. Si alguien lo vuelve a poner, avisamos.
  if (reglas.progresion && reglas.progresion.subirPorcentaje !== undefined) {
    mal('progresion.subirPorcentaje ya no se usa: la subida ahora va en kilos absolutos, ' +
        'en la columna subirKg de cada equipo. Un porcentaje no hacía nada por debajo de los 100 kg.');
  }

  if (!esNumero(reglas.descansoPorDefectoSeg) || reglas.descansoPorDefectoSeg <= 0) {
    mal('descansoPorDefectoSeg tiene que ser un número de segundos mayor que cero');
  }
  if (!esNumero(reglas.descansoEntreEjerciciosSeg) || reglas.descansoEntreEjerciciosSeg <= 0) {
    mal('falta descansoEntreEjerciciosSeg: es el descanso al pasar de un ejercicio al siguiente');
  }

  const p = reglas.progresion || {};
  if (!esNumero(p.bajarPorcentaje) || p.bajarPorcentaje <= 0) mal('progresion.bajarPorcentaje tiene que ser mayor que cero');
  if (!Number.isInteger(p.sesionesFallidasParaBajar) || p.sesionesFallidasParaBajar < 1) {
    mal('progresion.sesionesFallidasParaBajar tiene que ser un número entero de 1 para arriba');
  }

  if (p.saltoMaximoPorcentaje !== undefined) {
    if (!esNumero(p.saltoMaximoPorcentaje) || p.saltoMaximoPorcentaje <= 0) {
      mal('progresion.saltoMaximoPorcentaje tiene que ser un porcentaje mayor que cero');
    } else if (p.saltoMaximoPorcentaje < 5) {
      ojo('progresion.saltoMaximoPorcentaje es ' + p.saltoMaximoPorcentaje +
          '%: tan bajo, el salto doble no se va a aplicar casi nunca');
    }
  }

  // Cuánto se agranda el salto cuando el usuario marca "Fácil". 1 = el botón no hace nada.
  if (p.multiplicadorSiFueFacil !== undefined) {
    if (!esNumero(p.multiplicadorSiFueFacil) || p.multiplicadorSiFueFacil < 1) {
      mal('progresion.multiplicadorSiFueFacil tiene que ser 1 o más. Con 1, el botón "Fácil" no cambia nada.');
    } else if (p.multiplicadorSiFueFacil > 3) {
      ojo('progresion.multiplicadorSiFueFacil es ' + p.multiplicadorSiFueFacil +
          ': un salto tan grande de golpe puede ser peligroso para un principiante');
    }
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
    if (!esNumero(eq.pesoBaseKg) || eq.pesoBaseKg < 0) mal('el equipo "' + clave + '" tiene un pesoBaseKg inválido');

    if (!esNumero(eq.subirKg) || eq.subirKg < 0) {
      mal('al equipo "' + clave + '" le falta subirKg (cuántos kilos sumar al completar el rango)');
    } else if (eq.incrementoMinimoKg > 0 && eq.subirKg > 0 && eq.subirKg < eq.incrementoMinimoKg) {
      ojo('el equipo "' + clave + '" tiene subirKg (' + eq.subirKg + ') menor que su incremento mínimo (' +
          eq.incrementoMinimoKg + '): el redondeo lo va a llevar igual a un escalón entero');
    }
  }

  if (fallas === fallasAntesDeReglas) bien(clavesEquipo.length + ' equipos: ' + clavesEquipo.join(', '));
}

// ========================================================= ejercicios.json

titulo('ejercicios.json');

const ejercicios = leerJson('datos/ejercicios.json');
const idsEjercicio = new Set();
const fallasAntesDeEjercicios = fallas;

if (ejercicios) {
  if (!Array.isArray(ejercicios)) {
    mal('ejercicios.json tiene que ser una lista, o sea empezar con [ y terminar con ]');
  } else {
    // Primera pasada: los ids, para poder validar sustitutos después.
    for (const e of ejercicios) if (esTexto(e.id)) idsEjercicio.add(e.id);

    ejercicios.forEach((e, i) => {
      const donde = 'ejercicio ' + (i + 1) + (esTexto(e.id) ? ' ("' + e.id + '")' : '');

      if (!esTexto(e.id)) mal(donde + ' no tiene id');
      if (!esTexto(e.nombre)) mal(donde + ' no tiene nombre');
      if (!esTexto(e.grupo)) {
        mal(donde + ' no tiene grupo muscular');
      } else if (!GRUPOS.includes(e.grupo)) {
        mal(donde + ' tiene grupo "' + e.grupo + '", que no está en la lista. ' +
            'Los válidos son: ' + GRUPOS.join(', ') + '. ' +
            '(Escribir el mismo grupo de dos formas distintas hace que el armador reparta mal el volumen.)');
      }

      const repetidos = ejercicios.filter((x) => x.id === e.id);
      if (esTexto(e.id) && repetidos.length > 1 && repetidos[0] !== e) {
        mal(donde + ' tiene un id repetido: cada ejercicio necesita uno propio');
      }

      let eq = null;
      if (!esTexto(e.equipo)) {
        mal(donde + ' no tiene equipo');
      } else if (reglas && reglas.equipos && !reglas.equipos[e.equipo]) {
        mal(donde + ' usa el equipo "' + e.equipo + '", que no existe en reglas.json. ' +
            'Los que existen son: ' + Object.keys(reglas.equipos).join(', '));
      } else if (reglas && reglas.equipos) {
        eq = reglas.equipos[e.equipo];
      }

      if (e.nivel !== undefined && !NIVELES.includes(e.nivel)) {
        mal(donde + ' tiene nivel "' + e.nivel + '". Tiene que ser uno de: ' + NIVELES.join(', '));
      }

      if (e.musculosSecundarios !== undefined) {
        if (!esLista(e.musculosSecundarios)) {
          mal(donde + ': musculosSecundarios tiene que ser una lista (en la planilla, separados por coma)');
        } else {
          for (const m of e.musculosSecundarios) {
            if (!MUSCULOS.includes(m)) {
              mal(donde + ' tiene el músculo secundario "' + m + '", que no está en la lista. ' +
                  'Los válidos son: ' + MUSCULOS.join(', '));
            }
          }
          if (e.musculosSecundarios.includes(e.grupo)) {
            ojo(donde + ' repite "' + e.grupo + '" como músculo secundario, y ya es su grupo principal');
          }
        }
      }

      if (e.sustitutos !== undefined) {
        if (!esLista(e.sustitutos)) {
          mal(donde + ': sustitutos tiene que ser una lista');
        } else {
          for (const s of e.sustitutos) {
            if (!idsEjercicio.has(s)) mal(donde + ' tiene como sustituto a "' + s + '", que no existe en la planilla');
            if (s === e.id) mal(donde + ' se tiene a sí mismo como sustituto');
          }
        }
      }

      // Un solo número no puede significar "kilos agregados" y "kilos de ayuda" a la vez.
      if (e.admiteLastre && e.admiteAsistencia) {
        mal(donde + ' tiene marcadas lastre Y asistencia. Un solo número no puede querer decir ' +
            '"kilos que agrego" y "kilos de ayuda" al mismo tiempo. Elegí una, o hacé dos ejercicios distintos.');
      }
      if ((e.admiteLastre || e.admiteAsistencia) && !e.esPesoCorporal) {
        ojo(donde + ' tiene lastre o asistencia pero no está marcado como peso corporal. Revisalo.');
      }

      // El peso inicial vive acá, así que acá se revisa que exista de verdad.
      if (e.pesoInicialKg !== null && e.pesoInicialKg !== undefined) {
        if (!esNumero(e.pesoInicialKg) || e.pesoInicialKg < 0) {
          mal(donde + ' tiene un pesoInicialKg inválido (un número, o vacío si lo elige el usuario)');
        } else if (eq && !e.admiteAsistencia) {
          const r = cargaPosible(e.pesoInicialKg, eq);
          if (!r.ok) mal(donde + ': el peso inicial ' + e.pesoInicialKg + ' kg ' + r.motivo);
        }
      }
    });

    if (fallas === fallasAntesDeEjercicios) bien(idsEjercicio.size + ' ejercicios, todos con id propio');
  }
}

// ============================================================ rutinas.json

titulo('rutinas.json');

const rutinas = leerJson('datos/rutinas.json');
const fallasAntesDeRutinas = fallas;

if (rutinas) {
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

      if (!Array.isArray(r.dias) || r.dias.length === 0) { mal(dondeR + ' no tiene días'); return; }

      const idsDia = new Set();
      r.dias.forEach((d, j) => {
        const dondeD = dondeR + ', día ' + (j + 1) + (esTexto(d.nombre) ? ' ("' + d.nombre + '")' : '');
        if (!esTexto(d.id)) mal(dondeD + ' no tiene id');
        else if (idsDia.has(d.id)) mal(dondeD + ' repite el id de otro día de la misma rutina');
        else idsDia.add(d.id);

        if (!esTexto(d.nombre)) mal(dondeD + ' no tiene nombre');
        if (!Array.isArray(d.ejercicios) || d.ejercicios.length === 0) { mal(dondeD + ' no tiene ejercicios'); return; }

        d.ejercicios.forEach((ep, k) => {
          const donde = dondeD + ', ejercicio ' + (k + 1) +
                        (esTexto(ep.ejercicioId) ? ' ("' + ep.ejercicioId + '")' : '');
          totalEjercicios++;

          const ficha = Array.isArray(ejercicios) ? ejercicios.find((x) => x.id === ep.ejercicioId) : null;

          if (!esTexto(ep.ejercicioId)) mal(donde + ' no dice a qué ejercicio apunta');
          else if (idsEjercicio.size && !ficha) mal(donde + ' apunta a un ejercicio que no está en ejercicios.json');

          if (!Number.isInteger(ep.series) || ep.series < 1) mal(donde + ' tiene un número de series inválido');
          if (!Number.isInteger(ep.repsMin) || ep.repsMin < 1) mal(donde + ' tiene un repsMin inválido');
          if (!Number.isInteger(ep.repsMax) || ep.repsMax < 1) mal(donde + ' tiene un repsMax inválido');

          if (Number.isInteger(ep.repsMin) && Number.isInteger(ep.repsMax)) {
            if (ep.repsMin > ep.repsMax) {
              mal(donde + ': repsMin (' + ep.repsMin + ') es mayor que repsMax (' + ep.repsMax + '). Están al revés.');
            } else if (ep.repsMin === ep.repsMax) {
              mal(donde + ': repsMin y repsMax son iguales (' + ep.repsMin + '). ' +
                  'Sin rango, el peso nunca sube. Poné un techo más alto que el piso.');
            }
          }

          if (!esNumero(ep.descansoSeg) || ep.descansoSeg <= 0) mal(donde + ' tiene un descanso entre series inválido');
          else if (ep.descansoSeg > 600) mal(donde + ' tiene un descanso de ' + ep.descansoSeg + ' s: parece un error');

          if (ep.descansoDespuesSeg !== undefined &&
              (!esNumero(ep.descansoDespuesSeg) || ep.descansoDespuesSeg <= 0 || ep.descansoDespuesSeg > 900)) {
            mal(donde + ' tiene un descansoDespuesSeg inválido');
          }

          // El peso inicial vive en ejercicios.json. Acá solo puede haber una excepción,
          // y si la hay tiene que ser una carga que exista.
          if (ep.pesoInicialKg !== undefined && ep.pesoInicialKg !== null) {
            const eq = ficha && reglas && reglas.equipos ? reglas.equipos[ficha.equipo] : null;
            if (!esNumero(ep.pesoInicialKg) || ep.pesoInicialKg < 0) {
              mal(donde + ' tiene un pesoInicialKg inválido');
            } else if (eq && !(ficha && ficha.admiteAsistencia)) {
              const res = cargaPosible(ep.pesoInicialKg, eq);
              if (!res.ok) mal(donde + ': el peso inicial ' + ep.pesoInicialKg + ' kg ' + res.motivo);
            }
            if (ficha && ep.pesoInicialKg === ficha.pesoInicialKg) {
              ojo(donde + ' repite el mismo pesoInicialKg que ya tiene el ejercicio. Sacalo de la rutina ' +
                  'para que el valor viva en un solo lugar.');
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
  console.log('  Los datos están bien' + (avisos ? ' (' + avisos + ' aviso(s) para mirar)' : '') + '. Se puede publicar.\n');
} else {
  console.log('  \x1b[31m' + fallas + ' problema(s).\x1b[0m Arreglalos en la planilla y volvé a generar los JSON.\n');
}
process.exitCode = fallas ? 1 : 0;
