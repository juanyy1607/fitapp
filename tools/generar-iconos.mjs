/*
 * tools/generar-iconos.mjs — Genera los PNG de icons/ desde cero.
 *
 * Herramienta de desarrollo: NO forma parte de la app ni se sube al teléfono.
 * Existe para no meter dependencias ni archivos binarios que no podamos regenerar.
 *
 * Uso:  node tools/generar-iconos.mjs
 *
 * Escribe un PNG a mano (cabecera + datos comprimidos con zlib, que ya viene en Node).
 * Dibuja un cronómetro: un anillo con una aguja, sobre el fondo oscuro de la app.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'icons');

const FONDO = [0x0f, 0x11, 0x15];
const ACENTO = [0x4d, 0xa3, 0xff];
const CLARO = [0xe8, 0xea, 0xf0];

// ------------------------------------------------------------------ PNG crudo

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function aPng(ancho, alto, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;    // 8 bits por canal
  ihdr[9] = 6;    // color tipo 6 = RGBA
  // 10,11,12 quedan en 0: compresión, filtro e interlace estándar

  // Cada fila del PNG arranca con un byte de filtro; usamos 0 = sin filtro.
  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    const destino = y * (ancho * 4 + 1);
    filas[destino] = 0;
    rgba.copy(filas, destino + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

// ------------------------------------------------------------------- dibujo

/*
 * Dibuja pixel por pixel con supermuestreo 3x3: calculamos 9 puntos dentro de cada
 * pixel y promediamos. Eso alcanza para que los bordes curvos no queden dentados,
 * sin necesidad de una librería de gráficos.
 */
function dibujar(tamano, { margen }) {
  const rgba = Buffer.alloc(tamano * tamano * 4);
  const c = tamano / 2;
  const util = tamano * (1 - 2 * margen);   // diámetro de la zona segura
  const rAnillo = util * 0.40;
  const grosor = util * 0.085;
  const M = 3;

  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      let r = 0, g = 0, b = 0;

      for (let sy = 0; sy < M; sy++) {
        for (let sx = 0; sx < M; sx++) {
          const px = x + (sx + 0.5) / M;
          const py = y + (sy + 0.5) / M;
          const dx = px - c;
          const dy = py - c;
          const dist = Math.hypot(dx, dy);

          let color = FONDO;

          // Anillo del cronómetro, con un hueco arriba como el de un reloj real.
          const angulo = Math.atan2(dy, dx);                 // -pi..pi, 0 = derecha
          const haciaArriba = Math.abs(angulo + Math.PI / 2) < 0.30;
          if (Math.abs(dist - rAnillo) < grosor / 2 && !haciaArriba) color = ACENTO;

          // Corona (el botón de arriba del cronómetro).
          if (Math.abs(dx) < util * 0.055 && py > c - rAnillo - util * 0.10 && py < c - rAnillo + grosor * 0.6) {
            color = ACENTO;
          }

          // Aguja: del centro hacia arriba a la derecha, marcando el descanso corriendo.
          const largoAguja = rAnillo * 0.74;
          const ax = Math.cos(-Math.PI / 3.1) * largoAguja;
          const ay = Math.sin(-Math.PI / 3.1) * largoAguja;
          if (distanciaASegmento(dx, dy, 0, 0, ax, ay) < grosor * 0.42) color = CLARO;

          // Punto pivote en el centro.
          if (dist < grosor * 0.52) color = CLARO;

          r += color[0]; g += color[1]; b += color[2];
        }
      }

      const n = M * M;
      const i = (y * tamano + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;   // opaco: los íconos maskable no pueden tener transparencia
    }
  }
  return rgba;
}

function distanciaASegmento(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const largo2 = vx * vx + vy * vy;
  let t = largo2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / largo2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

// ------------------------------------------------------------------ generar

mkdirSync(SALIDA, { recursive: true });

const ARCHIVOS = [
  // margen 0.08 = el dibujo ocupa casi todo el cuadrado (íconos normales)
  { nombre: 'icon-192.png', tamano: 192, margen: 0.08 },
  { nombre: 'icon-512.png', tamano: 512, margen: 0.08 },
  { nombre: 'icon-180.png', tamano: 180, margen: 0.08 },
  // margen 0.18 = el dibujo queda dentro de la "zona segura" que exige Android para
  // los íconos maskable, que recorta los bordes para adaptarlos a la forma del sistema.
  { nombre: 'icon-maskable-512.png', tamano: 512, margen: 0.18 }
];

for (const a of ARCHIVOS) {
  const png = aPng(a.tamano, a.tamano, dibujar(a.tamano, { margen: a.margen }));
  writeFileSync(join(SALIDA, a.nombre), png);
  console.log(`  icons/${a.nombre.padEnd(24)} ${a.tamano}x${a.tamano}  ${(png.length / 1024).toFixed(1)} KB`);
}
console.log('Listo.');
