# Los datos de entrenamiento

Todo lo que tiene que ver con entrenamiento —qué ejercicios hay, cómo se arman las
rutinas, cuánto sube el peso, cuántos segundos de descanso— vive en archivos de datos.
**Nada de esto está escrito adentro del código.** Cambiar una regla no es una tarea de
programación.

> ## ⚠ Los números de la pestaña `reglas` son PROVISORIOS
>
> Todos los valores de la pestaña `reglas` —y los `subir_kg` de cada equipo— son puestos
> por defecto para que la app funcione, **no son criterio de entrenamiento**. Están
> esperando que el socio los confirme o los cambie. El validador lo recuerda en cada
> corrida mientras `provisorio` siga en `true` en `reglas.json`.
>
> Ver las **preguntas abiertas** al final de este documento.

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
| polea | Polea | 2,5 | 0 | 2,5 |
| peso-corporal | Peso corporal | 0 | 0 | 0 |
| lastre | Lastre (disco o cinturón) | 1,25 | 0 | 1,25 |
| asistencia | Asistencia (máquina o banda) | 5 | 0 | 5 |

- **`incremento_minimo_kg`**: el salto más chico que se puede hacer. En una barra son 2,5 kg
  porque el disco más chico es de 1,25 y van dos, uno de cada lado. **Poné 0 para peso corporal.**
- **`peso_base_kg`**: el piso. Una barra olímpica vacía ya pesa 20 kg y no se puede levantar menos.
- **`subir_kg`**: cuántos kilos sumar cuando el usuario completa el rango de repeticiones.

> **Por qué `subir_kg` en kilos y no en porcentaje.** Antes esto era un porcentaje y era un
> parámetro que mentía. Con 2,5% sobre 60 kg el salto da 1,5 kg, o sea menos que el disco
> más chico, así que el redondeo se lo comía y siempre terminaba subiendo el incremento del
> equipo. El porcentaje recién empezaba a mandar arriba de los 100 kg en barra, y nuestro
> usuario es un principiante que no llega ahí en el primer año. El socio habría creído que
> lo estaba regulando sin que pasara nada.

### Pestaña `reglas`

Los números de la progresión. Dos columnas nada más. **Todos provisorios.**

| `clave` | `valor` |
|---|---|
| descanso_por_defecto_seg | 90 |
| descanso_entre_ejercicios_seg | 120 |
| bajar_porcentaje | 10 |
| sesiones_fallidas_para_bajar | 2 |

Cómo se leen, en orden:

1. El usuario se queda con el mismo peso hasta llegar al **techo de repeticiones en todas
   las series**.
2. Cuando lo logra, el peso sube el `subir_kg` de su equipo y las repeticiones vuelven al
   piso. Si ese salto no cae en una carga que exista, se redondea a la más cercana que sí;
   y si el redondeo devolviera el mismo peso, sube un escalón igual — si no, el usuario
   quedaría trabado para siempre.
3. Si pasa `sesiones_fallidas_para_bajar` veces seguidas sin completar el rango, el peso
   baja `bajar_porcentaje` y vuelve a subir desde ahí.

> **Por qué el deload sí sigue siendo un porcentaje.** Acá el porcentaje no miente: a
> cualquier carga razonable, un 10% da más que el disco más chico, y además tiene sentido
> que un deload sea proporcional a lo que levantás. Igual tiene un piso de un escalón para
> que no se quede en cero cuando la carga es muy baja.

**Dos descansos distintos.** `descanso_por_defecto_seg` es entre series del mismo
ejercicio. `descanso_entre_ejercicios_seg` es al terminar un ejercicio y pasar al
siguiente, que en la práctica es más largo: cambiás de aparato y capaz tenés que esperar
que se desocupe.

### Pestaña `ejercicios`

| Columna | Obligatoria | Qué es |
|---|---|---|
| `id` | **sí** | Identificador estable. No se cambia nunca. |
| `nombre` | **sí** | Cómo se muestra. |
| `nombre_alternativo` | no | Cómo lo llaman en otros lados, para poder buscarlo. |
| `equipo` | **sí** | Uno de los `equipo_id` de la pestaña `equipos`. |
| `grupo` | **sí** | Grupo muscular principal. |
| `musculos_secundarios` | no | Lista separada por coma. Lo necesitan las reglas del armador de rutinas. |
| `nivel` | no | `principiante`, `intermedio` o `avanzado`. Lo necesita el armador. |
| `es_unilateral` | no | `si` si se hace de a un lado. Define si el peso se registra una vez o por lado. |
| `es_peso_corporal` | no | `si` si el cuerpo aporta la carga base. |
| `admite_lastre` | no | `si` si se le puede agregar peso (dominadas con disco). |
| `admite_asistencia` | no | `si` si se puede hacer con ayuda de máquina o banda. |
| `peso_inicial_kg` | no | Con cuánto arrancar la primera vez. Vacío = lo elige el usuario. |
| `sustitutos` | no | Lista de `id`, separada por coma. Qué hacer si la máquina está ocupada. |
| `tecnica` | no | Texto libre. |
| `errores_comunes` | no | Texto libre. |
| `imagen` | no | Nombre de archivo o URL. |
| `notas` | no | Texto libre. |

