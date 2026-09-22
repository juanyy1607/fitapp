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
 *                                  Puede venir vacío: hay ejercicios que el socio todavía
 *                                  no clasificó. La app supone saltos de 1 kg y avisa.
 * @property {string} grupo         Grupo muscular principal.
 * @property {string} [subBloque]   El pool de ejercicios equivalentes al que pertenece:
 *                                  todos los que sirven para lo mismo y se pueden cambiar
 *                                  uno por otro ("sentadillas", "hip thrust", "femoral").
 *                                  TODAVÍA NO SE USA. Se guarda porque lo van a necesitar
 *                                  el armador de rutinas y el cambio de ejercicio cuando
 *                                  la máquina está ocupada.
 * @property {string[]} [musculosSecundarios]  Lo va a necesitar el armador de rutinas.
 * @property {'principiante'|'intermedio'|'avanzado'} [nivel]
 * @property {boolean} [esUnilateral]     Si se hace de a un lado. Define si el peso se
 *                                        registra una vez o por lado.
 * @property {boolean} [esPesoCorporal]   El cuerpo aporta la carga base.
 * @property {boolean} [admiteLastre]     Se le puede agregar peso (dominadas con disco).
 * @property {boolean} [admiteAsistencia] Se puede hacer con ayuda (máquina o banda).
 * @property {number} [subirKg]           Cuántos kilos sumar cuando toca subir, SOLO para
 *                                        este ejercicio. Pisa el `subirKg` del equipo.
 *                                        Existe porque el press militar progresa mucho más
 *                                        lento que la sentadilla aunque los dos usen barra.
 *                                        Vacío = manda el equipo.
 * @property {string[]} [sustitutos]      Qué hacer si la máquina está ocupada.
 * @property {number} [descansoSeg]       Descanso entre series propio de este ejercicio.
 *                                        Si falta, manda el de la rutina o el de reglas.json.
 * @property {string} [tecnica]
 * @property {string} [erroresComunes]
 * @property {string} [video]             Link de YouTube con la demostración. Se abre en
 *                                        el navegador; no se incrusta el reproductor.
 * @property {string} [imagen]
 * @property {string} [notas]
 */

/**
 * Un concepto de entrenamiento explicado en video: qué es el RIR, qué es un drop set.
 *
 * Son las fichas de `datos/conceptos.json`. Por ahora traen título y video; el texto lo
 * escribe el socio más adelante.
 * @typedef {Object} Concepto
 * @property {string} id
 * @property {string} titulo
 * @property {string} [video]   Link de YouTube.
 * @property {string} [texto]   La explicación escrita, cuando exista.
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
 * @property {number} repsMin       Piso del rango. De acá salen los objetivos al estrenar
 *                                  un peso: serie 1 el piso, serie 2 el piso+1, etc.
 * @property {number} repsMax       Techo. Es el tope de los objetivos, y al llegar acá en
 *                                  TODAS las series sube el peso.
 * @property {number} descansoSeg   Segundos de descanso ENTRE SERIES de este ejercicio.
 * @property {number} [descansoDespuesSeg]  Descanso al TERMINAR este ejercicio, antes del
 *                                  siguiente. Si falta, se usa el valor de reglas.json.
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
 * Un desacuerdo abierto sobre una regla, anotado a la vista en datos/reglas.json.
 *
 * Existe para que ninguna decisión de entrenamiento quede cambiada por atrás: si lo
 * implementado no coincide con lo que respondió el socio, queda escrito con las dos
 * posiciones y el validador lo grita en cada corrida.
 *
 * Hoy la lista está vacía: el socio cerró la regla de progresión y se implementó como la
 * definió él. La estructura queda porque el mecanismo va a hacer falta de nuevo.
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
 *
 * No hay sección `progresion`: la regla de progresión no tiene números que ajustar. Los
 * objetivos salen del rango de repeticiones de cada ejercicio, y los kilos que se suben,
 * del `subirKg` del equipo o del ejercicio. Todo lo que había acá —el deload porcentual,
 * las sesiones fallidas, el multiplicador de "Fácil"— murió con la regla vieja.
 * @typedef {Object} Reglas
 * @property {number} version
 * @property {boolean} [provisorio]   true mientras el socio no confirmó estos números.
 * @property {number} descansoPorDefectoSeg      Entre series, si el plan no lo dice.
 * @property {number} descansoEntreEjerciciosSeg Al pasar de un ejercicio al siguiente.
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
 * Una serie registrada en el gimnasio.
 * @typedef {Object} SerieRegistrada
 * @property {string} ejercicioId
 * @property {number} numero        1, 2, 3… dentro de ese ejercicio en esa sesión.
 * @property {number} pesoKg        Según el modo de carga: kilos levantados, kilos de
 *                                  lastre, o kilos de ayuda.
 * @property {number} reps          Lo que hizo de verdad.
 * @property {number|null} [objetivo] Lo que le pedía la app en ESTA serie. `null` = al
 *                                  fallo, que es distinto de 0 y distinto de no tener dato.
 *
 *                                  Se guarda porque sin esto la progresión no se puede
 *                                  calcular: 7 repeticiones es un objetivo cumplido si le
 *                                  pedían 7, y uno fallado si le pedían 9. El número solo
 *                                  no lo dice. Es el dato que no se puede recuperar
 *                                  después, igual que pasaba con el esfuerzo.
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
 * Es la forma que come la lógica de progresión. Deliberadamente simple: un peso, las
 * repeticiones de cada serie y el objetivo que tenía cada una. Así se puede testear sin
 * inventar sesiones enteras.
 * @typedef {Object} IntentoEjercicio
 * @property {number} fechaTs
 * @property {number} pesoKg
 * @property {number[]} reps           Las repeticiones de cada serie, en orden.
 * @property {(number|null)[]} [objetivos]  Lo que pedía cada serie, en el mismo orden.
 *                                    `null` en una serie = iba al fallo. Puede faltar
 *                                    entero en historial viejo, de antes de esta regla.
 */

/**
 * La sugerencia que le mostramos al usuario al empezar un ejercicio.
 * @typedef {Object} Sugerencia
 * @property {number|null} pesoKg      Con qué peso. `null` = la app no lo sabe y el campo
 *                                     va vacío, que es lo que pasa la primera vez: el
 *                                     usuario prueba en el gimnasio y anota lo que usó.
 * @property {(number|null)[]} objetivos  Un objetivo por serie, en orden. `null` = esa
 *                                     serie va al fallo.
 * @property {'primera-vez'|'subir'|'seguir'|'agregar-lastre'|'tope'} motivo
 *                                     `agregar-lastre` = llegó al techo haciéndolo a peso
 *                                     corporal y toca empezar a cargar disco. Cuántos kilos
 *                                     lo decide el usuario, así que `pesoKg` viene en null.
 *                                     `tope` = asistido que ya no usa nada de ayuda: no se
 *                                     puede bajar de cero, toca cambiar de ejercicio.
 * @property {ModoCarga} modo          Cómo hay que leer `pesoKg` en la pantalla.
 * @property {string} explicacion      Frase lista para mostrar en pantalla, en castellano.
 * @property {string} [advertencia]    Si algo de los datos estaba mal y hubo que suponer.
 */

export {};
