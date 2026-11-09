# IA locale

Faites tourner l’assistant Gladys sur un modèle chez vous plutôt que sur Gladys Plus : le chat, la création de scènes,
l’action de scène `ai.ask` et le résumé hebdomadaire sont traités par **Ollama** ou par tout serveur qui parle l’API
OpenAI (**LM Studio**, **llama.cpp**, **LocalAI**, **vLLM**…). Les conversations ne quittent pas votre réseau et aucun
compte Gladys Plus n’est nécessaire.

Testée pour de vrai avec Ollama 0.40.15 (processeur, petits modèles). LM Studio, llama.cpp, LocalAI et vLLM sont
compatibles par l’API OpenAI mais n’ont pas été testés : vos retours sont les bienvenus.

## Ce que vous obtenez

- Un **fournisseur d’IA** pour Gladys 5.3 : une fois choisi dans **Paramètres → Intelligence artificielle**, chaque
  requête d’IA de Gladys part vers votre modèle, avec ses outils (pilotage des appareils, scènes…) et les images.
- Un **modèle du chat** et un petit **modèle du routeur** facultatif (le routeur trie chaque message et doit répondre
  en moins de 20 secondes).
- Avec Ollama : la **fenêtre de contexte** et la **durée en mémoire** d’un modèle se règlent depuis Gladys, et les
  capacités du modèle sont vérifiées (un modèle qui ne sait pas appeler d’outils donne une erreur claire, pas une
  réponse inventée).
- Le **statut de connexion** nomme le serveur, les modèles et les modèles en mémoire.
- Un **widget** pour le tableau de bord, deux **déclencheurs de scène** (panne, retour) et deux **actions de scène**
  (charger le modèle, libérer la mémoire).

## Installer le serveur

**Ollama sur la machine de Gladys** (le cas par défaut : laissez l’adresse vide). Ollama n’écoute que sur
`127.0.0.1`, que les intégrations ne peuvent pas joindre. Faites-le écouter sur la passerelle du réseau des
intégrations de Gladys, `172.30.0.1`, qui reste invisible du reste de votre réseau. Sous Linux :

```bash
sudo systemctl edit ollama
# ajoutez :
# [Unit]
# After=docker.service
# [Service]
# Environment="OLLAMA_HOST=172.30.0.1:11434"
sudo systemctl restart ollama
OLLAMA_HOST=172.30.0.1:11434 ollama pull qwen3:8b
```

L’adresse `172.30.0.1` existe dès que Gladys a démarré une intégration, d’où `After=docker.service`.

**Une autre machine** (un PC avec carte graphique) : lancez Ollama avec `OLLAMA_HOST=0.0.0.0` et saisissez
`http://<son adresse>:11434` dans le champ de l’adresse. Ollama n’a pas de mot de passe : gardez-le sur un réseau de
confiance.

**Autres serveurs**, adresse à saisir (terminée par `/v1`) :

| Serveur   | Adresse                    | À savoir                                                                |
| --------- | -------------------------- | ----------------------------------------------------------------------- |
| LM Studio | `http://<adresse>:1234/v1` | Onglet Developer, démarrer le serveur, « Serve on Local Network »       |
| llama.cpp | `http://<adresse>:8080/v1` | `llama-server --jinja -c 16384 --host 0.0.0.0` (requis pour les outils) |
| LocalAI   | `http://<adresse>:8080/v1` | Clé d’API si `API_KEY` est défini                                       |
| vLLM      | `http://<adresse>:8000/v1` | `--enable-auto-tool-choice` et le parseur d’outils du modèle            |

Avec ces serveurs, la fenêtre de contexte se règle côté serveur (16384 jetons au moins).

## Choisir un modèle

