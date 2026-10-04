# Documentation technique

## Démarrage

Tout se passe dans `app/` :

```bash
cd app
npm install
npm run dev          # http://localhost:5173 (hot reload)
npm run build        # build statique dans dist/ (npm run preview pour le servir)
```

## Vérifications

```bash
npm run lint
npm run typecheck
npm test             # tests unitaires (Vitest), npm run test:watch pendant le dev
npm run test:e2e     # tests d'interface (Playwright, Chromium avec un faux micro, sur le build de prod)
npm run i18n:check   # échoue si les clés en/fr ne correspondent plus aux t() du code
npm run i18n:extract # met à jour les fichiers de langue après avoir ajouté des clés
```

La CI (`.github/workflows/ci.yml`) lance tout ça à chaque push et PR, plus un audit des dépendances de
production. Chaque push sur `main` déploie sur GitHub Pages (`deploy.yml`).

Les tests e2e génèrent leurs propres fichiers audio (`e2e/helpers.ts`) : un son avec un clic toutes les
demi-secondes, assez léger pour rester dans le dépôt et assez rythmé pour la détection de tempo.

## Stack

React 19 + Mantine 9 (UI) + Tabler Icons, Zustand (état), Web Audio API, Signalsmith Stretch (vitesse et
hauteur), i18next, Vite + vite-plugin-pwa, Vitest, Playwright, ESLint.

## Architecture

```
app/src/
  audio/       moteur Web Audio (AudioEngine), capture micro (MicRecorder), latence, unités de hauteur — testé
  tempo/       tempo, mesures, détection automatique, tap tempo — testé
  timeline/    règle, pistes, formes d'onde, vumètres, zoom, aimantation, édition de clips — logique testée
  hooks/       store Zustand (useAudioStore) découpé en tranches dans audioStore/, petits hooks d'UI
  components/  barre du haut, barre du bas, panneaux (tempo, hauteur, vitesse, morceaux, réglages, aide)
  i18n/        configuration i18next, locales/en.json et fr.json
  theme/       thème Mantine, palette
  utils/       IndexedDB, couleurs, logger
```

- Le moteur audio vit hors de React. Le store est la source de vérité, et un abonnement dans
  `useAudioStore.ts` pousse ses changements vers le moteur (mix, boucle, vitesse, hauteur).
- La position de lecture ne passe pas par le store, qui changerait 50 fois par seconde : les composants
  la lisent via `usePlaybackTime`.
- Les fichiers de composants n'exportent que des composants (règle react-refresh) : la logique pure va
  dans `audio/`, `tempo/` ou `timeline/*.ts`.

## Moteur audio

- Toutes les pistes sont décodées en `AudioBuffer` et jouées par un seul `AudioContext`. Chaque voix
  démarre au même instant de son horloge : les pistes sont calées à l'échantillon. La position se déduit
  de cette horloge, pas d'un timer.
- À 1x sans transposition, les voix sont de simples `AudioBufferSourceNode`, sans aucun traitement.
  Dès que la vitesse ou la hauteur change, toutes les pistes basculent ensemble sur des nœuds Signalsmith
  Stretch, préparés avant la bascule. Ils reviennent aux sources simples (et libèrent leur copie des
  buffers) quand on revient à 1x sans transposition.
- Les sauts de boucle sont programmés un peu à l'avance sur l'horloge audio, donc sans trou.
- Un clip est une fenêtre sur le fichier (position, début rogné, durée) : le fichier n'est jamais modifié.
- Hauteur (`audio/pitch.ts`) : demi-tons (±12) et cents (±50) gardés séparément, tels que réglés.
  Le moteur reçoit leur somme en demi-tons.

## Enregistrement

- `MicRecorder` capture le micro dans un AudioWorklet, sur le même `AudioContext` que la lecture.
  Il connaît la frame exacte de chaque échantillon, donc la prise démarre sur la frame où démarre la lecture.
- La prise est ensuite avancée de la latence aller-retour (sortie casque + entrée micro). Le navigateur
  n'en donne qu'une estimation : on peut la mesurer (des clics joués et réentendus par le micro) ou la
  saisir dans les réglages (`audio/latency.ts`).
- L'enregistrement exige la vitesse 1x (une prise ralentie ne se recalerait pas), mais il marche
  transposé : les nœuds Stretch compensent leur propre latence, le timing reste celui du 1x.

## Stockage

- IndexedDB (`PracticeTracksDB`, voir `utils/indexedDB.ts`) : les fichiers audio, les morceaux, et les
  réglages de chaque morceau (pistes, boucles, vitesse, hauteur, tempo, volume général).
- localStorage : les préférences de l'interface (thème, style de forme d'onde, mode d'édition,
  aimantation, latence…) et le dernier morceau ouvert.
- L'historique d'annulation (repères, boucles, clips) reste en mémoire et appartient au morceau ouvert.
