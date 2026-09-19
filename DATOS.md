# Los datos de entrenamiento

Todo lo que tiene que ver con entrenamiento —qué ejercicios hay, cómo se arman las
rutinas, cuánto sube el peso, cuántos segundos de descanso— vive en archivos de datos.
**Nada de esto está escrito adentro del código.** Cambiar una regla no es una tarea de
programación.

> ## ⚠ Los números de la pestaña `equipos` son PROVISORIOS
>
> Los descansos y los `subir_kg` e `incremento_minimo_kg` de cada equipo son puestos por
> defecto para que la app funcione, **no son criterio de entrenamiento**. Están esperando
> que el socio los confirme o los cambie. El validador lo recuerda en cada corrida mientras
> `provisorio` siga en `true` en `reglas.json`.
>
> Ver las **preguntas abiertas** al final de este documento.

> ## ✅ La regla de progresión está cerrada
>
> La definió el socio y está implementada exactamente como la definió: cada serie con su
> propio objetivo, que sube de a una repetición, nunca baja, y el peso sube cuando todas
> las series llegan al techo del rango. **El peso nunca baja solo.**
>
> El deload automático que se había implementado antes —bajar 10% después de dos sesiones
> fallidas— ya no existe. Era la posición de Juan y el socio decidió lo contrario.
>
> Ver [LA REGLA DE PROGRESIÓN](#la-regla-de-progresión) más abajo.

## La regla que no se rompe

**La planilla de Google es la única fuente de verdad. Los archivos de `datos/*.json` se
generan a partir de ella y NUNCA se editan a mano.** Si alguien edita un JSON
directamente, el próximo volcado se lo pisa sin avisar.

```
Planilla de Google  →  exportar a TSV  →  node tools/planilla-a-json.mjs  →  datos/*.json
```

## Cómo exportar desde Google Sheets

En Sheets: **Archivo → Descargar → Valores separados por tabuladores (.tsv)**, una
pestaña por vez.

**Importante: TSV, no CSV.** En castellano, Sheets escribe los decimales con coma
(`2,5`), y en un CSV la coma también separa columnas. Eso rompe todo de formas raras y
difíciles de ver. Con tabuladores el problema no existe.

## Reglas para el que carga los datos

1. **No cambiar los nombres de las columnas.** El script las busca por nombre y, si falta
   alguna, avisa cuál.
2. **No cambiar un `id` que ya se usó.** El historial de entrenamiento de cada usuario
   apunta a esos identificadores. Si cambiás `press-banca` por `press_banca`, todos los
   usuarios pierden el historial de ese ejercicio. Agregar ejercicios nuevos es gratis;
   renombrar los viejos, no.
3. **Los `id` van en minúscula, sin acentos y con guiones:** `press-banca`, `jalon-al-pecho`.
4. **Las listas van separadas por coma** dentro de una misma celda: `tríceps, hombros`.
5. **Las casillas de sí/no** se escriben `si` o `no`.
6. **Dejar las filas vacías afuera.** Una fila a medio llenar es un error, no un borrador.

---

## Las pestañas de la planilla

### Pestaña `equipos`

De a cuánto se puede subir el peso en cada tipo de equipo. Esto es lo que evita que la app
sugiera 41 kg cuando con una barra solo existen 40 o 42,5.

| `equipo_id` | `nombre` | `incremento_minimo_kg` | `peso_base_kg` | `subir_kg` |
|---|---|---|---|---|
| barra | Barra olímpica | 2,5 | 20 | 2,5 |
| barra-liviana | Barra liviana | 2,5 | 10 | 2,5 |
| barra-tecnica | Barra técnica | 1 | 7,5 | 1 |
| mancuernas | Mancuernas | 2 | 0 | 2 |
| maquina | Máquina | 5 | 0 | 5 |
| maquina-guiada | Multipower (barra guiada) | 2,5 | 0 | 2,5 |
| polea | Polea | 2,5 | 0 | 2,5 |
| disco | Disco suelto | 2,5 | 0 | 2,5 |
| banda | Banda elástica | 0 | 0 | 0 |
| peso-corporal | Peso corporal | 0 | 0 | 0 |
| lastre | Lastre (disco o cinturón) | 1,25 | 0 | 1,25 |
| asistencia | Asistencia (máquina o banda) | 5 | 0 | 5 |

- **`incremento_minimo_kg`**: el salto más chico que se puede hacer. En una barra son 2,5 kg
  porque el disco más chico es de 1,25 y van dos, uno de cada lado. **Poné 0 para peso corporal.**
- **`peso_base_kg`**: el piso. Una barra olímpica vacía ya pesa 20 kg y no se puede levantar menos.
- **`subir_kg`**: cuántos kilos sumar cuando todas las series llegan al techo del rango.

> **La banda va con los tres números en cero, igual que peso corporal.** No se mide en
> kilos: se progresa con repeticiones, o cambiando de banda. Con el incremento en 0 la app
> ni siquiera muestra el campo del peso, que es lo correcto — si mostrara un número, estaría
> pidiendo un dato que no existe.

**Los tres últimos no son aparatos, son modos de carga.** `peso-corporal`, `lastre` y
`asistencia` no se escriben en la columna `equipo` de un ejercicio: salen solos de las
casillas `es_peso_corporal`, `admite_lastre` y `admite_asistencia`. En la planilla, una
dominada asistida lleva `equipo: peso-corporal` (el aparato es la barra) y la casilla
`admite_asistencia` en `si`; la app sabe que el número que anota el usuario son los kilos
de ayuda, y usa el escalón de `asistencia` y no el de la barra.

> **Por qué `subir_kg` en kilos y no en porcentaje.** Antes esto era un porcentaje y era un
> parámetro que mentía. Con 2,5% sobre 60 kg el salto da 1,5 kg, o sea menos que el disco
> más chico, así que el redondeo se lo comía y siempre terminaba subiendo el incremento del
> equipo. El porcentaje recién empezaba a mandar arriba de los 100 kg en barra, y nuestro
> usuario es un principiante que no llega ahí en el primer año. El socio habría creído que
> lo estaba regulando sin que pasara nada.

### Pestaña `reglas`

Dos números, y nada más:

| `clave` | `valor` |
|---|---|
| descanso_por_defecto_seg | 90 |
| descanso_entre_ejercicios_seg | 120 |

**Dos descansos distintos.** `descanso_por_defecto_seg` es entre series del mismo
ejercicio. `descanso_entre_ejercicios_seg` es al terminar un ejercicio y pasar al
siguiente, que en la práctica es más largo: cambiás de aparato y capaz tenés que esperar
que se desocupe.

> **La progresión no tiene números que ajustar.** Antes había cuatro
> (`bajar_porcentaje`, `sesiones_fallidas_para_bajar`, `multiplicador_si_fue_facil`,
> `salto_maximo_porcentaje`) y murieron todos con la regla vieja. En la regla nueva los
> objetivos salen del rango de repeticiones de cada ejercicio, y los kilos que se suben
> salen del `subir_kg` del equipo o del ejercicio. No hay ninguna perilla suelta. El
> validador avisa si alguien vuelve a pegar los parámetros viejos.

---

## LA REGLA DE PROGRESIÓN

La cerró el socio. **Está implementada exactamente así.** Si algún día hay que cambiarla,
se cambia acá y en `logica/progresion.js`, que es el único lugar del código donde vive.

### Cada serie tiene su propio objetivo

Esto es lo que la hace distinta de casi cualquier app: no hay un número para todo el
ejercicio, hay uno por serie, y cada uno avanza por su cuenta.

1. **El ejercicio tiene un rango** de repeticiones, definido en la pestaña `plan`.
   Por ejemplo, 6 a 10.

2. **Al estrenar un peso**, cada serie arranca con su objetivo:

   | Serie | Objetivo |
   |---|---|
   | 1 | el piso del rango (6) |
   | 2 | el piso más uno (7) |
   | última | **al fallo**, sin número |

3. **Después de cada sesión, serie por serie:** si llegó o pasó su objetivo, el objetivo de
   esa serie sube **una** repetición para la próxima, con tope en el techo del rango. Si no
   llegó, queda igual. **Nunca baja.**

4. **Cuando todas las series llegan al techo**, en la siguiente sube el peso (el `subir_kg`
   del equipo, o el del ejercicio si está cargado) y los objetivos vuelven a piso, piso+1,
   fallo.

5. **El peso nunca baja solo.** No hay deload automático.

### Cómo se ve en ocho semanas

Rango 6-10, tres series, barra que sube de a 2,5 kg:

```
        objetivos          lo que hizo
  s1     6 ·  7 · fallo  →   6 /  7 /  9
  s2     7 ·  8 · fallo  →   7 /  8 / 10
  s3     8 ·  9 · fallo  →   8 /  9 / 10
  s4     9 · 10 · fallo  →   9 / 10 / 10
  s5    10 · 10 · fallo  →  10 / 10 / 10   ← todas al techo
  s6     6 ·  7 · fallo      con 2,5 kg más
```

### Por qué así

**Una serie estancada no frena a las otras.** Si llegás a tu objetivo en la serie 1 pero no
en la 2, la 1 sigue avanzando y la 2 te espera. Con un solo número para todo el ejercicio,
la serie más floja frenaba a todas.

**Un mal día no te castiga.** Dormiste mal, viniste cansado, no llegaste a nada: los
objetivos quedan donde estaban. La semana que viene retomás exactamente ahí. Nada retrocede.

**El que arranca liviano se corrige solo.** Si el peso que eligió era trivial, hace el
techo del rango en las tres series a la primera y el peso sube de una. No hace falta que la
app le pregunte nada.

**La última al fallo da el margen de arriba.** Es la serie que dice cuánto le sobra de
verdad, sin que tenga que estimarlo.

### Lo que la regla NO cubre

En los ejercicios **sin kilos** —peso corporal puro, banda elástica— llegar al techo del
rango no puede subir nada, porque no hay qué sumar. Ahí la app deja los objetivos en el
techo y lo dice en pantalla. Es una consecuencia de la regla, no un error: si el socio
quiere que esos ejercicios sigan progresando, hay que definirle una salida (más
repeticiones, otra banda, una variante más difícil).

### El peso de arranque lo elige el usuario

**La app no recomienda con cuántos kilos empezar.** El socio fue explícito: nadie que no
esté ahí puede saberlo. La primera vez que aparece un ejercicio, el campo del peso está
vacío, el usuario prueba en el gimnasio y anota el que haya usado.

Por eso ya no existe la columna `peso_inicial_kg`. Si quedó cargada en la planilla, se
ignora y el validador avisa.

### Lo que se guarda por serie

El historial guarda, en cada serie, **el objetivo que tenía además de lo que se hizo**.

No es redundante: 7 repeticiones es un objetivo cumplido si le pedían 7, y uno fallado si
le pedían 9. El número solo no lo dice, y el objetivo no se puede reconstruir después. Es
el mismo tipo de dato que antes eran los botones de esfuerzo.

---

### Pestaña `ejercicios`

| Columna | Obligatoria | Qué es |
|---|---|---|
| `id` | **sí** | Identificador estable. No se cambia nunca. |
| `nombre` | **sí** | Cómo se muestra. |
| `nombre_alternativo` | no | Cómo lo llaman en otros lados, para poder buscarlo. |
| `equipo` | no | Uno de los `equipo_id` de la pestaña `equipos`. Vacío se acepta, pero la app le supone saltos de 1 kg y el validador lo avisa. |
| `grupo` | **sí** | Grupo muscular principal. **Lista cerrada**, ver abajo. |
| `sub_bloque` | no | El pool de ejercicios equivalentes: todos los que sirven para lo mismo y se pueden cambiar uno por otro (`sentadillas`, `hip thrust`, `femoral`). **Todavía no se usa para nada**, ver abajo. |
| `musculos_secundarios` | no | Lista separada por coma. **Lista cerrada**, ver abajo. Lo necesitan las reglas del armador. |
| `descanso_seg` | no | Descanso entre series propio de este ejercicio. Si está vacío, manda el de la rutina, y si tampoco está, el de `reglas`. |
| `video` | no | Link completo de YouTube. Se abre afuera; **no** se incrusta el reproductor. |
| `nivel` | no | `principiante`, `intermedio` o `avanzado`. Lo necesita el armador. |
| `es_unilateral` | no | `si` si se hace de a un lado. Define si el peso se registra una vez o por lado. |
| `es_peso_corporal` | no | `si` si el cuerpo aporta la carga base. |
| `admite_lastre` | no | `si` si se le puede agregar peso (dominadas con disco). |
| `admite_asistencia` | no | `si` si se puede hacer con ayuda de máquina o banda. |
| `subir_kg` | no | De a cuántos kilos sube **este** ejercicio, pisando el de su equipo. Vacío = manda el equipo. Ver abajo. |
| `sustitutos` | no | Lista de `id`, separada por coma. Qué hacer si la máquina está ocupada. |
| `tecnica` | no | Texto libre. |
| `errores_comunes` | no | Texto libre. |
| `imagen` | no | Nombre de archivo o URL. |
| `notas` | no | Texto libre. |

> **Una celda vacía no es un error.** Las columnas marcadas "no" son las que el socio
> completa cuando puede. Mientras estén vacías, la app usa su valor por defecto y el
> validador las cuenta en un resumen al final de la corrida (`descanso_seg: 184 de 184`),
> en vez de escupir un renglón de error por celda. Cientos de errores son lo mismo que
> ninguno: nadie los lee y los problemas de verdad se pierden en el medio.

**Cómo llega esto al código.** La planilla escribe `es_unilateral` con "si" o "no", las
listas con comas adentro de una celda, y lo que falta como celda vacía. El código de
adentro usa `esUnilateral` con verdadero o falso. La traducción pasa en **un solo lugar**,
`logica/catalogo.js`, al cargar. Si el socio agrega una columna o le cambia el nombre, se
toca ese archivo y nada más. El validador usa esa misma función, así que lo que revisa es
exactamente lo que la app termina viendo.

**La columna `subir_kg`: cuando un equipo no alcanza.** El `subir_kg` vive en la pestaña
`equipos`, o sea que todos los ejercicios de barra suben de a 2,5 kg. Eso es discutible: el
press militar progresa mucho más lento que la sentadilla y las dos usan barra. Esta columna
existe para eso — se carga solo en los ejercicios donde el número del equipo no sirve, y el
resto sigue mandándose por el equipo.

Hoy está **vacía en toda la planilla**, a propósito: el socio la va a completar con uso
real, cuando haya datos de gente entrenando, en vez de adivinar ahora.

> **Ojo con un número que no se puede armar.** Un `subir_kg` de 1 kg en un ejercicio de
> barra no hace nada: la barra salta de a 2,5 y el redondeo se lo come. Sería el mismo
> error que ya nos comimos con el porcentaje de subida. El validador lo rechaza y te dice
> cuál es el escalón mínimo de ese equipo.

**Las tres casillas de carga y qué significan.** Definen cómo se lee el número de kilos que
registra el usuario:

| Casillas | Qué quiere decir el número | Progresar es |
|---|---|---|
| ninguna | Los kilos que levanta | subir |
| `es_peso_corporal` | No hay kilos | sumar repeticiones |
| `es_peso_corporal` + `admite_lastre` | Los kilos **agregados** (0 = solo el cuerpo) | subir |
| `es_peso_corporal` + `admite_asistencia` | Los kilos de **ayuda** de la máquina | **bajar** |
| `es_unilateral` | El peso de **UNA** mancuerna o **UN** lado, nunca la suma | subir |

**No se pueden marcar lastre y asistencia a la vez**: un solo número no puede querer decir
"kilos que agrego" y "kilos de ayuda" al mismo tiempo. Si hace falta cubrir las dos etapas,
van dos ejercicios distintos (`dominadas-asistidas` y `dominadas`) unidos por `sustitutos`.
El validador lo marca como error.

### Pestaña `conceptos`

Los videos que explican un concepto de entrenamiento suelto: qué es el RIR, qué es un
drop set, qué es un EMOM. Salen a `datos/conceptos.json`. Hoy son 16.

| Columna | Obligatoria | Qué es |
|---|---|---|
| `id` | **sí** | Identificador estable. |
| `titulo` | **sí** | Cómo se muestra. |
| `video` | no | Link completo de YouTube. |
| `texto` | no | La explicación escrita. La escribe el socio; hoy están todos vacíos. |

Se cargan y quedan disponibles en `catalogo.conceptos`. **Todavía no hay pantalla que los
muestre.**

### Pestaña `rutinas`

| `rutina_id` | `rutina_nombre` | `descripcion` |
|---|---|---|
| full-body-principiante | Full body para principiantes | Tres días por semana |

### Pestaña `dias`

Una fila por cada día de cada rutina.

| `rutina_id` | `dia_id` | `dia_nombre` | `orden` |
|---|---|---|---|
| full-body-principiante | a | Día A | 1 |
| full-body-principiante | b | Día B | 2 |

### Pestaña `plan`

Qué ejercicios tiene cada día. Una fila por ejercicio.

| `rutina_id` | `dia_id` | `orden` | `ejercicio_id` | `series` | `reps_min` | `reps_max` | `descanso_seg` | `descanso_despues_seg` |
|---|---|---|---|---|---|---|---|---|
| full-body-principiante | a | 1 | sentadilla-barra-libre | 3 | 8 | 12 | 120 | |
| full-body-principiante | a | 2 | press-banca-plano-barra-libre | 3 | 8 | 12 | 120 | 180 |

- **`reps_min` y `reps_max` son el rango del que sale todo.** De ahí salen los objetivos de
  cada serie al estrenar un peso (`reps_min`, `reps_min`+1, fallo), el tope hasta donde
  pueden subir, y la condición para subir el peso. Es la columna que más decide de la
  planilla entera.
- `reps_min` y `reps_max` **no pueden ser iguales**: sin rango, los objetivos no tienen a
  dónde avanzar y el peso nunca sube.
- `series` define cuántos objetivos hay. **La última siempre va al fallo**, sean 2, 3 o 5.
- `descanso_seg` es entre series de ese ejercicio.
- `descanso_despues_seg` es opcional: solo si este ejercicio necesita un descanso distinto
  al general antes de pasar al siguiente. Vacío = se usa el de `reglas`.
- `orden` define en qué orden aparecen en pantalla.

---

## Revisar antes de publicar

```bash
node tools/validar-datos.mjs
```

Revisa todo y explica en castellano qué está mal, señalando la fila:

```
ERROR ejercicio 2 ("press-banca"): el peso inicial 21 kg no se puede armar con
      Barra olímpica, que sube de a 2.5 kg desde 20 kg
ERROR ejercicio 13 ("dominadas") tiene marcadas lastre Y asistencia. Un solo número no
      puede querer decir "kilos que agrego" y "kilos de ayuda" al mismo tiempo.
ERROR rutina 1, día 1, ejercicio 3 ("remo-barra"): repsMin (15) es mayor que repsMax (10).
```

También conviene correr los tests, que verifican que las reglas de progresión sigan dando
resultados sensatos con los números nuevos:

```bash
node --test
```

Si el socio sube el incremento de la barra a 20 kg, por ejemplo, los tests se quejan antes
de que eso llegue al teléfono de alguien.

---

## Preguntas abiertas para el socio

Ninguna bloquea la carga de datos, pero las dos cambian números que hoy están puestos por
defecto.

1. **¿Qué barras hay de verdad en el gimnasio, además de la olímpica de 20 kg?** Dejamos
   cargadas `barra` (20 kg), `barra-liviana` (10 kg) y `barra-tecnica` (7,5 kg), pero es
   una suposición. Hace falta confirmar cuáles existen y cuánto pesan, y sobre todo **con
   qué barra arranca un principiante que no puede mover la olímpica vacía**. Hoy, si un
   ejercicio dice `equipo: barra`, el piso es 20 kg y no hay salida. La otra respuesta
   posible es que ese principiante no debería estar haciendo ese ejercicio todavía, y que
   corresponde mandarlo al `sustituto` con mancuernas o máquina. Es decisión de criterio,
   no técnica.

2. **¿Cuánta ayuda da la máquina de asistidas, y de a cuánto salta?** Pusimos saltos de
   5 kg, que es lo común, pero depende del aparato. Importa más de lo que parece: en los
   asistidos el número que anota el usuario son los kilos de AYUDA, y progresar es
   bajarlos. Si el escalón está mal, la progresión de las dominadas asistidas avanza al
   ritmo equivocado y nadie se da cuenta.

---

## Los unilaterales: qué número se anota

**Regla: se anota SIEMPRE el peso de una sola mancuerna, o de un solo lado. Nunca la suma.**

| Ejercicio | Qué se anota |
|---|---|
| Zancadas con una mancuerna de 20 kg **en cada mano** | **20** |
| Remo a un brazo con 20 kg | **20** |
| Press de banca con barra de 60 kg | 60 |

Los dos primeros casos anotan lo mismo, aunque en las zancadas el usuario esté sosteniendo
40 kg en total. Es a propósito, por tres motivos:

1. **Es el número que dice la mancuerna.** Nadie tiene que hacer una cuenta con las manos
   transpiradas entre serie y serie.
2. **Es como habla la gente.** "Hago curl con 12" quiere decir 12 por mano.
3. **Hace que la progresión funcione.** Los saltos son los de la mancuerna (de a 2 kg). Si
   se anotara la suma, los saltos serían de 4 y no coincidirían con lo que hay en el rack.

**Las repeticiones también se anotan por lado.** Si hizo 10 con cada brazo, anota 10.

**Para el volumen, la app multiplica por dos.** Es la única cuenta donde importa el total,
y la hace el programa, no el usuario.

Marcar bien `es_unilateral` importa: si queda sin marcar, el volumen de ese ejercicio
aparece a la mitad en el historial.

---

## Listas cerradas: `grupo` y `musculos_secundarios`

No se puede escribir cualquier cosa. Si una fila dice `pecho` y otra `Pectoral`, para la
app son dos grupos distintos y el armador de rutinas reparte mal el volumen sin que nadie
vea un error. El validador rechaza cualquier valor fuera de estas listas y dice cuáles son
las opciones.

**`grupo`** (uno solo por ejercicio):

`pecho` · `espalda` · `hombro` · `bíceps` · `tríceps` · `pierna` · `glúteos`

Esta lista salió de la planilla del socio, no al revés. Antes decía `piernas`, `hombros` y
un `brazos` que juntaba todo; el socio los carga en singular y separa bíceps de tríceps,
que para repartir volumen es más útil. Si hace falta un grupo nuevo —`core`, por ejemplo,
que hoy no existe en la planilla— se agrega a `GRUPOS` en `tools/validar-datos.mjs`.

**`musculos_secundarios`** (varios, separados por coma). Además de todos los de arriba:

`core` · `antebrazos` · `cuádriceps` · `isquiotibiales` · `gemelos` · `dorsales` ·
`trapecio` · `lumbares` · `abductores` · `aductores`

---

## Los `sub_bloque`: los pools de ejercicios equivalentes

Un `sub_bloque` junta los ejercicios que sirven para lo mismo y se pueden cambiar uno por
otro: todas las variantes de sentadilla en `sentadillas`, todas las de hip thrust en
`hip thrust`. Hoy la planilla trae 25.

**Todavía no se construyó nada con esto.** Se carga, se agrupa y se deja guardado, nada
más. La app los tiene disponibles en `catalogo.porSubBloque` y hay una función
`equivalentesDe()` que no llama nadie todavía. Es el dato que van a necesitar dos cosas
que vienen después: el armador de rutinas, y el botón de "la máquina está ocupada, dame
otro".

Lo único que hace el validador con ellos es contarlos e informarlos, para que si un mismo
sub-bloque quedó escrito de dos formas (`polea baja` y `polea-baja`) se vea de una.

Si falta un valor que hace falta de verdad, se agrega a la lista a propósito. Lo que no se
puede es inventarlo en una celda.

---

## Racha, XP e insignias — dónde van a vivir

**Todavía no está implementado.** Esto es solo la decisión de dónde va cada cosa, tomada
ahora para no tener que migrar el historial de los usuarios más adelante.

### La decisión de fondo: la racha y el XP se calculan, no se guardan

Salen de las sesiones que ya están en el historial, cada vez que se necesitan. **No se
guarda un contador.**

Dos motivos:

1. **Un contador guardado se puede desincronizar del historial**, y cuando eso pasa no hay
   forma de saber cuál de los dos tiene razón. Si la racha se calcula, siempre coincide con
   lo que el usuario efectivamente registró.
2. **Cambiar la fórmula no obliga a migrar a nadie.** Si el socio decide que la racha tolera
   un día de descanso, se cambia la fórmula y todo el pasado se recalcula solo.

El costo es recalcular al abrir la app, que con un año de historial son unos pocos
milisegundos. Barato.

### Lo único que se guarda

Lo que **no** se puede deducir del historial: qué insignias ya se festejaron, para no
volver a mostrar la misma animación dos veces. Va en el almacén de ajustes que ya existe.

### Las insignias son datos, como todo lo demás

Van a vivir en `datos/insignias.json`, generado desde una pestaña `insignias` de la misma
planilla. Las condiciones son datos, no código: el socio va a poder agregar una insignia
sin que nadie programe.

| `id` | `nombre` | `descripcion` | `condicion` | `objetivo` | `ejercicio_id` | `xp` |
|---|---|---|---|---|---|---|
| primera-sesion | Arrancaste | Completaste tu primer entrenamiento | sesiones-totales | 1 | | 50 |
| semana-completa | Semana completa | Entrenaste 3 días en una semana | sesiones-en-semana | 3 | | 100 |
| constancia-30 | Un mes | 30 días seguidos sin faltar | dias-seguidos | 30 | | 500 |
| banca-60 | Press de 60 | Levantaste 60 kg en press de banca | peso-en-ejercicio | 60 | press-banca | 200 |

Las condiciones previstas son `sesiones-totales`, `dias-seguidos`, `volumen-total`,
`peso-en-ejercicio` y `sesiones-en-semana`. Si hace falta otra, se agrega al código una vez
y después el socio la usa cuantas veces quiera.

**Esto no se construye todavía.** Está acá para que cuando se construya no haya que tocar
nada de lo que ya está guardado.
