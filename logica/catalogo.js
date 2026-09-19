// @ts-check
/**
 * logica/catalogo.js — Carga los archivos de datos/ y los deja listos para usar.
 *
 * Todas las rutas son relativas ('datos/…', nunca '/datos/…'). Eso no es un detalle de
 * estilo: es lo que permite que mañana esto ande empaquetado con Capacitor, y también que
 * funcione publicado en una subcarpeta como /fitapp/.
 *
 * Si un archivo está mal, explota acá con un mensaje que se entiende, en vez de dejar que
 * el error aparezca tres pantallas más adelante como "undefined".
 *
 * ------------------------------------------------------------------------------------
 * ACÁ SE TRADUCE LA PLANILLA. Es la única parte del código que sabe cómo viene el Excel.
 *
 * Los JSON salen de la planilla del socio y vienen como sale una planilla: nombres de
 * columna con guión bajo (`es_unilateral`), casillas escritas "si" o "no" en vez de
 * verdadero/falso, listas escritas con comas dentro de una celda, y celdas vacías como
 * texto vacío ("") en vez de faltar.
 *
 * El resto de la app no trabaja así, y no tiene por qué: usa `esUnilateral` con un
 * booleano de verdad. La traducción pasa una sola vez, acá, al cargar. Si mañana el socio
 * agrega una columna o le cambia el nombre, se toca este archivo y nada más.
 *
 * Una celda vacía NO es un error: son los campos que el socio todavía no completó
 * (descanso, sustitutos, nivel, técnica). Vacío significa "no lo sé todavía", y se traduce
 * a `undefined` para que el resto del código use su valor por defecto.
 */

/** @typedef {import('../tipos.js').Ejercicio} Ejercicio */
/** @typedef {import('../tipos.js').Concepto} Concepto */
/** @typedef {import('../tipos.js').Rutina} Rutina */
/** @typedef {import('../tipos.js').Reglas} Reglas */
/** @typedef {import('../tipos.js').EjercicioPlanificado} EjercicioPlanificado */

/**
 * @typedef {Object} Catalogo
 * @property {Reglas} reglas
 * @property {Ejercicio[]} ejercicios
 * @property {Concepto[]} conceptos
 * @property {Rutina[]} rutinas
 * @property {Map<string, Ejercicio>} ejercicioPorId
 * @property {Map<string, Concepto>} conceptoPorId
 * @property {Map<string, Rutina>} rutinaPorId
 * @property {Map<string, Ejercicio[]>} porSubBloque  Los pools de ejercicios equivalentes.
 */

// ============================================================ traducir la planilla

/**
 * Una celda de texto. Si está vacía, devuelve `undefined` en vez de "".
 *
 * La diferencia importa: "" es un valor que el resto del código tendría que acordarse de
 * chequear en cada uso, y tarde o temprano alguien se olvida y muestra un renglón vacío.
 * `undefined` hace que `||` y los valores por defecto funcionen solos.
 * @param {unknown} v
 * @returns {string|undefined}
 */
function texto(v) {
  if (typeof v !== 'string') return undefined;
  const limpio = v.trim();
  return limpio.length ? limpio : undefined;
}

/**
 * Una casilla de la planilla: "si" es verdadero, cualquier otra cosa es falso.
 *
 * Acepta también true/false por si algún día el JSON viene generado con booleanos de
 * verdad, y acepta "sí" con tilde porque tarde o temprano alguien la va a escribir.
 * @param {unknown} v
 * @returns {boolean}
 */
function casilla(v) {
  if (typeof v === 'boolean') return v;
  const t = texto(v);
  if (!t) return false;
  const n = t.toLowerCase();
  return n === 'si' || n === 'sí' || n === 'x' || n === 'true' || n === '1';
}

/**
 * Una celda con varios valores separados por coma → una lista.
 *
 * Celda vacía → `undefined`, no una lista vacía: "no lo cargó" y "lo cargó vacío" son lo
 * mismo para nosotros, y así el campo desaparece en vez de quedar como [].
 * @param {unknown} v
 * @returns {string[]|undefined}
 */
function lista(v) {
  if (Array.isArray(v)) return v.length ? v.map(String) : undefined;
  const t = texto(v);
  if (!t) return undefined;
  const partes = t.split(',').map((x) => x.trim()).filter(Boolean);
  return partes.length ? partes : undefined;
}

/**
 * Una celda numérica. Vacía o no numérica → `undefined`.
 * @param {unknown} v
 * @returns {number|undefined}
 */
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const t = texto(v);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Saca de un objeto las claves que quedaron en `undefined`.
 *
 * Es para que una ficha sin datos opcionales se vea igual de limpia en la consola que en
 * la planilla, en vez de un muro de `nivel: undefined`.
 * @template {Record<string, any>} T
 * @param {T} obj
 * @returns {T}
 */
function sinVacios(obj) {
  for (const clave of Object.keys(obj)) {
    if (obj[clave] === undefined) delete obj[clave];
  }
  return obj;
}

