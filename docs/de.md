# Lokale KI

Betreibe den Gladys-Assistenten mit einem Modell bei dir zu Hause statt mit Gladys Plus: Der Chat, das Erstellen von
Szenen, die Szenenaktion `ai.ask` und der Wochenrückblick laufen über **Ollama** oder jeden Server, der die
OpenAI-API spricht (**LM Studio**, **llama.cpp**, **LocalAI**, **vLLM**…). Die Unterhaltungen verlassen dein Netzwerk
nicht, und du brauchst kein Gladys-Plus-Konto.

Echt getestet mit Ollama 0.40.15 (CPU, kleine Modelle). LM Studio, llama.cpp, LocalAI und vLLM sind über die
OpenAI-API kompatibel, wurden aber nicht getestet: Rückmeldungen sind willkommen.

## Was du bekommst

- Einen **KI-Anbieter** für Gladys 5.3: Sobald er unter **Einstellungen → Künstliche Intelligenz** gewählt ist, geht
  jede KI-Anfrage von Gladys an dein Modell, mit seinen Tools (Gerätesteuerung, Szenen…) und den Bildern.
- Ein **Chat-Modell** und ein optionales kleines **Router-Modell** (der Router ordnet jede Nachricht ein und muss
  innerhalb von 20 Sekunden antworten).
- Mit Ollama: Das **Kontextfenster** und die **Zeit im Speicher** eines Modells werden in Gladys eingestellt, und die
  Fähigkeiten des Modells werden geprüft (ein Modell ohne Tool-Aufrufe ergibt einen klaren Fehler statt einer
  erfundenen Antwort).
- Der **Verbindungsstatus** nennt den Server, die Modelle und die Modelle im Speicher.
- Ein **Dashboard-Widget**, zwei **Szenenauslöser** (Ausfall, Rückkehr) und zwei **Szenenaktionen** (Modell laden,
  Speicher freigeben).

## Den Server einrichten

**Ollama auf dem Rechner von Gladys** (der Standardfall: lass die Adresse leer). Ollama lauscht nur auf `127.0.0.1`,
was die Integrationen nicht erreichen. Lass es auf dem Gateway des Integrationsnetzwerks von Gladys lauschen,
`172.30.0.1`, das vom Rest deines Netzwerks aus unsichtbar bleibt. Unter Linux:

```bash
sudo systemctl edit ollama
# hinzufügen:
# [Unit]
# After=docker.service
# [Service]
# Environment="OLLAMA_HOST=172.30.0.1:11434"
sudo systemctl restart ollama
OLLAMA_HOST=172.30.0.1:11434 ollama pull qwen3:8b
```

Die Adresse `172.30.0.1` existiert, sobald Gladys eine Integration gestartet hat, daher `After=docker.service`.

**Ein anderer Rechner** (ein PC mit Grafikkarte): Starte Ollama mit `OLLAMA_HOST=0.0.0.0` und gib
`http://<seine Adresse>:11434` im Adressfeld ein. Ollama hat kein Passwort: Lass es in einem vertrauenswürdigen
Netzwerk.

**Andere Server**, einzugebende Adresse (endet mit `/v1`):

| Server    | Adresse                    | Gut zu wissen                                                    |
| --------- | -------------------------- | ---------------------------------------------------------------- |
| LM Studio | `http://<Adresse>:1234/v1` | Reiter Developer, Server starten, „Serve on Local Network“       |
| llama.cpp | `http://<Adresse>:8080/v1` | `llama-server --jinja -c 16384 --host 0.0.0.0` (nötig für Tools) |
| LocalAI   | `http://<Adresse>:8080/v1` | API-Schlüssel, wenn `API_KEY` gesetzt ist                        |
| vLLM      | `http://<Adresse>:8000/v1` | `--enable-auto-tool-choice` und der Tool-Parser des Modells      |

Bei diesen Servern stellst du das Kontextfenster auf dem Server ein (mindestens 16384 Tokens).

## Ein Modell wählen

