# Déploiement GitHub Pages

## Configuration automatique

L'application se déploie automatiquement sur GitHub Pages à chaque push sur `main` ou `master`.

## URL de l'application

Une fois déployée, l'application sera disponible à :
**https://wollanup.github.io/multi-track-player/**

## Étapes pour activer GitHub Pages (à faire une seule fois)

1. Allez sur votre repo GitHub : https://github.com/wollanup/multi-track-player
2. Cliquez sur **Settings** (Paramètres)
3. Dans le menu de gauche, cliquez sur **Pages**
4. Sous **Source**, sélectionnez **GitHub Actions**
5. Sauvegardez

C'est tout ! Le déploiement se fera automatiquement au prochain push.

## Build manuel local

Pour tester le build localement :

```bash
cd app
npm install
npm run build
npm run preview  # Pour tester le build en local
```

## Notes

- Le build prend ~2-3 minutes
- Vous pouvez suivre le déploiement dans l'onglet **Actions** de votre repo
- L'app est une PWA, elle peut être installée sur mobile/desktop
