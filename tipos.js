// @ts-check
/**
 * tipos.js — La forma de todos los datos del proyecto, definida una sola vez.
 *
 * Este archivo no tiene código que se ejecute: son solo definiciones para que el editor
 * sepa qué campos tiene cada cosa. Gracias a esto, cuando escribas `rutina.` VS Code te
 * ofrece los campos que existen, y te subraya en rojo si escribís `repeticiones` donde
 * va `reps`.
 *
 * Aviso importante, para no confiarse: esto chequea EL CÓDIGO QUE ESCRIBIMOS NOSOTROS.
 * No chequea los datos que entran. Un JSON mal armado pasa por acá sin que nadie se
 * queje. Para eso está tools/validar-datos.mjs, que es otra cosa y hace falta igual.
 */

// ===================================================================== catálogo
// Esto sale de los archivos de datos/. Lo maneja el socio, no se escribe en el código.

/**
 * Un ejercicio del catálogo.
 * @typedef {Object} Ejercicio
 * @property {string} id            Identificador estable. NUNCA se cambia una vez usado:
 *                                  el historial de los usuarios apunta acá.
 * @property {string} nombre        Cómo se muestra en pantalla.
 * @property {string} [nombreAlternativo]  Cómo lo llaman en otros lados, para buscarlo.
 * @property {string} equipo        Clave de `Reglas.equipos`. Define de a cuánto sube el peso.
 * @property {string} grupo         Grupo muscular principal.
 * @property {string[]} [musculosSecundarios]  Lo va a necesitar el armador de rutinas.
 * @property {'principiante'|'intermedio'|'avanzado'} [nivel]
 * @property {boolean} [esUnilateral]     Si se hace de a un lado. Define si el peso se
 *                                        registra una vez o por lado.
 * @property {boolean} [esPesoCorporal]   El cuerpo aporta la carga base.
 * @property {boolean} [admiteLastre]     Se le puede agregar peso (dominadas con disco).
 * @property {boolean} [admiteAsistencia] Se puede hacer con ayuda (máquina o banda).
 * @property {number|null} [pesoInicialKg] Con cuánto arrancar la primera vez. Vive acá
 *                                        porque es propiedad del ejercicio, no de la rutina.
 * @property {string[]} [sustitutos]      Qué hacer si la máquina está ocupada.
 * @property {string} [tecnica]
 * @property {string} [erroresComunes]
 * @property {string} [imagen]
 * @property {string} [notas]
 */

/**
 * Cómo se interpreta el número de kilos que registra el usuario.
 *
 * Esto NO está en la planilla: se deduce de las casillas del ejercicio. Importa mucho
 * porque en `asistencia` progresar significa BAJAR el número, no subirlo.
 * @typedef {'peso'|'lastre'|'asistencia'|'peso-corporal'} ModoCarga
 */

/**
 * Un ejercicio dentro de un día de rutina.
 * @typedef {Object} EjercicioPlanificado
 * @property {string} ejercicioId   Apunta a `Ejercicio.id`.
 * @property {number} series
 * @property {number} repsMin       Piso del rango de repeticiones.
 * @property {number} repsMax       Techo. Al llegar acá en TODAS las series, sube el peso.
 * @property {number} descansoSeg   Segundos de descanso ENTRE SERIES de este ejercicio.
 * @property {number} [descansoDespuesSeg]  Descanso al TERMINAR este ejercicio, antes del
 *                                  siguiente. Si falta, se usa el valor de reglas.json.
 * @property {number|null} [pesoInicialKg]  Opcional: pisa el peso inicial del ejercicio
 *                                  solo para esta rutina.
 */

/**
 * Un día de rutina (día A, día B, etc.).
 * @typedef {Object} DiaRutina
 * @property {string} id
 * @property {string} nombre
 * @property {EjercicioPlanificado[]} ejercicios
 */

/**
 * Una rutina completa.
 * @typedef {Object} Rutina
 * @property {string} id
 * @property {string} nombre
 * @property {string} [descripcion]
 * @property {DiaRutina[]} dias
 */

/**
 * De a cuánto se puede subir el peso en un tipo de equipo.
 *
 * `pesoBaseKg` es el piso: una barra olímpica vacía ya pesa 20 kg, así que las cargas
 * posibles son 20, 22.5, 25… y nunca menos de 20. En mancuernas o máquinas el piso es 0.
 *
 * `subirKg` son kilos absolutos, no un porcentaje. Un porcentaje mentía: con 2,5% sobre
 * 60 kg el salto da 1,5 kg, menos que el disco más chico, así que el redondeo se lo comía
 * y el número no hacía nada hasta los 100 kg. Nuestro usuario no llega ahí en el primer año.
 * @typedef {Object} Equipo
 * @property {string} nombre
 * @property {number} incrementoMinimoKg  El salto más chico posible. 0 = peso corporal.
 * @property {number} pesoBaseKg
 * @property {number} subirKg             Cuánto sumar cuando completa el rango.
 */

/**
 * Cómo progresa la carga. Esto lo ajusta el socio sin tocar código.
 * @typedef {Object} ReglaProgresion
 * @property {number} bajarPorcentaje            Cuánto bajar al estancarse.
 * @property {number} sesionesFallidasParaBajar  Cuántas veces seguidas hay que fallar antes de bajar.
 * @property {number} [multiplicadorSiFueFacil]  Por cuánto multiplicar el salto cuando el
 *                                               usuario marcó "Fácil". 1 = el botón no
 *                                               cambia nada. 2 = salto doble.
 * @property {number} [saltoMaximoPorcentaje]    Tope del salto DOBLE, en % de la carga
 *                                               actual. Evita que en cargas chicas el
 *                                               salto doble sea un 40% de golpe. No limita
 *                                               nunca al salto normal.
 */