Der Assistent braucht ein Modell, das **Tools aufruft** ([Liste auf ollama.com](https://ollama.com/search?c=tools)).
Je größer das Modell, desto besser erstellt es Szenen, und desto mehr Speicher und Zeit braucht es. Richtwerte mit
16k Kontext:

| Rechner                                     | Chat-Modell                     | Router-Modell   |
| ------------------------------------------- | ------------------------------- | --------------- |
| Mini-PC, 8 GB RAM, ohne Grafikkarte         | `qwen3:4b` (etwa 4 GB, langsam) | `qwen3:1.7b`    |
| 16 GB RAM, ohne Grafikkarte                 | `qwen3:8b` (etwa 7 GB)          | `qwen3:1.7b`    |
| Grafikkarte mit 8 bis 12 GB                 | `qwen3:8b`, `llama3.1:8b`       | dasselbe Modell |
| Grafikkarte mit 16 bis 24 GB, Mac mit 32 GB | `qwen3:14b`, `gpt-oss:20b`      | `qwen3:4b`      |

Auf der CPU antwortet ein 8B-Modell in einigen Dutzend Sekunden, und das Laden dauert bis zu einer Minute: Halte es im
Speicher (Einstellung unten) und lade es vor den Momenten, in denen du mit Gladys sprichst (Szenenaktion). Ein
Raspberry Pi ist für den Assistenten zu langsam.

## Konfiguration

- **Serveradresse**: leer für Ollama auf dem Rechner von Gladys (`http://172.30.0.1:11434/v1`), sonst die Adresse des
  Servers. An eine reine `Adresse:Port` wird `/v1` angehängt.
- **API-Schlüssel**: nur wenn der Server einen verlangt.
- **Chat-Modell**: sein genauer Name auf dem Server (die Schaltfläche **Modelle auflisten** zeigt sie), z. B.
  `qwen3:8b`.
- **Router-Modell**: ein kleines Modell für den Router; leer = das Chat-Modell.
- **Kontextfenster** (Ollama): standardmäßig 16384. Eine Szene zu erstellen sendet 10 bis 15 Tausend Tokens;
  unterhalb des Fensters schneidet Ollama still den Anfang der Anfrage ab, und der Assistent verliert seine
  Anweisungen. Die Protokolle warnen, wenn eine Anfrage größer ist.
- **Modell im Speicher halten** (Ollama): standardmäßig 30 Minuten, „Immer“ für sofortige Antworten.
- **Chat-Modell nachdenken lassen** (Ollama): für qwen3, deepseek-r1… Standardmäßig aus: auf der CPU viel langsamer.
- **Zeitlimit der Antwort**: standardmäßig 110 Sekunden (Gladys wartet 120). Der Router hat immer 18 Sekunden.

Wähle dann **Lokale KI** unter **Einstellungen → Künstliche Intelligenz** (oder mit der Schaltfläche der
Konfigurationsseite).

## Aktionen

- **Modelle testen**: bittet jedes Modell um eine Antwort aus einem Wort und zeigt die benötigte Zeit (die erste lädt
  auch das Modell).
- **Modelle auflisten**: zeigt die Namen der Modelle auf dem Server, zum Übernehmen in die Felder.

## Szenen

Auslöser:

- **Lokale KI: Der Assistent fällt aus**: Server unerreichbar, Modell fehlt, zu langsam, zu wenig Speicher, Modell
  ohne Tool-Aufrufe… Einmal pro Ausfall, nicht bei jeder Nachricht. Variablen: Art, Meldung, Anfrage (chat, router,
  digest), Modell.
- **Lokale KI: Der Assistent antwortet wieder**: die erste Antwort nach einem Ausfall, mit den Minuten des Ausfalls.

Aktionen (nur Ollama):

- **Lokale KI: Modell in den Speicher laden**: z. B. beim Aufstehen, damit die erste Antwort schnell kommt. Ausgabe:
  die Ladezeit.
- **Lokale KI: Speicher freigeben**: entlädt alle Modelle, z. B. nachts. Ausgabe: die Zahl der entladenen Modelle.

## Dashboard

Das Widget **Lokale KI** zeigt den Server, das Chat- und das Router-Modell (grün, wenn sie im Speicher sind), den
belegten Speicher, die Zeit der letzten Antwort und den aktuellen Ausfall, mit zwei Schaltflächen (Ollama): Modell
laden, Speicher freigeben. Eine Einstellung blendet die Schaltflächen aus.

## Datenschutz

Alles bleibt zwischen Gladys und deinem Server: die Nachrichten, der Verlauf, die von den Tools gelesenen
Gerätezustände und die Bilder des Chats. Nichts davon landet in den Protokollen, auf keiner Stufe: nur Größen und
Zeiten. Ollama hat keine Authentifizierung: Jede in Gladys installierte Integration erreicht es über `172.30.0.1`.

## Fehlerbehebung

- **„Der Modellserver … ist nicht erreichbar“**: Ollama lauscht nur auf `127.0.0.1` (siehe oben), oder es ist vor
  Docker gestartet. Vom Rechner von Gladys aus muss `curl http://172.30.0.1:11434/api/version` antworten.
- **„… ist nicht auf dem Server“**: Lade es (`ollama pull <Modell>`) oder übernimm seinen genauen Namen mit
  **Modelle auflisten**.
- **„… kann keine Tools aufrufen“**: Wähle ein Modell aus der [Tools-Liste](https://ollama.com/search?c=tools).
- **„… hat nicht rechtzeitig geantwortet“** oder langsame Antworten: kleineres Modell, „Immer“ im Speicher, Router auf
  einem kleinen Modell.
- **„Nicht genug Speicher“**: kleineres Modell oder kleineres Kontextfenster.
- **Der Assistent ignoriert das Haus oder erfindet Geräte**: Kontextfenster zu klein (die Protokolle sagen es), oder
  das Modell ist zu klein, um den Anweisungen zu folgen.
- **Bilder**: Ein Modell ohne Vision antwortet, dass es sie nicht sieht (mit Ollama); um Kamerabilder zu beschreiben,
  wähle ein Modell mit Vision und Tools (`qwen3-vl`, `mistral-small3.2`…).
