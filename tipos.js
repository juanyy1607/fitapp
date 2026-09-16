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
 * @property {string} equipo        Clave de `Reglas.equipos`. Define de a cuánto sube el peso.
 * @property {string} grupo         Grupo muscular, para agrupar en listas.
 * @property {string} [notas]       Texto libre, opcional.
 */

/**
 * Un ejercicio dentro de un día de rutina, con sus series y descanso.
 * @typedef {Object} EjercicioPlanificado
 * @property {string} ejercicioId   Apunta a `Ejercicio.id`.
 * @property {number} series        Cuántas series hacer.
 * @property {number} repsMin       Piso del rango de repeticiones.
 * @property {number} repsMax       Techo del rango. Al llegar acá en TODAS las series, sube el peso.
 * @property {number} descansoSeg   Segundos de descanso entre series.
 * @property {number|null} pesoInicialKg  Con cuánto arrancar la primera vez. null = lo elige el usuario.
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
 * @typedef {Object} Equipo
 * @property {string} nombre
 * @property {number} incrementoMinimoKg  El salto más chico posible. 0 = peso corporal.
 * @property {number} pesoBaseKg
 */

/**
 * Cómo progresa la carga. Esto lo ajusta el socio sin tocar código.
 * @typedef {Object} ReglaProgresion
 * @property {number} subirPorcentaje          Cuánto subir al completar el rango.
 * @property {number} bajarPorcentaje          Cuánto bajar al estancarse.
 * @property {number} sesionesFallidasParaBajar  Cuántas veces seguidas hay que fallar antes de bajar.
 */

/**
 * El archivo de reglas completo.
 * @typedef {Object} Reglas
 * @property {number} version
 * @property {number} descansoPorDefectoSeg
 * @property {ReglaProgresion} progresion
 * @property {Record<string, Equipo>} equipos
 */

// ====================================================================== historial
// Esto lo genera el usuario entrenando. Vive en IndexedDB, en el teléfono.

/**
 * Una serie registrada en el gimnasio.
 * @typedef {Object} SerieRegistrada
 * @property {string} ejercicioId
 * @property {number} numero        1, 2, 3… dentro de ese ejercicio en esa sesión.
 * @property {number} pesoKg
 * @property {number} reps
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
 */

/**
 * La sugerencia que le mostramos al usuario al empezar un ejercicio.
 * @typedef {Object} Sugerencia
 * @property {number|null} pesoKg      Con cuánto arrancar. null = no sabemos todavía.
 * @property {number} repsObjetivo     A cuántas repeticiones apuntar.
 * @property {'primera-vez'|'subir'|'mantener'|'bajar'|'bajaste-el-peso'} motivo
 * @property {string} explicacion      Frase lista para mostrar en pantalla, en castellano.
 * @property {string} [advertencia]    Si algo de los datos estaba mal y hubo que suponer.
 */

export {};
