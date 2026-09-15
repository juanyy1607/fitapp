# CLAUDE.md — Contexto del proyecto

## Qué es esto

App de entrenamiento de gimnasio, en español, para principiantes en Latinoamérica.

Equipo de dos personas:
- **Juan** — desarrollo asistido por IA. No es programador de formación, pero entiende la
  lógica y sabe leer código. Todo lo que se escriba tiene que poder mantenerlo él.
- **Socio** — aporta todo el criterio de entrenamiento (rutinas, progresiones, técnica).

## Decisiones ya tomadas

No las cuestiones salvo que haya un problema técnico real y concreto.

- **Se lanza como PWA instalable primero.** Evita los costos de entrada a App Store y
  Google Play.
- **Tiene que poder empaquetarse como app nativa más adelante SIN reescribir.** El stack
  se elige con este requisito adelante.
- **Los datos arrancan 100% locales en el dispositivo.** La nube viene después.
- **Presupuesto objetivo: cero.** Solo capas gratuitas.
- **Todo tiene que funcionar sin señal.** La app se usa en el subsuelo de un gimnasio,
  donde no hay datos móviles.

## Estado actual

Fase 0: banco de pruebas. Todavía NO se escribió código de producto.

Antes de elegir la arquitectura hay que resolver una incógnita técnica que la condiciona
entera: **si una PWA puede avisar al usuario a los 90 segundos con el teléfono bloqueado
en el bolsillo y sin señal.**

Lo que hay en este repo hoy es el banco de pruebas para medirlo en teléfonos reales.
Ver [README.md](README.md).

## Restricciones técnicas del banco de pruebas

- Vanilla HTML + CSS + JS. **Sin frameworks, sin build step, sin dependencias.**
- Tiene que subirse a un hosting estático y abrirse en un teléfono en menos de 5 minutos.
- Todo el texto de la interfaz, en español rioplatense.

## Cómo trabajar en este proyecto

- **Explicar cada decisión técnica en lenguaje llano antes de implementarla.** Si Juan no
  entiende el código, no lo puede mantener.
- **Si algo no se puede hacer o es mala idea, decirlo y explicar por qué.** No implementarlo
  mal para cumplir con el pedido.
- **No agregar dependencias sin preguntar primero.**
- **Revisar el propio trabajo antes de darlo por terminado.** Verificar que el manifest sea
  válido, que el service worker se registre sin errores y que la app cargue offline.
- Las instrucciones de despliegue se escriben asumiendo que Juan nunca lo hizo antes.

## Lo que sabemos de la incógnita del temporizador

Investigación previa, a confirmar con mediciones reales:

- El JavaScript de la página se suspende al bloquear la pantalla, en iOS y en Android.
- **Notification Triggers** (programar una notificación local sin servidor) nunca llegó a
  ningún navegador. Quedó como propuesta desde 2019.
- **Web Push** funciona en PWAs instaladas desde iOS 16.4, pero necesita servidor y señal,
  y la entrega es "mejor esfuerzo", no puntual. Inservible en el subsuelo.
- **Screen Wake Lock** sirve solo si la pantalla queda encendida.

Corolario: no existe una API para programar una notificación local a futuro. La única vía
es **mantener la página viva** para que un `setTimeout` común llegue a ejecutarse. Por eso
el banco de pruebas mide, sobre todo, cuánto sobrevive la página en cada escenario.
