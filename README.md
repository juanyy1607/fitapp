# Banco de pruebas — Temporizador de descanso en PWA

Fase 0 del proyecto. Todavía no hay código de producto.

**La pregunta que este banco responde:** ¿puede una PWA avisarte a los 90 segundos con el
teléfono bloqueado en el bolsillo y sin señal? De la respuesta depende toda la arquitectura.

Vanilla HTML + CSS + JS. Sin frameworks, sin build step, sin dependencias.

---

## Por qué esto es un problema real

No existe ninguna API que programe una notificación local a futuro en una PWA:

| API | Estado | Sirve para nosotros |
|---|---|---|
| **Notification Triggers** | Propuesta de 2019, nunca llegó a ningún navegador | No existe |
| **Web Push** | Anda en PWAs instaladas desde iOS 16.4 | No: necesita servidor y señal, y en el subsuelo no hay |
| **Screen Wake Lock** | Anda | Solo si la pantalla queda encendida |
| **setTimeout** | Anda | Solo si el sistema no congela la página |

Conclusión: la única vía posible es **mantener la página viva** para que un `setTimeout`
común llegue a ejecutarse. Por eso lo que este banco mide, en el fondo, es
**cuánto sobrevive la página en cada escenario**.

---

## Las cinco estrategias

| | Estrategia | Cómo funciona | Pronóstico |
|---|---|---|---|
| **A** | `setTimeout` + Notification API | La página espera y dispara la notificación | Muere si el sistema congela la página |
| **B** | Service worker + `setTimeout` | Igual pero en el service worker, con `waitUntil()` para pedir que no lo maten | El navegador igual le pone un techo |
| **C** | Wake Lock + sonido | Deja la pantalla prendida y agenda los beeps en el reloj del motor de audio | El wake lock se suelta al ocultar la página |
| **D** | Recuperación por marca de tiempo | **No avisa.** Verifica que el contador esté bien al volver | Funciona siempre, pero no resuelve el problema |
| **E** | Alarma adentro del archivo de audio | Reproduce un WAV que es silencio durante el descanso y trae la alarma adentro | **La favorita, y ya con evidencia a favor** |

### Sobre la estrategia D — leer con atención

D **no es una forma de avisar**. Son dos cosas distintas que no hay que mezclar:

- **Que el contador esté bien al volver** → resuelto por construcción. El tiempo siempre se
  calcula restando marcas de tiempo (`vence - ahora`), nunca sumando de a un segundo.
- **Que la app te avise sin que la mires** → eso lo miden A, B, C y E.

Lo que D sí aporta es el dato más importante de todo el experimento: **la brecha de JS
congelado**. La app deja una marca de tiempo cada segundo; al despertar, la diferencia
contra la última marca es exactamente cuánto tiempo el sistema tuvo el JavaScript
congelado. Si esa brecha cubre el vencimiento, ninguna estrategia con `setTimeout` podía
haber avisado, y el log lo demuestra con números.

### Sobre la estrategia E

No estaba en el pedido original. La sumé porque es la única técnica con historial de
funcionar de verdad en la web. Después de la primera tanda de mediciones la reescribí, y
hoy es la que más chances tiene. Ver abajo.

---

## Tanda 1 — 15/09/2026, iPhone (iOS 18.7, Safari 27), instalada

9 corridas de 30 s. **El hallazgo principal ya está.**

### Cuánto sobrevive la página con la pantalla bloqueada

| Estrategia | Brecha de JS congelado al terminar |
|---|---|
| B (service worker) | **26.949 ms** |
| C (wake lock) | **53.787 ms** |
| E (audio) | **0 ms** |
| E (audio) | **1 ms** |
| E (audio) | **1.001 ms** |

Mientras la app reproduce audio, **iOS no congela la página**. Sin audio, la congela a los
pocos segundos. Tres corridas consistentes. Esto se ve además en la pantalla bloqueada: iOS
muestra el reproductor multimedia con el ícono de la app, que es la señal de que la está
tratando como música sonando.

### Lo demás que quedó medido

- **A** — con pantalla encendida disparó con 11 ms de desvío. Sin datos con pantalla
  bloqueada. La notificación de iOS llega como banner, **no como alarma**: no alcanza para
  el gimnasio.
- **B** — pantalla encendida: 12 ms de desvío. Pantalla bloqueada: **14.784 ms tarde**,
  disparó recién al desbloquear. Descartada para el caso de uso.
