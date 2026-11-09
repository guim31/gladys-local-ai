# IA local

Haga funcionar el asistente de Gladys con un modelo en su casa en lugar de Gladys Plus: el chat, la creación de
escenas, la acción de escena `ai.ask` y el resumen semanal los atiende **Ollama** o cualquier servidor que hable la API
de OpenAI (**LM Studio**, **llama.cpp**, **LocalAI**, **vLLM**…). Las conversaciones no salen de su red y no hace falta
ninguna cuenta de Gladys Plus.

Probada de verdad con Ollama 0.40.15 (procesador, modelos pequeños). LM Studio, llama.cpp, LocalAI y vLLM son
compatibles a través de la API de OpenAI pero no se han probado: sus comentarios son bienvenidos.

## Lo que obtiene

- Un **proveedor de IA** para Gladys 5.3: una vez elegido en **Ajustes → Inteligencia artificial**, cada solicitud de
  IA de Gladys va a su modelo, con sus herramientas (control de dispositivos, escenas…) y las imágenes.
- Un **modelo del chat** y un pequeño **modelo del enrutador** opcional (el enrutador clasifica cada mensaje y debe
  contestar en menos de 20 segundos).
- Con Ollama: la **ventana de contexto** y el **tiempo en memoria** de un modelo se ajustan desde Gladys, y se
  comprueban las capacidades del modelo (un modelo que no sabe llamar a herramientas da un error claro, no una
  respuesta inventada).
- El **estado de la conexión** nombra el servidor, los modelos y los modelos en memoria.
- Un **widget** para el panel, dos **disparadores de escena** (fallo, recuperación) y dos **acciones de escena**
  (cargar el modelo, liberar la memoria).

## Instalar el servidor

**Ollama en la máquina de Gladys** (el caso por defecto: deje la dirección vacía). Ollama solo escucha en
`127.0.0.1`, que las integraciones no pueden alcanzar. Haga que escuche en la pasarela de la red de integraciones de
Gladys, `172.30.0.1`, que sigue siendo invisible para el resto de su red. En Linux:

```bash
sudo systemctl edit ollama
# añada:
# [Unit]
# After=docker.service
# [Service]
# Environment="OLLAMA_HOST=172.30.0.1:11434"
sudo systemctl restart ollama
OLLAMA_HOST=172.30.0.1:11434 ollama pull qwen3:8b
```

La dirección `172.30.0.1` existe en cuanto Gladys ha iniciado una integración, de ahí `After=docker.service`.

**Otra máquina** (un PC con tarjeta gráfica): inicie Ollama con `OLLAMA_HOST=0.0.0.0` y escriba
`http://<su dirección>:11434` en el campo de la dirección. Ollama no tiene contraseña: manténgalo en una red de
confianza.

**Otros servidores**, dirección que escribir (terminada en `/v1`):

| Servidor  | Dirección                    | Conviene saber                                                                   |
| --------- | ---------------------------- | -------------------------------------------------------------------------------- |
| LM Studio | `http://<dirección>:1234/v1` | Pestaña Developer, iniciar el servidor, «Serve on Local Network»                 |
| llama.cpp | `http://<dirección>:8080/v1` | `llama-server --jinja -c 16384 --host 0.0.0.0` (necesario para las herramientas) |
| LocalAI   | `http://<dirección>:8080/v1` | Clave de API si `API_KEY` está definida                                          |
| vLLM      | `http://<dirección>:8000/v1` | `--enable-auto-tool-choice` y el analizador de herramientas del modelo           |

Con estos servidores, la ventana de contexto se ajusta en el servidor (16384 tokens como mínimo).

## Elegir un modelo