L’assistant a besoin d’un modèle qui **appelle des outils** ([liste sur ollama.com](https://ollama.com/search?c=tools)).
Plus le modèle est gros, mieux il crée les scènes, et plus il prend de mémoire et de temps. Tailles indicatives avec
un contexte de 16k :

| Machine                                     | Modèle du chat                  | Modèle du routeur |
| ------------------------------------------- | ------------------------------- | ----------------- |
| Mini PC, 8 Go de RAM, sans carte graphique  | `qwen3:4b` (environ 4 Go, lent) | `qwen3:1.7b`      |
| 16 Go de RAM, sans carte graphique          | `qwen3:8b` (environ 7 Go)       | `qwen3:1.7b`      |
| Carte graphique de 8 à 12 Go                | `qwen3:8b`, `llama3.1:8b`       | le même modèle    |
| Carte graphique de 16 à 24 Go, Mac de 32 Go | `qwen3:14b`, `gpt-oss:20b`      | `qwen3:4b`        |

Sur processeur, un modèle 8B répond en quelques dizaines de secondes et son chargement prend jusqu’à une minute :
gardez-le en mémoire (réglage ci-dessous) et chargez-le avant les moments où vous parlez à Gladys (action de scène).
Un Raspberry Pi est trop lent pour l’assistant.

## Configuration

- **Adresse du serveur** : vide pour Ollama sur la machine de Gladys (`http://172.30.0.1:11434/v1`), sinon l’adresse du
  serveur. `/v1` est ajouté à une simple `adresse:port`.
- **Clé d’API** : seulement si le serveur en demande une.
- **Modèle du chat** : son nom exact sur le serveur (le bouton **Lister les modèles** les affiche), par exemple
  `qwen3:8b`.
- **Modèle du routeur** : un petit modèle pour le routeur ; vide = le modèle du chat.
- **Fenêtre de contexte** (Ollama) : 16384 par défaut. Créer une scène envoie 10 à 15 mille jetons ; en dessous de la
  fenêtre, Ollama coupe en silence le début de la requête et l’assistant perd ses consignes. Les journaux préviennent
  quand une requête la remplit.
- **Garder le modèle en mémoire** (Ollama) : 30 minutes par défaut, « Toujours » pour des réponses immédiates.
- **Laisser réfléchir le modèle du chat** (Ollama) : pour qwen3, deepseek-r1… Désactivé par défaut : bien plus lent
  sur processeur.
- **Délai de réponse** : 110 secondes par défaut (Gladys attend 120). Le routeur a toujours 18 secondes.

Choisissez ensuite **IA locale** dans **Paramètres → Intelligence artificielle** (ou par le bouton de la page de
configuration).

## Actions

- **Tester les modèles** : demande une réponse d’un mot à chaque modèle et affiche le temps mis (la première charge
  aussi le modèle).
- **Lister les modèles** : affiche les noms des modèles du serveur, à recopier dans les champs.

## Scènes

Déclencheurs :

- **IA locale : l’assistant est en panne** : serveur injoignable, modèle absent, trop lent, mémoire insuffisante,
  modèle sans appel d’outils… Une fois par panne, pas à chaque message. Variables : type, message, requête (chat,
  router, digest), modèle.
- **IA locale : l’assistant répond de nouveau** : la première réponse après une panne, avec les minutes de panne.

Actions (Ollama seulement) :

- **IA locale : charger le modèle en mémoire** : au réveil par exemple, pour une première réponse rapide. Sortie : le
  temps de chargement.
- **IA locale : libérer la mémoire** : décharge tous les modèles, la nuit par exemple. Sortie : le nombre de modèles
  déchargés.

## Tableau de bord

Le widget **IA locale** affiche le serveur, les modèles du chat et du routeur (en vert quand ils sont en mémoire), la
mémoire prise, le temps de la dernière réponse et la panne en cours, avec deux boutons (Ollama) : charger le modèle,
libérer la mémoire. Un réglage masque les boutons.

## Confidentialité

Tout reste entre Gladys et votre serveur : les messages, l’historique, l’état des appareils lus par les outils et les
images du chat. Rien n’est écrit dans les journaux, à aucun niveau : seulement des tailles et des temps. Ollama n’a pas
d’authentification : toute intégration installée dans Gladys peut le joindre sur `172.30.0.1`.

## Dépannage

- **« Impossible de joindre le serveur de modèles »** : Ollama n’écoute que sur `127.0.0.1` (voir plus haut), ou il a
  démarré avant Docker. Depuis la machine de Gladys, `curl http://172.30.0.1:11434/api/version` doit répondre.
- **« … n’est pas sur le serveur »** : téléchargez-le (`ollama pull <modèle>`) ou recopiez son nom exact avec
  **Lister les modèles**.
- **« … ne sait pas appeler d’outils »** : choisissez un modèle de la [liste « tools »](https://ollama.com/search?c=tools).
- **« … n’a pas répondu à temps »** ou réponses lentes : modèle plus petit, « Toujours » en mémoire, routeur sur un
  petit modèle.
- **« Pas assez de mémoire »** : modèle plus petit ou fenêtre de contexte réduite.
- **L’assistant ignore la maison ou invente des appareils** : fenêtre de contexte trop petite (les journaux le
  disent), ou modèle trop petit pour suivre les consignes.
- **Images** : un modèle sans vision répond qu’il ne les voit pas (avec Ollama) ; pour décrire les images des caméras,
  choisissez un modèle qui a à la fois la vision et les outils (`qwen3-vl`, `mistral-small3.2`…).
