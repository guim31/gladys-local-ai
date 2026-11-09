// -----------------------------------------------------------------------------
// Texts the code writes at runtime, in English, French, German and Spanish
// (English fallback): connection statuses, action results, the widget. The
// manifest carries its own labels. German says "du", Spanish "usted", like
// the rest of Guilhem's integrations. Model and server names are never
// translated.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const TEXTS = {
  // --- connection status -------------------------------------------------------
  serverOllama: {
    en: 'Ollama {version}',
    fr: 'Ollama {version}',
    de: 'Ollama {version}',
    es: 'Ollama {version}',
  },
  serverOpenai: {
    en: 'OpenAI-compatible server',
    fr: 'Serveur compatible OpenAI',
    de: 'OpenAI-kompatibler Server',
    es: 'Servidor compatible con OpenAI',
  },
  statusConnected: {
    en: '{server}: chat {chat}, router {router}.',
    fr: '{server} : chat {chat}, routeur {router}.',
    de: '{server}: Chat {chat}, Router {router}.',
    es: '{server}: chat {chat}, enrutador {router}.',
  },
  statusLoaded: {
    en: 'In memory: {models}.',
    fr: 'En mémoire : {models}.',
    de: 'Im Speicher: {models}.',
    es: 'En memoria: {models}.',
  },
  statusNothingLoaded: {
    en: 'No model in memory yet.',
    fr: 'Aucun modèle en mémoire pour l’instant.',
    de: 'Noch kein Modell im Speicher.',
    es: 'Todavía no hay ningún modelo en memoria.',
  },
  statusNotListed: {
    en: '{model} is not in the list of the server: check its name.',
    fr: '{model} n’est pas dans la liste du serveur : vérifiez son nom.',
    de: '{model} steht nicht in der Liste des Servers: Prüfe seinen Namen.',
    es: '{model} no está en la lista del servidor: compruebe su nombre.',
  },
  statusNoModel: {
    en: 'Type the name of the chat model in the configuration. On the server: {models}.',
    fr: 'Saisissez le nom du modèle du chat dans la configuration. Sur le serveur : {models}.',
    de: 'Gib den Namen des Chat-Modells in der Konfiguration ein. Auf dem Server: {models}.',
    es: 'Escriba el nombre del modelo del chat en la configuración. En el servidor: {models}.',
  },
  statusBadUrl: {
    en: 'The server address is not a valid http(s) URL.',
    fr: 'L’adresse du serveur n’est pas une URL http(s) valide.',
    de: 'Die Serveradresse ist keine gültige http(s)-URL.',
    es: 'La dirección del servidor no es una URL http(s) válida.',
  },
  statusUnreachable: {
    en: 'Cannot reach the model server at {url}: check that it runs and listens on this address.',
    fr: 'Impossible de joindre le serveur de modèles à {url} : vérifiez qu’il tourne et écoute à cette adresse.',
    de: 'Der Modellserver unter {url} ist nicht erreichbar: Prüfe, ob er läuft und auf dieser Adresse lauscht.',
    es: 'No se puede acceder al servidor de modelos en {url}: compruebe que funciona y escucha en esta dirección.',
  },
  statusTimeout: {
    en: '{model} did not answer in time: choose a smaller model or raise the timeout.',
    fr: '{model} n’a pas répondu à temps : choisissez un modèle plus petit ou augmentez le délai.',
    de: '{model} hat nicht rechtzeitig geantwortet: Wähle ein kleineres Modell oder erhöhe das Zeitlimit.',
    es: '{model} no ha respondido a tiempo: elija un modelo más pequeño o aumente el tiempo de espera.',
  },
  statusAuth: {
    en: 'The server refused the API key: check it in the configuration.',
    fr: 'Le serveur a refusé la clé d’API : vérifiez-la dans la configuration.',
    de: 'Der Server hat den API-Schlüssel abgelehnt: Prüfe ihn in der Konfiguration.',
    es: 'El servidor ha rechazado la clave de API: compruébela en la configuración.',
  },
  statusModelMissing: {
    en: '{model} is not on the server (ollama pull {model}). On the server: {models}.',
    fr: '{model} n’est pas sur le serveur (ollama pull {model}). Sur le serveur : {models}.',
    de: '{model} ist nicht auf dem Server (ollama pull {model}). Auf dem Server: {models}.',
    es: '{model} no está en el servidor (ollama pull {model}). En el servidor: {models}.',
  },
  statusTools: {
    en: '{model} cannot call tools, which the assistant needs: choose a model with tools (qwen3, llama3.1…).',
    fr: '{model} ne sait pas appeler d’outils, indispensables à l’assistant : choisissez un modèle « tools » (qwen3, llama3.1…).',
    de: '{model} kann keine Tools aufrufen, die der Assistent braucht: Wähle ein Modell mit Tools (qwen3, llama3.1…).',
    es: '{model} no sabe llamar a herramientas, que el asistente necesita: elija un modelo con tools (qwen3, llama3.1…).',
  },
  statusMemory: {
    en: 'Not enough memory to run {model}: choose a smaller model or lower the context window.',
    fr: 'Pas assez de mémoire pour faire tourner {model} : choisissez un modèle plus petit ou réduisez la fenêtre de contexte.',
    de: 'Nicht genug Speicher für {model}: Wähle ein kleineres Modell oder verkleinere das Kontextfenster.',
    es: 'No hay memoria suficiente para {model}: elija un modelo más pequeño o reduzca la ventana de contexto.',
  },
  statusServerError: {
    en: 'Model server error: {detail}',
    fr: 'Erreur du serveur de modèles : {detail}',
    de: 'Fehler des Modellservers: {detail}',
    es: 'Error del servidor de modelos: {detail}',
  },
  statusInitFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Protokolle der Integration.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  noneListed: {
    en: 'none',
    fr: 'aucun',
    de: 'keines',
    es: 'ninguno',
  },

  // --- actions -------------------------------------------------------------------
  role_chat: { en: 'Chat', fr: 'Chat', de: 'Chat', es: 'Chat' },
  role_router: { en: 'Router', fr: 'Routeur', de: 'Router', es: 'Enrutador' },
  testAnswered: {
    en: '{model} answered in {seconds} s.',
    fr: '{model} a répondu en {seconds} s.',
    de: '{model} hat in {seconds} s geantwortet.',
    es: '{model} ha respondido en {seconds} s.',
  },
  modelsList: {
    en: 'Models on the server ({count}): {models}',
    fr: 'Modèles sur le serveur ({count}) : {models}',
    de: 'Modelle auf dem Server ({count}): {models}',
    es: 'Modelos en el servidor ({count}): {models}',
  },
  modelLoaded: {
    en: '{model} is in memory ({seconds} s).',
    fr: '{model} est en mémoire ({seconds} s).',
    de: '{model} ist im Speicher ({seconds} s).',
    es: '{model} está en memoria ({seconds} s).',
  },
  modelsUnloaded: {
    en: 'Models unloaded: {models}.',
    fr: 'Modèles déchargés : {models}.',
    de: 'Modelle entladen: {models}.',
    es: 'Modelos descargados: {models}.',
  },
  ollamaOnly: {
    en: 'Only Ollama loads and unloads models on request.',
    fr: 'Seul Ollama charge et décharge les modèles à la demande.',
    de: 'Nur Ollama lädt und entlädt Modelle auf Anfrage.',
    es: 'Solo Ollama carga y descarga modelos a petición.',
  },

  // --- widget --------------------------------------------------------------------
  rowServer: { en: 'Server', fr: 'Serveur', de: 'Server', es: 'Servidor' },
  rowChat: { en: 'Chat model', fr: 'Modèle du chat', de: 'Chat-Modell', es: 'Modelo del chat' },
  rowRouter: {
    en: 'Router model',
    fr: 'Modèle du routeur',
    de: 'Router-Modell',
    es: 'Modelo del enrutador',
  },
  rowError: { en: 'Failure', fr: 'Panne', de: 'Ausfall', es: 'Fallo' },
  valueUnreachable: {
    en: 'unreachable',
    fr: 'injoignable',
    de: 'nicht erreichbar',
    es: 'inaccesible',
  },
  valueNone: { en: 'not chosen', fr: 'non choisi', de: 'nicht gewählt', es: 'sin elegir' },
  tileLoaded: { en: 'In memory', fr: 'En mémoire', de: 'Im Speicher', es: 'En memoria' },
  tileMemory: {
    en: 'Memory used',
    fr: 'Mémoire prise',
    de: 'Belegter Speicher',
    es: 'Memoria usada',
  },
  tileLastAnswer: {
    en: 'Last answer',
    fr: 'Dernière réponse',
    de: 'Letzte Antwort',
    es: 'Última respuesta',
  },
  buttonLoad: {
    en: 'Load the model',
    fr: 'Charger le modèle',
    de: 'Modell laden',
    es: 'Cargar el modelo',
  },
  buttonUnload: {
    en: 'Free the memory',
    fr: 'Libérer la mémoire',
    de: 'Speicher freigeben',
    es: 'Liberar la memoria',
  },

  // --- kinds of failure (widget, ≤ 24) ---------------------------------------------
  kind_config: {
    en: 'Configuration',
    fr: 'Configuration',
    de: 'Konfiguration',
    es: 'Configuración',
  },
  kind_unreachable: {
    en: 'Server unreachable',
    fr: 'Serveur injoignable',
    de: 'Server unerreichbar',
    es: 'Servidor inaccesible',
  },
  kind_timeout: { en: 'Too slow', fr: 'Trop lent', de: 'Zu langsam', es: 'Demasiado lento' },
  kind_auth: {
    en: 'Key refused',
    fr: 'Clé refusée',
    de: 'Schlüssel abgelehnt',
    es: 'Clave rechazada',
  },
  kind_model: {
    en: 'Model missing',
    fr: 'Modèle absent',
    de: 'Modell fehlt',
    es: 'Modelo ausente',
  },
  kind_tools: {
    en: 'No tool calling',
    fr: 'Pas d’appel d’outils',
    de: 'Keine Tool-Aufrufe',
    es: 'Sin llamada a herramientas',
  },
  kind_memory: {
    en: 'Not enough memory',
    fr: 'Mémoire insuffisante',
    de: 'Zu wenig Speicher',
    es: 'Memoria insuficiente',
  },
  kind_request: {
    en: 'Request refused',
    fr: 'Requête refusée',
    de: 'Anfrage abgelehnt',
    es: 'Solicitud rechazada',
  },
  kind_server: {
    en: 'Server error',
    fr: 'Erreur du serveur',
    de: 'Serverfehler',
    es: 'Error del servidor',
  },
};

/**
 * @description One text in one language, placeholders filled.
 * @param {string} key - The key of TEXTS.
 * @param {string} [language] - `en`, `fr`, `de` or `es` (English otherwise).
 * @param {Record<string, unknown>} [values] - Placeholder values.
 * @returns {string} The text (the key itself when unknown, English fallback).
 */
export function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined ? match : String(values[name]),
  );
}

/**
 * @description A text in the four languages, as `setConnectionStatus` and
 * the action results want it.
 * @param {string|((language: string) => string)} key - A key of TEXTS, or a
 *   function building the text of one language.
 * @param {Record<string, unknown>} [values] - Placeholder values.
 * @returns {Record<string, string>} `{ en, fr, de, es }`.
 */
export function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function' ? key(language) : t(key, language, values),
    ]),
  );
}

/**
 * @description The language of a widget request, English when unknown.
 * @param {unknown} language - The language Gladys sent.
 * @returns {string} One of LANGUAGES.
 */
export function languageOf(language) {
  const short = String(language ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(short) ? short : 'en';
}