El asistente necesita un modelo que **llame a herramientas** ([lista en ollama.com](https://ollama.com/search?c=tools)).
Cuanto más grande es el modelo, mejor crea las escenas, y más memoria y tiempo ocupa. Tamaños orientativos con un
contexto de 16k:

| Máquina                                     | Modelo del chat               | Modelo del enrutador |
| ------------------------------------------- | ----------------------------- | -------------------- |
| Mini PC, 8 GB de RAM, sin tarjeta gráfica   | `qwen3:4b` (unos 4 GB, lento) | `qwen3:1.7b`         |
| 16 GB de RAM, sin tarjeta gráfica           | `qwen3:8b` (unos 7 GB)        | `qwen3:1.7b`         |
| Tarjeta gráfica de 8 a 12 GB                | `qwen3:8b`, `llama3.1:8b`     | el mismo modelo      |
| Tarjeta gráfica de 16 a 24 GB, Mac de 32 GB | `qwen3:14b`, `gpt-oss:20b`    | `qwen3:4b`           |

En el procesador, un modelo 8B responde en varias decenas de segundos y cargarlo tarda hasta un minuto: manténgalo en
memoria (ajuste más abajo) y cárguelo antes de los momentos en que habla con Gladys (acción de escena). Una Raspberry Pi
es demasiado lenta para el asistente.

## Configuración

- **Dirección del servidor**: vacía para Ollama en la máquina de Gladys (`http://172.30.0.1:11434/v1`); si no, la
  dirección del servidor. Se añade `/v1` a una simple `dirección:puerto`.
- **Clave de API**: solo si el servidor la pide.
- **Modelo del chat**: su nombre exacto en el servidor (el botón **Listar los modelos** los muestra), por ejemplo
  `qwen3:8b`.
- **Modelo del enrutador**: un modelo pequeño para el enrutador; vacío = el modelo del chat.
- **Ventana de contexto** (Ollama): 16384 por defecto. Crear una escena envía de 10 a 15 mil tokens; por debajo de la
  ventana, Ollama corta en silencio el comienzo de la solicitud y el asistente pierde sus instrucciones. Los registros
  avisan cuando una solicitud la llena.
- **Mantener el modelo en memoria** (Ollama): 30 minutos por defecto, «Siempre» para respuestas inmediatas.
- **Dejar razonar al modelo del chat** (Ollama): para qwen3, deepseek-r1… Desactivado por defecto: mucho más lento en
  el procesador.
- **Tiempo de espera de la respuesta**: 110 segundos por defecto (Gladys espera 120). El enrutador siempre tiene
  18 segundos.

Luego elija **IA local** en **Ajustes → Inteligencia artificial** (o con el botón de la página de configuración).

## Acciones

- **Probar los modelos**: pide una respuesta de una palabra a cada modelo y muestra el tiempo empleado (la primera
  también carga el modelo).
- **Listar los modelos**: muestra los nombres de los modelos del servidor, para copiarlos en los campos.

## Escenas

Disparadores:

- **IA local: el asistente falla**: servidor inaccesible, modelo ausente, demasiado lento, memoria insuficiente,
  modelo sin llamada a herramientas… Una vez por fallo, no en cada mensaje. Variables: tipo, mensaje, solicitud (chat,
  router, digest), modelo.
- **IA local: el asistente vuelve a responder**: la primera respuesta tras un fallo, con los minutos de fallo.

Acciones (solo Ollama):

- **IA local: cargar el modelo en memoria**: al despertar, por ejemplo, para que la primera respuesta sea rápida.
  Salida: el tiempo de carga.
- **IA local: liberar la memoria**: descarga todos los modelos, de noche por ejemplo. Salida: el número de modelos
  descargados.

## Panel

El widget **IA local** muestra el servidor, los modelos del chat y del enrutador (en verde cuando están en memoria), la
memoria ocupada, el tiempo de la última respuesta y el fallo en curso, con dos botones (Ollama): cargar el modelo,
liberar la memoria. Un ajuste oculta los botones.

## Privacidad

Todo queda entre Gladys y su servidor: los mensajes, el historial, el estado de los dispositivos que leen las
herramientas y las imágenes del chat. Nada se escribe en los registros, en ningún nivel: solo tamaños y tiempos.
Ollama no tiene autenticación: cualquier integración instalada en Gladys puede acceder a él en `172.30.0.1`.

## Solución de problemas

- **«No se puede acceder al servidor de modelos»**: Ollama solo escucha en `127.0.0.1` (véase más arriba), o se inició
  antes que Docker. Desde la máquina de Gladys, `curl http://172.30.0.1:11434/api/version` debe responder.
- **«… no está en el servidor»**: descárguelo (`ollama pull <modelo>`) o copie su nombre exacto con **Listar los
  modelos**.
- **«… no sabe llamar a herramientas»**: elija un modelo de la [lista «tools»](https://ollama.com/search?c=tools).
- **«… no ha respondido a tiempo»** o respuestas lentas: modelo más pequeño, «Siempre» en memoria, enrutador en un
  modelo pequeño.
- **«No hay memoria suficiente»**: modelo más pequeño o ventana de contexto reducida.
- **El asistente ignora la casa o inventa dispositivos**: ventana de contexto demasiado pequeña (los registros lo
  dicen), o modelo demasiado pequeño para seguir las instrucciones.
- **Imágenes**: un modelo sin visión responde que no las ve (con Ollama); para describir las imágenes de las cámaras,
  elija un modelo con visión y herramientas (`qwen3-vl`, `mistral-small3.2`…).
