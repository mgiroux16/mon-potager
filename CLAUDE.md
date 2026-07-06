# Instructions projet — Mon Potager

PWA cloud-first (React 19 + Vite + Firestore + PWA). Firestore (`users/<uid>/<table>`) est la source de vérité unique, lu en temps réel (`useCollection`/`useDoc`, cache persistant natif pour le hors-ligne) et écrit directement (`cloudPut`/`cloudAdd`/`cloudDelete`, `serverTimestamp()`). Dexie ne garde que `auditLog` (journal système local, jamais synchronisé). Mono-utilisateur (Mathieu). Usage mobile **et** desktop, Firestore assure la synchro entre les deux nativement. Le journal `GardenLogEntry` est le registre unique d'événements.

## Refonte en cours

La refonte UX/produit est spécifiée dans `docs/audit/` :
- `2026-06-29-audit-ux-produit.md` — constats et reco.
- `2026-06-29-brief-claude-code-implementation.md` — **le plan d'implémentation à suivre** (phases 1A → 3, critères d'acceptation).
- `LANCEMENT-CLAUDE-CODE.md` — prompts par phase.

Avant de coder une fonctionnalité de la refonte, lire la phase correspondante du brief.

## Règles de travail (non négociables)

- **Une phase = un commit.** Ne pas enchaîner plusieurs phases sans validation de Mathieu.
- **Toujours proposer un plan avant de coder**, puis attendre validation.
- **Ne rien régresser :** `npm test` (Vitest) et `npm run lint` (oxlint) verts à chaque fin de phase. Chaque ajout a ses tests.
- **Local-first :** tout marche hors-ligne ; l'IA est optionnelle et en « partage explicite » (ne voit que ce que Mathieu attache).
- **Mobile + desktop** sur chaque écran.
- Pas de nouvelle dépendance lourde sans justification. **Pas de LLM local in-browser** (hors périmètre V1).

## Décisions figées

- Navigation = 4 intentions : `Aujourd'hui` · `Carnet` · `Jardin` · `Pilotage` (+ bouton central « Ajouter »).
- Couleurs sémantiques : marque=vert, Eau=bleu, Récolte=ambre, **Argent=indigo**, Alerte=rouge.
- Saisie dépense : le bouton « Dépense » de QuickAdd ouvre le **formulaire Dépense complet** (table `expenses`, une seule source de vérité). Pas de log `depense` sans montant.

## Politique modèle / réflexion (plan Pro — Opus seulement si ça paie)

Par défaut **Sonnet**. **Opus** réservé aux deux phases risquées :
- Phase **1C (Argent)** : migration Dexie + amortissement → Opus, `think hard`.
- Phase **2 (sync)** : sync incrémentale + résolution de conflits → Opus, `think hard`.

Tout le reste (cadrage, 1A nav, 1B dashboard, 2B design, 3 assistant) → Sonnet (`think` pour les plans, normale pour l'exécution). Faire le **plan** des phases risquées en Opus puis basculer Sonnet pour l'exécution (`/model`). `ultrathink` seulement si blocage réel, jamais en préventif.

## Conventions

- Langue : français, tutoiement.
- Livrer le travail sans long commentaire après livraison ; demander si le brief est flou plutôt que deviner.