/**
 * Un desacuerdo abierto sobre una regla, anotado a la vista en datos/reglas.json.
 *
 * Existe para que ninguna decisión de entrenamiento quede cambiada por atrás: si lo
 * implementado no coincide con lo que respondió el socio, queda escrito con las dos
 * posiciones y el validador lo grita en cada corrida.
 * @typedef {Object} ConflictoDeRegla
 * @property {string} clave
 * @property {string} estado
 * @property {string} postura_socio
 * @property {string} postura_juan
 * @property {string} implementado
 * @property {string} [nota]
 */

/**
 * El archivo de reglas completo.
 * @typedef {Object} Reglas
 * @property {number} version
 * @property {boolean} [provisorio]   true mientras el socio no confirmó estos números.
 * @property {number} descansoPorDefectoSeg      Entre series, si el plan no lo dice.
 * @property {number} descansoEntreEjerciciosSeg Al pasar de un ejercicio al siguiente.
 * @property {ReglaProgresion} progresion
 * @property {Record<string, Equipo>} equipos
 * @property {ConflictoDeRegla[]} [conflictos]  Desacuerdos abiertos, a la vista.
 */

// ================================================================== gamificación
// TODAVÍA NO IMPLEMENTADO. Esto es solo dónde van a vivir las cosas, decidido ahora para
// no tener que migrar el historial después. Ver la sección de DATOS.md.
//
// La decisión de fondo: **la racha y el XP se CALCULAN del historial, no se guardan.**
// Si se guardaran, podrían quedar desincronizados del historial real —y no habría forma de
// saber cuál de los dos tiene razón—, y cambiar la fórmula obligaría a migrar a todos los
// usuarios. Calculándolos, cambiar la fórmula recalcula todo el pasado solo.
//
// Lo único que hay que guardar es lo que NO se puede deducir: qué insignias ya se
// avisaron, para no volver a festejar la misma dos veces.

/**
 * Una insignia. Las condiciones son datos, no código: las define el socio.
 * @typedef {Object} Insignia
 * @property {string} id
 * @property {string} nombre
 * @property {string} descripcion
 * @property {string} [icono]
 * @property {'sesiones-totales'|'dias-seguidos'|'volumen-total'|'peso-en-ejercicio'|'sesiones-en-semana'} condicion
 * @property {number} objetivo          El número a alcanzar según la condición.
 * @property {string} [ejercicioId]     Solo para la condición 'peso-en-ejercicio'.
 * @property {number} [xp]              Cuánto XP otorga.
 */

/**
 * Lo único de gamificación que se guarda, porque no se puede deducir del historial.
 * @typedef {Object} EstadoGamificacion
 * @property {string[]} insigniasAvisadas  Ids ya festejados, para no repetir el aviso.
 */

// ====================================================================== historial
// Esto lo genera el usuario entrenando. Vive en IndexedDB, en el teléfono.

/**
 * Cómo se sintió la serie. Reemplaza al RIR, que un principiante no sabe estimar.
 * @typedef {'facil'|'justo'|'no-llegue'} Esfuerzo
 */

/**
 * Una serie registrada en el gimnasio.
 * @typedef {Object} SerieRegistrada
 * @property {string} ejercicioId
 * @property {number} numero        1, 2, 3… dentro de ese ejercicio en esa sesión.
 * @property {number} pesoKg        Según el modo de carga: kilos levantados, kilos de
 *                                  lastre, o kilos de ayuda.
 * @property {number} reps
 * @property {Esfuerzo} [esfuerzo]  Se registra desde el día uno, aunque todavía no decida
 *                                  nada: el dato subjetivo no se puede recuperar después.
 * @property {number} completadaTs  Marca de tiempo real de cuándo se confirmó.
 */

/**
 * Una sesión de entrenamiento.
 * @typedef {Object} Sesion
 * @property {string} id
 * @property {string} rutinaId
 * @property {string} diaId
 * @property {number} inicioTs
 * @property {number|null} finTs    null mientras está en curso.
 * @property {SerieRegistrada[]} series
 */

// ====================================================================== progresión

/**
 * Lo que hizo el usuario con UN ejercicio en UNA sesión pasada.
 *
 * Es la forma que come la lógica de progresión. Deliberadamente simple: un peso y las
 * repeticiones de cada serie. Así se puede testear sin inventar sesiones enteras.
 * @typedef {Object} IntentoEjercicio
 * @property {number} fechaTs
 * @property {number} pesoKg
 * @property {number[]} reps   Las repeticiones de cada serie, en orden.
 * @property {Esfuerzo} [esfuerzo]  Cómo se sintió, según el botón de la última serie.
 *                                  Solo modifica el TAMAÑO del salto, nunca si hay salto.
 */

/**
 * La sugerencia que le mostramos al usuario al empezar un ejercicio.
 * @typedef {Object} Sugerencia
 * @property {number|null} pesoKg      Con cuánto arrancar. null = no sabemos todavía.
 * @property {number} repsObjetivo     A cuántas repeticiones apuntar.
 * @property {'primera-vez'|'subir'|'mantener'|'bajar'|'bajaste-el-peso'} motivo
 * @property {ModoCarga} modo          Cómo hay que leer `pesoKg` en la pantalla.
 * @property {string} explicacion      Frase lista para mostrar en pantalla, en castellano.
 * @property {string} [advertencia]    Si algo de los datos estaba mal y hubo que suponer.
 */

export {};
