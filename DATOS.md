# Los datos de entrenamiento

Todo lo que tiene que ver con entrenamiento —qué ejercicios hay, cómo se arman las
rutinas, cuánto sube el peso, cuántos segundos de descanso— vive en archivos de datos.
**Nada de esto está escrito adentro del código.** Cambiar una regla no es una tarea de
programación.

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
4. **Dejar las filas vacías afuera.** Una fila a medio llenar es un error, no un borrador.

## Las pestañas de la planilla

### Pestaña `equipos`

De a cuánto se puede subir el peso en cada tipo de equipo. Esto es lo que evita que la app
sugiera 41 kg cuando con una barra solo existen 40 o 42,5.

| `equipo_id` | `nombre` | `incremento_minimo_kg` | `peso_base_kg` |
|---|---|---|---|
| barra | Barra | 2,5 | 20 |
| mancuernas | Mancuernas | 2 | 0 |
| maquina | Máquina | 5 | 0 |
| polea | Polea | 2,5 | 0 |
| peso-corporal | Peso corporal | 0 | 0 |

- `incremento_minimo_kg`: el salto más chico que se puede hacer. En una barra son 2,5 kg
  porque el disco más chico es de 1,25 y van dos, uno de cada lado. **Poné 0 para peso corporal.**
- `peso_base_kg`: el piso. Una barra olímpica vacía ya pesa 20 kg y no se puede levantar menos.

### Pestaña `reglas`

Los números de la progresión. Dos columnas nada más.

| `clave` | `valor` |
|---|---|
| descanso_por_defecto_seg | 90 |
| subir_porcentaje | 2,5 |
| bajar_porcentaje | 10 |
| sesiones_fallidas_para_bajar | 2 |

Cómo se leen, en orden:

1. El usuario se queda con el mismo peso hasta llegar al **techo de repeticiones en todas
   las series**.
2. Cuando lo logra, el peso sube `subir_porcentaje` y las repeticiones vuelven al piso.
   Si ese porcentaje da un salto más chico que el disco más chico, sube un disco igual —
   si no, quedaría trabado para siempre.
3. Si pasa `sesiones_fallidas_para_bajar` veces seguidas sin completar el rango, el peso
   baja `bajar_porcentaje` y vuelve a subir desde ahí.

### Pestaña `ejercicios`

| `id` | `nombre` | `equipo` | `grupo` | `notas` |
|---|---|---|---|---|
| press-banca | Press de banca | barra | pecho | |
| curl-mancuernas | Curl de bíceps con mancuernas | mancuernas | brazos | |

- `equipo` tiene que ser uno de los `equipo_id` de la pestaña `equipos`.
- `notas` puede quedar vacío.

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

El corazón: qué ejercicios tiene cada día, con sus series y descansos. Una fila por
ejercicio.

| `rutina_id` | `dia_id` | `orden` | `ejercicio_id` | `series` | `reps_min` | `reps_max` | `descanso_seg` | `peso_inicial_kg` |
|---|---|---|---|---|---|---|---|---|
| full-body-principiante | a | 1 | sentadilla | 3 | 8 | 12 | 120 | 20 |
| full-body-principiante | a | 2 | press-banca | 3 | 8 | 12 | 120 | 20 |
| full-body-principiante | a | 3 | plancha | 3 | 20 | 45 | 60 | |

- `reps_min` y `reps_max` **no pueden ser iguales**: sin rango, el peso nunca sube.
- `peso_inicial_kg` se puede dejar **vacío** cuando lo elige el usuario (peso corporal, o
  ejercicios donde no hay un arranque razonable).
- `orden` define en qué orden aparecen en pantalla.

## Revisar antes de publicar

```bash
node tools/validar-datos.mjs
```

Revisa todo y explica en castellano qué está mal, señalando la fila. Por ejemplo:

```
ERROR rutina 1 ("full-body-principiante"), día 1 ("Día A"), ejercicio 3 ("remo-barra"):
      repsMin (15) es mayor que repsMax (10). Están al revés.
ERROR ejercicio 1 ("sentadilla") usa el equipo "barra-inventada", que no existe en
      reglas.json. Los que existen son: barra, mancuernas, maquina, polea, peso-corporal
```

También conviene correr los tests, que verifican que las reglas de progresión sigan dando
resultados sensatos con los números nuevos:

```bash
node --test
```

Si el socio sube el incremento de la barra a 20 kg, por ejemplo, los tests se quejan antes
de que eso llegue al teléfono de alguien.
