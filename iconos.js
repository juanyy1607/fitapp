// @ts-check
/**
 * iconos.js — Los íconos de la app, como SVG de trazo.
 *
 * Todos comparten la misma receta: grilla de 24, trazo de 2, puntas y uniones redondeadas,
 * y el color sale de `currentColor`. Eso último es lo que hace que un ícono adentro de un
 * botón amarillo salga oscuro y el mismo ícono en la barra de abajo salga gris, sin
 * escribir una sola regla de color extra.
 *
 * Por qué no emoji: cada sistema dibuja los suyos, con distinto estilo, distinto peso y
 * colores propios que pelean con el amarillo. Un emoji es el dibujo de otra persona metido
 * en el medio de nuestra interfaz.
 *
 * Son deliberadamente pocos. Cada ícono nuevo es una cosa más que puede quedar fuera de
 * estilo.
 */

/** @type {Record<string, string>} */
const TRAZOS = {
  // Tilde. Va adentro del círculo amarillo de las series hechas.
  tilde: '<polyline points="20 6 9 17 4 12"/>',

  // Pesa. La pantalla de Hoy.
  pesa: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',

  // Lista. El historial.
  lista: '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/>' +
         '<line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/>' +
         '<circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',

  // Cruz. Salir de la sesión.
  cruz: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',

  // Tacho. Borrar una serie.
  tacho: '<polyline points="3 6 5 6 21 6"/>' +
         '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
         '<path d="M10 11v6M14 11v6"/>' +
         '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',

  // Flecha atrás.
  atras: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'
};

/**
 * Devuelve el SVG de un ícono, listo para meter en el HTML.
 *
 * @param {string} nombre   Una de las claves de TRAZOS.
 * @param {number} [tamano] Lado en píxeles. 24 por defecto; 20 para los chicos.
 * @returns {string}
 */
export function icono(nombre, tamano = 24) {
  const trazo = TRAZOS[nombre];
  if (!trazo) return '';
  return '<svg viewBox="0 0 24 24" width="' + tamano + '" height="' + tamano + '" ' +
         'fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
         trazo + '</svg>';
}

/** Los nombres disponibles, para que los tests verifiquen que no falta ninguno. */
export const NOMBRES = Object.keys(TRAZOS);