> **`peso_inicial_kg` va acá y no en la rutina.** Es propiedad del ejercicio: el press de
> banca arranca en 20 kg independientemente de en qué rutina aparezca. Si estuviera en cada
> rutina, un mismo ejercicio podría tener tres pesos iniciales distintos sin que nadie se
> entere. La rutina lo puede pisar, pero tiene que decirlo explícitamente.

**Las tres casillas de carga y qué significan.** Definen cómo se lee el número de kilos que
registra el usuario:

| Casillas | Qué quiere decir el número | Progresar es |
|---|---|---|
| ninguna | Los kilos que levanta | subir |
| `es_peso_corporal` | No hay kilos | sumar repeticiones |
| `es_peso_corporal` + `admite_lastre` | Los kilos **agregados** (0 = solo el cuerpo) | subir |
| `es_peso_corporal` + `admite_asistencia` | Los kilos de **ayuda** de la máquina | **bajar** |

**No se pueden marcar lastre y asistencia a la vez**: un solo número no puede querer decir
"kilos que agrego" y "kilos de ayuda" al mismo tiempo. Si hace falta cubrir las dos etapas,
van dos ejercicios distintos (`dominadas-asistidas` y `dominadas`) unidos por `sustitutos`.
El validador lo marca como error.

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

| `rutina_id` | `dia_id` | `orden` | `ejercicio_id` | `series` | `reps_min` | `reps_max` | `descanso_seg` | `descanso_despues_seg` | `peso_inicial_kg` |
|---|---|---|---|---|---|---|---|---|---|
| full-body-principiante | a | 1 | sentadilla | 3 | 8 | 12 | 120 | | |
| full-body-principiante | a | 2 | press-banca | 3 | 8 | 12 | 120 | 180 | |

- `reps_min` y `reps_max` **no pueden ser iguales**: sin rango, el peso nunca sube.
- `descanso_seg` es entre series de ese ejercicio.
- `descanso_despues_seg` es opcional: solo si este ejercicio necesita un descanso distinto
  al general antes de pasar al siguiente. Vacío = se usa el de `reglas`.
- `peso_inicial_kg` **normalmente va vacío**: el valor vive en la pestaña `ejercicios`. Se
  completa solo cuando esta rutina en particular necesita arrancar distinto.
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

Ninguna de estas bloquea la carga de datos, pero todas cambian números que hoy están
puestos por defecto.

1. **¿Qué barras hay de verdad en el gimnasio?** Dejamos `barra` (20 kg), `barra-liviana`
   (10 kg) y `barra-tecnica` (7,5 kg). Hace falta confirmar cuáles existen y cuánto pesan,
   y sobre todo **con qué barra arranca un principiante que no puede mover la olímpica
   vacía**. Hoy, si un ejercicio dice `equipo: barra`, el piso es 20 kg y no hay salida.
   La otra respuesta posible es que ese principiante no debería estar haciendo ese
   ejercicio todavía, y que corresponde mandarlo al `sustituto` con mancuernas o máquina.
   Es decisión de criterio, no técnica.

2. **¿`subir_kg` tiene que ser el mismo para todos los ejercicios de un mismo equipo?** Hoy
   sí, porque vive en la pestaña `equipos`. Subir de a 2,5 kg en sentadilla y en press
   militar es discutible: el press militar progresa mucho más lento. Si hace falta, se
   agrega una columna `subir_kg` en `ejercicios` que pise la del equipo. Avisar y lo agrego.

3. **¿Cuántos kilos de ayuda tiene la máquina de asistidas y de a cuánto salta?** Pusimos
   saltos de 5 kg, que es lo común, pero depende del aparato.

4. **Confirmar los cuatro números de la pestaña `reglas`**: 90 s entre series, 120 s entre
   ejercicios, deload de 10%, y dos sesiones fallidas antes de bajar.

5. **Los botones Fácil / Justo / No llegué.** Está decidido que reemplazan al RIR y que se
   registran desde el día uno. Falta decidir si además modifican la progresión — ver la
   discusión en el historial del proyecto. Hoy **se guardan pero no deciden nada**.