/**
 * Lee una columna aceptando los dos nombres posibles: el de la planilla (`es_unilateral`)
 * y el de adentro del código (`esUnilateral`).
 *
 * Los dos porque los archivos de prueba viejos están escritos a la segunda forma, y no
 * tiene sentido romperlos por un guión bajo.
 * @param {Record<string, any>} fila
 * @param {string} conGuion
 * @param {string} enCamello
 * @returns {any}
 */
function columna(fila, conGuion, enCamello) {
  return fila[conGuion] !== undefined ? fila[conGuion] : fila[enCamello];
}

/**
 * Una fila de la planilla de ejercicios → la ficha que usa la app.
 *
 * Se exporta porque los tests la necesitan: tienen que poder probar contra los datos
 * reales del socio sin duplicar acá adentro las reglas de traducción.
 * @param {Record<string, any>} fila
 * @returns {Ejercicio}
 */
export function normalizarEjercicio(fila) {
  return sinVacios(/** @type {Ejercicio} */ ({
    id: texto(fila.id) || '',
    nombre: texto(fila.nombre) || '',
    nombreAlternativo: texto(columna(fila, 'nombre_alternativo', 'nombreAlternativo')),
    grupo: texto(fila.grupo) || '',

    /*
     * El sub-bloque es el pool de ejercicios equivalentes: todos los que sirven para lo
     * mismo y se pueden cambiar uno por otro (todas las variantes de sentadilla, todas
     * las de hip thrust). Todavía no se usa para nada. Se guarda ahora porque es el dato
     * que van a necesitar el armador de rutinas y el botón de "la máquina está ocupada".
     */
    subBloque: texto(columna(fila, 'sub_bloque', 'subBloque')),

    equipo: texto(fila.equipo) || '',
    esUnilateral: casilla(columna(fila, 'es_unilateral', 'esUnilateral')),
    esPesoCorporal: casilla(columna(fila, 'es_peso_corporal', 'esPesoCorporal')),
    admiteLastre: casilla(columna(fila, 'admite_lastre', 'admiteLastre')),
    admiteAsistencia: casilla(columna(fila, 'admite_asistencia', 'admiteAsistencia')),
    musculosSecundarios: lista(columna(fila, 'musculos_secundarios', 'musculosSecundarios')),
    nivel: /** @type {any} */ (texto(fila.nivel)),
    sustitutos: lista(fila.sustitutos),
    descansoSeg: numero(columna(fila, 'descanso_seg', 'descansoSeg')),
    pesoInicialKg: numero(columna(fila, 'peso_inicial_kg', 'pesoInicialKg')),
    tecnica: texto(fila.tecnica),
    erroresComunes: texto(columna(fila, 'errores_comunes', 'erroresComunes')),
    video: texto(fila.video),
    imagen: texto(fila.imagen),
    notas: texto(fila.notas)
  }));
}

/**
 * Una fila de la planilla de conceptos ("qué es el RIR", "qué es un drop set") → la ficha
 * que usa la app. Por ahora son título y video; el texto explicativo lo escribe el socio.
 * @param {Record<string, any>} fila
 * @returns {Concepto}
 */
export function normalizarConcepto(fila) {
  return sinVacios(/** @type {Concepto} */ ({
    id: texto(fila.id) || '',
    titulo: texto(fila.titulo) || '',
    video: texto(fila.video),
    texto: texto(fila.texto)
  }));
}

// ==================================================================== cargar

/**
 * @param {string} ruta
 * @returns {Promise<any>}
 */
async function traer(ruta) {
  let respuesta;
  try {
    respuesta = await fetch(ruta);
  } catch (e) {
    throw new Error('No se pudo leer ' + ruta + '. Si es la primera vez que abrís la app, ' +
                    'necesitás conexión una vez para que se guarde.');
  }
  if (!respuesta.ok) throw new Error('Falta el archivo ' + ruta + ' (respondió ' + respuesta.status + ').');
  try {
    return await respuesta.json();
  } catch (e) {
    throw new Error(ruta + ' no es un JSON válido. Corré "node tools/validar-datos.mjs" para ver qué está mal.');
  }
}

/**
 * Agrupa los ejercicios por sub-bloque.
 *
 * El sub-bloque junta los ejercicios que sirven para lo mismo. Todavía no se usa: esto
 * arma el índice y lo deja disponible, nada más. Cuando exista el armador de rutinas va
 * a pedir "dame los del sub-bloque sentadillas" y ya va a estar.
 * @param {Ejercicio[]} ejercicios
 * @returns {Map<string, Ejercicio[]>}
 */
function agruparPorSubBloque(ejercicios) {
  /** @type {Map<string, Ejercicio[]>} */
  const mapa = new Map();
  for (const e of ejercicios) {
    if (!e.subBloque) continue;
    const grupo = mapa.get(e.subBloque);
    if (grupo) grupo.push(e);
    else mapa.set(e.subBloque, [e]);
  }
  return mapa;
}

/**
 * Carga los archivos de datos y arma los índices para buscar rápido.
 * @returns {Promise<Catalogo>}
 */