- **C** — el wake lock se soltó 6 s después de ocultar la app, como estaba previsto.
  Con pantalla bloqueada disparó 33 s tarde. Y ni con la pantalla encendida se escuchó,
  aunque el respaldo disparó con 2 ms de desvío: la sospecha es que el motor de Web Audio
  estaba suspendido. Por eso ahora se registra `estadoAudio` en cada corrida de C.
- **D** — el contador siempre mostró el valor correcto al volver, como estaba previsto.
- **E** — **no tenía alarma conectada.** Era un error mío: mantenía la página viva pero no
  hacía sonar nada. Los "no avisó" de esa tanda no significan nada. Está corregido.

### Qué se corrigió después de esta tanda

1. **E pasó de "audio silencioso + setTimeout" a "un solo WAV con la alarma adentro".**
   El tiempo lo cuenta el hardware de audio, no el JavaScript. Aunque el sistema congele la
   página, el sonido ya está en la cola de reproducción.
2. **`finalizar()` ya no corta el audio.** Cortaba justo al vencimiento, o sea un instante
   antes de que la alarma sonara.
3. **La app detecta sola si estuvo oculta** y lo guarda en `escenarioDetectado`. En esta
   tanda las 9 corridas quedaron etiquetadas como "escenario 1, pantalla encendida" porque
   la lista de escenarios nunca se movió, aunque la pantalla estuvo bloqueada en varias.
4. **Se registra `estadoAudio`** y hay un botón nuevo, *Probar alarma (archivo)*, que usa el
   mismo camino que E.

---

## Tanda 2 — 15/09/2026, iPhone, con la estrategia E corregida

Dos corridas de 90 s con la pantalla apagada. **La estrategia E funciona.**

| | Corrida 1 | Corrida 2 |
|---|---|---|
| Disparo vs. lo previsto | **+167 ms** | **+163 ms** |
| Posición del audio al vencer | 90,01 s | 90,02 s |
| JS congelado en el momento del disparo | 1.816 ms | 1.989 ms |
| Escenario detectado | oculta, página viva (1 ms) | oculta, página viva (0 ms) |

El dato que cierra la discusión: **el JavaScript estaba congelado casi 2 segundos cuando la
alarma sonó.** El sonido no dependió de él, salió del archivo que ya estaba en la cola de
reproducción. 167 ms de desvío sobre 90 segundos es 0,19% de error.

Sonó además **por los AirPods**, que es el caso de uso real en el gimnasio.

También quedó confirmado por qué la estrategia C nunca hizo ruido: la prueba de sonido
registró `estadoAudio: suspended`. El motor de Web Audio estaba suspendido y los beeps
quedaban agendados sin reproducirse. No era el interruptor de silencio.

### Un efecto secundario que conviene aprovechar

En las dos corridas el audio se pausó a los ~92,8 s, antes de terminar los 4 s de alarma:
el usuario la cortó desde los controles multimedia. O sea que **la pantalla bloqueada y los
AirPods ya sirven para apagar la alarma sin desbloquear el teléfono.** Eso es exactamente lo
que uno quiere entre series, y sale gratis.

### Lo que sigue sin probarse

- **Modo avión.** Las dos corridas tenían red (`conRed: true`). La estrategia E no usa red
  para nada, así que el temporizador debería andar igual; lo que falta verificar es otra
  cosa: **que la app abra sin señal**, que es el service worker, no el timer.
- **Android.** No hay teléfono a mano. Es un sistema distinto, con su propio mecanismo de
  congelado (Doze). El resultado de iPhone no se puede extrapolar.
- Escenario 5, los 5 minutos completos.
- En pestaña del navegador, sin instalar.

---

## Los seis escenarios

1. App abierta, pantalla encendida
2. App abierta, pantalla bloqueada
3. App en segundo plano (cambiaste a otra app), pantalla encendida
4. App en segundo plano, pantalla bloqueada
5. Pantalla bloqueada, teléfono en el bolsillo, 5 minutos
6. **Modo avión + pantalla bloqueada** ← el escenario del subsuelo del gimnasio. El que decide.

Cada escenario se prueba en iPhone y en Android, instalada y sin instalar.

---

## Cómo correr una prueba

1. Abrí la app en el teléfono.
2. Tocá **Pedir permiso de notificaciones** y **Probar sonido**. Hacé esto una vez por
   teléfono: el navegador no deja que la app haga ruido si no la tocaste antes.
