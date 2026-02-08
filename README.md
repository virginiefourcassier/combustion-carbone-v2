# Combustion du carbone — simulation HTML5

Simulation particulaire autonome : **C + O₂ → CO₂** avec **N₂ spectateur**.

## Fichiers
- `index.html`
- `app.js`

## Déploiement GitHub Pages (résumé)
1. Créer un nouveau dépôt (ex. `combustion-carbone-v2`)
2. Déposer `index.html` + `app.js` à la racine
3. Settings → Pages → Deploy from a branch → `main` / `(root)`
4. Utiliser l'URL `https://<user>.github.io/<repo>/` dans un iframe ÉLÉA

## Iframe ÉLÉA (exemple)
```html
<iframe src="https://VOTRE_USER.github.io/combustion-carbone-v2/"
        width="100%" height="700"
        style="border:0; border-radius:10px; overflow:hidden;"
        scrolling="no" allowfullscreen></iframe>
```