export async function cargarCatalogo() {
  const [reglas, ejerciciosCrudos, conceptosCrudos, rutinas] = await Promise.all([
    traer('datos/reglas.json'),
    traer('datos/ejercicios.json'),
    traer('datos/conceptos.json'),
    traer('datos/rutinas.json')
  ]);

  if (!Array.isArray(ejerciciosCrudos)) throw new Error('datos/ejercicios.json tendría que ser una lista.');
  if (!Array.isArray(conceptosCrudos)) throw new Error('datos/conceptos.json tendría que ser una lista.');
  if (!Array.isArray(rutinas)) throw new Error('datos/rutinas.json tendría que ser una lista.');
  if (!reglas || !reglas.equipos) throw new Error('datos/reglas.json no tiene la sección "equipos".');

  const ejercicios = ejerciciosCrudos.map(normalizarEjercicio);
  const conceptos = conceptosCrudos.map(normalizarConcepto);

  /** @type {Map<string, Ejercicio>} */
  const ejercicioPorId = new Map(ejercicios.map((e) => [e.id, e]));
  /** @type {Map<string, Concepto>} */
  const conceptoPorId = new Map(conceptos.map((c) => [c.id, c]));
  /** @type {Map<string, Rutina>} */
  const rutinaPorId = new Map(rutinas.map((r) => [r.id, r]));

  return {
    reglas, ejercicios, conceptos, rutinas,
    ejercicioPorId, conceptoPorId, rutinaPorId,
    porSubBloque: agruparPorSubBloque(ejercicios)
  };
}

// =================================================================== consultas

/**
 * El nombre para mostrar de un ejercicio. Si el id no existe, devuelve algo legible en vez
 * de romper la pantalla: el usuario en el gimnasio no puede hacer nada con un error.
 * @param {Catalogo} catalogo
 * @param {string} ejercicioId
 * @returns {string}
 */
export function nombreDeEjercicio(catalogo, ejercicioId) {
  const e = catalogo.ejercicioPorId.get(ejercicioId);
  return e ? e.nombre : '(ejercicio desconocido: ' + ejercicioId + ')';
}

/**
 * La clave de equipo de un ejercicio, que es lo que necesita la lógica de progresión.
 * @param {Catalogo} catalogo
 * @param {string} ejercicioId
 * @returns {string}
 */
export function equipoDeEjercicio(catalogo, ejercicioId) {
  const e = catalogo.ejercicioPorId.get(ejercicioId);
  return e ? e.equipo : 'desconocido';
}

/**
 * Los ejercicios equivalentes a uno dado: los que comparten su sub-bloque.
 *
 * Todavía no lo llama nadie. Está para que el dato ya esté disponible el día que se arme
 * el cambio de ejercicio o el armador de rutinas.
 * @param {Catalogo} catalogo
 * @param {string} ejercicioId
 * @returns {Ejercicio[]}
 */
export function equivalentesDe(catalogo, ejercicioId) {
  const e = catalogo.ejercicioPorId.get(ejercicioId);
  if (!e || !e.subBloque) return [];
  return (catalogo.porSubBloque.get(e.subBloque) || []).filter((x) => x.id !== ejercicioId);
}

/**
 * Busca un día dentro de una rutina.
 * @param {Catalogo} catalogo
 * @param {string} rutinaId
 * @param {string} diaId
 * @returns {{rutina: Rutina, dia: import('../tipos.js').DiaRutina}|null}
 */
export function buscarDia(catalogo, rutinaId, diaId) {
  const rutina = catalogo.rutinaPorId.get(rutinaId);
  if (!rutina) return null;
  const dia = rutina.dias.find((d) => d.id === diaId);
  return dia ? { rutina, dia } : null;
}

/**
 * Segundos de descanso ENTRE SERIES del mismo ejercicio.
 *
 * Tres escalones, del más específico al más general: lo que dice la rutina para ESTE
 * ejercicio en ESTE día, lo que dice la ficha del ejercicio (columna `descanso_seg`, que
 * el socio todavía no completó), y el valor por defecto de reglas.json.
 * @param {Catalogo} catalogo
 * @param {EjercicioPlanificado} plan
 * @returns {number}
 */
export function descansoDe(catalogo, plan) {
  if (plan.descansoSeg > 0) return plan.descansoSeg;
  const ficha = catalogo.ejercicioPorId.get(plan.ejercicioId);
  if (ficha && ficha.descansoSeg && ficha.descansoSeg > 0) return ficha.descansoSeg;
  return catalogo.reglas.descansoPorDefectoSeg;
}

/**
 * Segundos de descanso al TERMINAR un ejercicio, antes de pasar al siguiente.
 *
 * Es un descanso distinto y más largo que el de entre series: cambiás de aparato, capás
 * que tenés que esperar que se desocupe, y el músculo que viene es otro. Antes esto no
 * existía y el usuario quedaba con el descanso corto entre ejercicios distintos.
 * @param {Catalogo} catalogo
 * @param {EjercicioPlanificado} plan
 * @returns {number}
 */
export function descansoDespuesDe(catalogo, plan) {
  if (plan.descansoDespuesSeg && plan.descansoDespuesSeg > 0) return plan.descansoDespuesSeg;
  return catalogo.reglas.descansoEntreEjerciciosSeg || catalogo.reglas.descansoPorDefectoSeg;
}
