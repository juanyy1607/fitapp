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

/*
 * Se traduce la planilla con LA MISMA función que usa la app, no con una copia de las
 * reglas acá adentro.
 *
 * Es a propósito. Si el validador tradujera por su cuenta, podría dar todo bien sobre una
 * versión de los datos que la app nunca ve, y el error aparecería igual en el gimnasio.
 * Importando la función de verdad, lo que se valida es exactamente lo que la app carga.
 */
import { normalizarEjercicio, normalizarConcepto } from '../logica/catalogo.js';
import { equipoDeCarga } from '../logica/progresion.js';

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
 *
 * Esta lista es la que usa la planilla real del socio. Antes decía "piernas", "hombros" y
 * "brazos" en plural y en conjunto; el socio los carga en singular y separa bíceps de
 * tríceps, que para repartir volumen es más útil. Manda la planilla.
 */
const GRUPOS = [
  'pecho', 'espalda', 'hombro', 'bíceps', 'tríceps',
  'pierna', 'glúteos'
];

const MUSCULOS = GRUPOS.concat([
  'core', 'antebrazos', 'cuádriceps', 'isquiotibiales', 'gemelos',
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

  if (!esNumero(reglas.descansoPorDefectoSeg) || reglas.descansoPorDefectoSeg <= 0) {
    mal('descansoPorDefectoSeg tiene que ser un número de segundos mayor que cero');
  }
  if (!esNumero(reglas.descansoEntreEjerciciosSeg) || reglas.descansoEntreEjerciciosSeg <= 0) {
    mal('falta descansoEntreEjerciciosSeg: es el descanso al pasar de un ejercicio al siguiente');
  }

  /*
   * La sección "progresion" ya no existe.
   *
   * La regla que cerró el socio no tiene números que ajustar: los objetivos salen del
   * rango de repeticiones de cada ejercicio, y los kilos que se suben, del subirKg del
   * equipo o del ejercicio. Si alguien vuelve a pegar acá los parámetros viejos, se lo
   * decimos, porque no los va a leer nadie y se va a pensar que están haciendo algo.
   */
  if (reglas.progresion) {
    const muertos = ['bajarPorcentaje', 'sesionesFallidasParaBajar', 'multiplicadorSiFueFacil',
                     'saltoMaximoPorcentaje', 'subirPorcentaje'];
    const presentes = muertos.filter((k) => reglas.progresion[k] !== undefined);
    if (presentes.length) {
      mal('reglas.json tiene la sección progresion con ' + presentes.join(', ') + ', que ya no se usan. ' +
          'El deload automático y los botones de esfuerzo murieron con la regla vieja. Borrá la sección entera.');
    } else {
      ojo('reglas.json tiene una sección progresion vacía. Se puede borrar: la regla nueva no tiene números que ajustar.');
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

const ejerciciosCrudos = leerJson('datos/ejercicios.json');
/** Las fichas ya traducidas: exactamente lo que va a ver la app. */
let ejercicios = [];
const idsEjercicio = new Set();
const fallasAntesDeEjercicios = fallas;

if (ejerciciosCrudos) {
  if (!Array.isArray(ejerciciosCrudos)) {
    mal('ejercicios.json tiene que ser una lista, o sea empezar con [ y terminar con ]');
  } else {
    ejercicios = ejerciciosCrudos.map(normalizarEjercicio);

    // Primera pasada: los ids, para poder validar sustitutos después.
    for (const e of ejercicios) if (esTexto(e.id)) idsEjercicio.add(e.id);

    /** Cuántas fichas dejaron vacío cada campo pendiente. Se informa junto al final. */
    const pendientes = {};
    const contarPendiente = (campo) => { pendientes[campo] = (pendientes[campo] || 0) + 1; };
    const sinEquipo = [];

    ejercicios.forEach((e, i) => {
      const crudo = ejerciciosCrudos[i] || {};
      const donde = 'ejercicio ' + (i + 1) + (esTexto(e.id) ? ' ("' + e.id + '")' : '');

      // --- Lo que SÍ es obligatorio. Sin esto la app no puede mostrar la ficha.
      if (!esTexto(e.id)) mal(donde + ' no tiene id');
      if (!esTexto(e.nombre)) mal(donde + ' no tiene nombre');

      const repetidos = ejercicios.filter((x) => x.id === e.id);
      if (esTexto(e.id) && repetidos.length > 1 && repetidos[0] !== e) {
        mal(donde + ' tiene un id repetido: cada ejercicio necesita uno propio');
      }

      if (!esTexto(e.grupo)) {
        mal(donde + ' no tiene grupo muscular');
      } else if (!GRUPOS.includes(e.grupo)) {
        mal(donde + ' tiene grupo "' + e.grupo + '", que no está en la lista. ' +
            'Los válidos son: ' + GRUPOS.join(', ') + '. ' +
            '(Escribir el mismo grupo de dos formas distintas hace que el armador reparta mal el volumen.)');
      }

      /*
       * Las casillas: en la planilla se escriben "si" o "no". Cualquier otra cosa es un
       * error de tipeo que hay que ver, porque silenciosamente cuenta como "no".
       * Vacío sí se acepta: quiere decir que no aplica.
       */
      for (const col of ['es_unilateral', 'es_peso_corporal', 'admite_lastre', 'admite_asistencia']) {
        const v = crudo[col];
        if (v === undefined || v === '' || typeof v === 'boolean') continue;
        const n = String(v).trim().toLowerCase();
        if (n !== '' && !['si', 'sí', 'no', 'x', 'true', 'false', '1', '0'].includes(n)) {
          mal(donde + ': la casilla ' + col + ' dice "' + v + '". Tiene que decir "si" o "no". ' +
              'Cualquier otra cosa cuenta como "no" sin avisar.');
        }
      }

      /*
       * El equipo puede estar vacío: hay ejercicios que el socio todavía no clasificó.
       * No es un error, pero sí algo que tiene que ver, porque la app va a suponer saltos
       * de 1 kg hasta que lo complete.
       */
      if (!esTexto(e.equipo)) {
        sinEquipo.push(e.id);
      } else if (reglas && reglas.equipos && !reglas.equipos[e.equipo]) {
        mal(donde + ' usa el equipo "' + e.equipo + '", que no existe en reglas.json. ' +
            'Los que existen son: ' + Object.keys(reglas.equipos).join(', '));
      }

      // --- Campos que el socio completa después. Vacío NO es un error: es "todavía no".
      if (e.subBloque === undefined) contarPendiente('sub_bloque');
      if (e.nivel === undefined) contarPendiente('nivel');
      if (e.descansoSeg === undefined) contarPendiente('descanso_seg');
      if (e.subirKg === undefined) contarPendiente('subir_kg');
      if (e.sustitutos === undefined) contarPendiente('sustitutos');
      if (e.musculosSecundarios === undefined) contarPendiente('musculos_secundarios');
      if (e.tecnica === undefined) contarPendiente('tecnica');
      if (e.erroresComunes === undefined) contarPendiente('errores_comunes');
      if (e.video === undefined) contarPendiente('video');

      // --- Y lo que está cargado, tiene que estar bien cargado.
      if (e.nivel !== undefined && !NIVELES.includes(e.nivel)) {
        mal(donde + ' tiene nivel "' + e.nivel + '". Tiene que ser uno de: ' + NIVELES.join(', '));
      }

      if (e.musculosSecundarios !== undefined) {
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

      if (e.sustitutos !== undefined) {
        for (const s of e.sustitutos) {
          if (!idsEjercicio.has(s)) mal(donde + ' tiene como sustituto a "' + s + '", que no existe en la planilla');
          if (s === e.id) mal(donde + ' se tiene a sí mismo como sustituto');
        }
      }

      if (e.descansoSeg !== undefined && (e.descansoSeg <= 0 || e.descansoSeg > 600)) {
        mal(donde + ' tiene un descanso de ' + e.descansoSeg + ' s: tiene que ser un número entre 1 y 600');
      }

      /*
       * El video se abre en YouTube, afuera de la app. Por eso tiene que ser un link
       * http(s) de verdad: si alguien pega el título del video o un id suelto, la app
       * abriría una pestaña rota en el gimnasio.
       */
      if (e.video !== undefined && !/^https?:\/\//i.test(e.video)) {
        mal(donde + ' tiene un video que no es un link: "' + e.video + '". ' +
            'Tiene que empezar con https:// (pegá la dirección completa de YouTube).');
      }

      // Un solo número no puede significar "kilos agregados" y "kilos de ayuda" a la vez.
      if (e.admiteLastre && e.admiteAsistencia) {
        mal(donde + ' tiene marcadas lastre Y asistencia. Un solo número no puede querer decir ' +
            '"kilos que agrego" y "kilos de ayuda" al mismo tiempo. Elegí una, o hacé dos ejercicios distintos.');
      }
      if ((e.admiteLastre || e.admiteAsistencia) && !e.esPesoCorporal) {
        ojo(donde + ' tiene lastre o asistencia pero no está marcado como peso corporal. Revisalo.');
      }

      /*
       * `subir_kg` del ejercicio: de a cuántos kilos sube ESTE ejercicio, pisando el del
       * equipo. Existe porque el press militar progresa mucho más lento que la sentadilla
       * aunque los dos usen barra.
       *
       * Lo que más importa revisar acá es que el número sea ARMABLE con el equipo. Un
       * subir_kg de 1 kg en una barra que salta de a 2,5 no hace nada: el redondeo se lo
       * come y el socio va a creer que está regulando algo que no se mueve. Es el mismo
       * error que ya nos pasó con el porcentaje de subida.
       */
      if (e.subirKg !== undefined) {
        const eq = equipoDeCarga(e, reglas || { equipos: {} });
        if (e.subirKg <= 0) {
          mal(donde + ' tiene subir_kg en ' + e.subirKg + '. Si querés que mande el equipo, dejá la celda vacía.');
        } else if (eq && eq.incrementoMinimoKg > 0 && e.subirKg < eq.incrementoMinimoKg) {
          mal(donde + ' tiene subir_kg de ' + e.subirKg + ' kg, pero ' + eq.nombre + ' salta de a ' +
              eq.incrementoMinimoKg + ' kg como mínimo. El redondeo se lo come y el número no hace nada.');
        } else if (eq && eq.incrementoMinimoKg > 0) {
          const pasos = e.subirKg / eq.incrementoMinimoKg;
          if (Math.abs(pasos - Math.round(pasos)) > 0.001) {
            ojo(donde + ' tiene subir_kg de ' + e.subirKg + ' kg, que no es un múltiplo de los ' +
                eq.incrementoMinimoKg + ' kg de ' + eq.nombre + ': el salto real va a ser el escalón más cercano');
          }
        }
      }

      /*
       * El peso inicial murió: el socio fue explícito en que la app NO recomienda con
       * cuánto arrancar. El usuario prueba en el gimnasio y anota lo que usó. Si quedó una
       * columna vieja en la planilla, avisamos, porque no la lee nadie.
       */
      if (crudo.peso_inicial_kg !== undefined && String(crudo.peso_inicial_kg).trim() !== '') {
        ojo(donde + ' todavía tiene peso_inicial_kg cargado. La app ya no recomienda peso de arranque: ' +
            'esa columna se ignora y se puede borrar de la planilla.');
      }
    });

    /*
     * Los sub-bloques son los pools de ejercicios equivalentes. Todavía no se usan para
     * nada, así que acá no se valida nada de ellos: solo se listan, para que el socio vea
     * cómo quedaron agrupados y pueda corregir un nombre escrito de dos formas.
     */
    const porSubBloque = new Map();
    for (const e of ejercicios) {
      if (!e.subBloque) continue;
      porSubBloque.set(e.subBloque, (porSubBloque.get(e.subBloque) || 0) + 1);
    }

    if (fallas === fallasAntesDeEjercicios) {
      bien(idsEjercicio.size + ' ejercicios, todos con id propio');
      bien(porSubBloque.size + ' sub-bloques (pools de ejercicios equivalentes, todavía sin usar)');
    }

    if (sinEquipo.length) {
      ojo(sinEquipo.length + ' ejercicio(s) sin equipo cargado. La app les va a suponer saltos de 1 kg ' +
          'hasta que se complete la columna: ' + sinEquipo.join(', '));
    }

    /*
     * Los campos que el socio completa después se cuentan y se informan juntos, una sola
     * vez. Antes cada celda vacía era un error y la corrida escupía cientos de renglones,
     * que es lo mismo que no decir nada: nadie los lee y se pierden los errores de verdad.
     */
    const listaPendientes = Object.keys(pendientes).sort();
    if (listaPendientes.length) {
      ojo('Campos que faltan completar (no es un error, los carga el socio después):');
      for (const campo of listaPendientes) {
        console.log('          ' + campo.padEnd(22) + pendientes[campo] + ' de ' + ejercicios.length + ' ejercicios');
      }
    }
  }
}

// ========================================================== conceptos.json

titulo('conceptos.json');

const conceptosCrudos = leerJson('datos/conceptos.json');
const fallasAntesDeConceptos = fallas;

if (conceptosCrudos) {
  if (!Array.isArray(conceptosCrudos)) {
    mal('conceptos.json tiene que ser una lista');
  } else {
    const conceptos = conceptosCrudos.map(normalizarConcepto);
    const idsConcepto = new Set();
    let sinTexto = 0;

    conceptos.forEach((c, i) => {
      const donde = 'concepto ' + (i + 1) + (esTexto(c.id) ? ' ("' + c.id + '")' : '');

      if (!esTexto(c.id)) mal(donde + ' no tiene id');
      else if (idsConcepto.has(c.id)) mal(donde + ' tiene un id repetido');
      else idsConcepto.add(c.id);

      if (!esTexto(c.titulo)) mal(donde + ' no tiene título');

      if (c.video !== undefined && !/^https?:\/\//i.test(c.video)) {
        mal(donde + ' tiene un video que no es un link: "' + c.video + '"');
      }
      if (c.video === undefined) ojo(donde + ' no tiene video ni texto para mostrar');

      // El texto explicativo lo escribe el socio. Vacío es lo esperado por ahora.
      if (c.texto === undefined) sinTexto++;
    });

    if (fallas === fallasAntesDeConceptos) bien(idsConcepto.size + ' conceptos, todos con id propio');
    if (sinTexto) {
      ojo(sinTexto + ' de ' + conceptos.length + ' conceptos están solo con el video, sin texto escrito ' +
          '(no es un error: el texto lo escribe el socio)');
    }
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

          const ficha = ejercicios.find((x) => x.id === ep.ejercicioId) || null;

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

          // La app ya no recomienda peso de arranque, así que una rutina tampoco lo pisa.
          if (ep.pesoInicialKg !== undefined && ep.pesoInicialKg !== null) {
            ojo(donde + ' tiene pesoInicialKg. Ya no se usa: la app no recomienda peso de arranque, ' +
                'el usuario anota el que haya usado. Se puede borrar.');
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