3. Elegí **una sola estrategia** por corrida. Si activás varias, no vas a saber cuál te avisó.
4. Elegí el **escenario** y el **dispositivo** en las listas. Quedan guardados en el JSON.
5. Duración: **90 s** (para el escenario 5, usá 180 s y esperá los 5 minutos completos).
6. Tocá **Arrancar** y armá el escenario (bloqueá, cambiá de app, modo avión, lo que toque).
7. Cuando vuelvas, marcá **¿Te avisó?** Sí o No. Este paso no es opcional: el log sabe si el
   sistema creó la notificación, pero solo vos sabés si la escuchaste desde el bolsillo.
8. Anotá el resultado en la tabla de abajo.

Al terminar todo: **Exportar JSON** y pasame el archivo.

---

## Resultados

Marcá: `SÍ` avisó a tiempo · `TARDE` avisó pero fuera de hora · `NO` no avisó · `—` sin probar

### iPhone — instalada (pantalla de inicio) · iOS 18.7, Safari 27

| # | Escenario | A | B | C | D (contador) | E | Brecha JS | Notas |
|---|---|---|---|---|---|---|---|---|
| 1 | Abierta, pantalla encendida | SÍ (+11 ms) | SÍ (+12 ms) | NO | OK | — | 552 ms | C disparó a tiempo pero no sonó: Web Audio `suspended` |
| 2 | Abierta, pantalla bloqueada | — | TARDE (+14,8 s) | NO | OK | **SÍ (+167 ms)** | 0–2.000 ms con E; 27 s con B | E sonó en AirPods |
| 3 | Segundo plano, pantalla encendida | — | — | — | — | — | — | |
| 4 | Segundo plano, pantalla bloqueada | — | — | TARDE (+33 s) | OK | **SÍ (+163 ms)** | 54 s con C; 0 ms con E | |
| 5 | Bloqueada, bolsillo, 5 min | — | — | — | — | — | — | sin probar |
| 6 | **Modo avión + bloqueada** | — | — | — | — | — | — | **SIN PROBAR — falta esto** |

En los escenarios 2 y 4: desde la web no se distingue "pantalla bloqueada" de "cambié de
app". Las dos se ven igual. Lo que sí se mide con certeza es si la página siguió viva.

### iPhone — pestaña de Safari

| # | Escenario | A | B | C | D (contador) | E | Brecha JS | Notas |
|---|---|---|---|---|---|---|---|---|
| 1 | Abierta, pantalla encendida | | | | | | | |
| 2 | Abierta, pantalla bloqueada | | | | | | | |
| 3 | Segundo plano, pantalla encendida | | | | | | | |
| 4 | Segundo plano, pantalla bloqueada | | | | | | | |
| 5 | Bloqueada, bolsillo, 5 min | | | | | | | |
| 6 | **Modo avión + bloqueada** | | | | | | | |

### Android — instalada (pantalla de inicio)

| # | Escenario | A | B | C | D (contador) | E | Brecha JS | Notas |
|---|---|---|---|---|---|---|---|---|
| 1 | Abierta, pantalla encendida | | | | | | | |
| 2 | Abierta, pantalla bloqueada | | | | | | | |
| 3 | Segundo plano, pantalla encendida | | | | | | | |
| 4 | Segundo plano, pantalla bloqueada | | | | | | | |
| 5 | Bloqueada, bolsillo, 5 min | | | | | | | |
| 6 | **Modo avión + bloqueada** | | | | | | | |

### Android — pestaña de Chrome

| # | Escenario | A | B | C | D (contador) | E | Brecha JS | Notas |
|---|---|---|---|---|---|---|---|---|
| 1 | Abierta, pantalla encendida | | | | | | | |
| 2 | Abierta, pantalla bloqueada | | | | | | | |
| 3 | Segundo plano, pantalla encendida | | | | | | | |
| 4 | Segundo plano, pantalla bloqueada | | | | | | | |
| 5 | Bloqueada, bolsillo, 5 min | | | | | | | |
| 6 | **Modo avión + bloqueada** | | | | | | | |

### Modelos y versiones probados

Completar antes de sacar conclusiones: los resultados cambian mucho entre versiones.

| Teléfono | Sistema | Navegador | Ahorro de batería |
|---|---|---|---|
| | | | |
| | | | |

---

## Qué guarda el log

Todo va a IndexedDB y **sobrevive a que cierres la app**. Dos tablas:

- **corridas** — una por cada vez que apretás Arrancar: duración, hora de vencimiento,
  estrategias, escenario, dispositivo, si estaba instalada, si había red, y tu veredicto.
- **eventos** — cada cosa que pasó, con marca de tiempo real en milisegundos.

Campos que importan al leer el JSON:

| Campo | Qué significa |
|---|---|
| `venceEn` | Cuándo **debía** avisar |
| `disparoEn` | Cuándo **efectivamente** disparó |
| `desvioMs` | La diferencia. Negativo = adelantado, positivo = tarde |
| `brechaJsMs` | **Cuánto estuvo congelado el JavaScript.** El número clave |
| `origen` | `pagina` o `sw`. Si lo anotó el `sw`, la página estaba muerta |
| `avisoPercibido` | Tu veredicto humano: si lo escuchaste o no |
| `sw_no_disparo` | El worker despertó tarde y el timer nunca disparó: el navegador lo mató |

---

## Subirlo a internet, paso a paso

La app **necesita HTTPS**. Sin eso no hay service worker, no hay notificaciones y no se
puede instalar. Por eso no alcanza con abrir el archivo en el teléfono: hay que publicarlo.
Usamos **GitHub Pages**, que es gratis y no pide tarjeta.

### Si ya tenés el repo en GitHub

1. Entrá al repo en github.com.
2. Pestaña **Settings** (arriba a la derecha).
3. Menú de la izquierda: **Pages**.
4. En *Source* elegí **Deploy from a branch**.
5. En *Branch* elegí `master` y carpeta `/ (root)`. Tocá **Save**.
6. Esperá 1 o 2 minutos y recargá esa pantalla: aparece la dirección, con la forma
   `https://TU-USUARIO.github.io/fitapp/`.

### Cada vez que cambies algo

```bash
git add -A
git commit -m "lo que cambiaste"
git push
```

Esperá un minuto y recargá en el teléfono. **Ojo:** el service worker guarda la versión
vieja, así que la primera recarga te muestra lo anterior y la segunda lo nuevo. Si querés
forzarlo, cerrá la app instalada del todo y volvé a abrirla.

---

## Instalarlo en el teléfono

### iPhone (iOS 16.4 o más nuevo)

1. Abrí la dirección **en Safari**. No sirve Chrome en iPhone: en iOS solo Safari puede
   instalar PWAs.
2. Tocá el botón **Compartir** (el cuadradito con la flecha para arriba, abajo en el medio).
3. Bajá y tocá **Agregar a inicio**.
4. Tocá **Agregar**.
5. Abrila **desde el ícono de la pantalla de inicio**, no desde Safari. Es importante:
   en iOS las notificaciones solo funcionan si la abrís instalada.
6. Ya adentro, tocá **Pedir permiso de notificaciones** y aceptá.

### Android (Chrome)

1. Abrí la dirección en Chrome.
2. Menú de tres puntitos → **Instalar aplicación** (o **Agregar a la pantalla principal**).
3. Confirmá.
4. Abrila desde el ícono.
5. Tocá **Pedir permiso de notificaciones** y aceptá.

### Para el escenario 6 (modo avión)

Abrí la app **una vez con señal** antes de activar modo avión. Esa primera apertura es la
que guarda todo en el caché. Después ya abre sin conexión para siempre.

---

## Archivos del proyecto

| Archivo | Para qué |
|---|---|
| [index.html](index.html) | La interfaz |
| [styles.css](styles.css) | Estilos |
| [app.js](app.js) | Estrategias A, C, D, E + interfaz + log |
| [sw.js](sw.js) | Service worker: caché offline + estrategia B |
| [db.js](db.js) | IndexedDB. Se carga en la página **y** en el service worker |
| [manifest.webmanifest](manifest.webmanifest) | Datos de instalación de la PWA |
| [icons/](icons/) | Íconos generados |
| [tools/generar-iconos.mjs](tools/generar-iconos.mjs) | Regenera los íconos. Solo desarrollo |
| [tools/verificar.mjs](tools/verificar.mjs) | Revisa que no haya nada roto. Solo desarrollo |

Las dos herramientas de `tools/` no se usan en el teléfono. Están para no meter
dependencias ni archivos binarios que no podamos regenerar.

```bash
node tools/verificar.mjs      # revisa manifest, íconos, caché y sintaxis
node tools/generar-iconos.mjs # regenera los PNG
```
