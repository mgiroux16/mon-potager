# Mon Potager : synthèse de l'application et du code

Document de passation rédigé le 2026-07-05 après une session d'analyse approfondie (diagnostic quota Firestore + plan de migration). Destinataire : un autre agent (Cowork) chargé de proposer des améliorations. Tout ce qui suit a été vérifié dans le code, pas supposé.

## 1. Le produit

PWA de carnet de potager pour un utilisateur unique (Mathieu, jardin de 578 m² à Champniers, Charente). Usage mobile (posée sur l'écran d'accueil) ET desktop, avec synchronisation entre les deux. L'app sert à :

- tenir le **journal du jardin** (arrosages, pluie, récoltes, semis, plantations, traitements, observations, problèmes, dépenses... 18 types d'événements), y compris par **dictée vocale** avec écran de relecture avant validation ;
- piloter l'**eau** (cuves, oyas, autonomie, comparaison arrosage/météo via Open-Meteo) ;
- suivre les **parcelles, cultures, arbres fruitiers, variétés** (avec carte du jardin en grille, drag and drop) ;
- suivre l'**argent** (dépenses, amortissement, récurrence, valorisation des récoltes) ;
- produire des **bilans de saison**, un calendrier de semis (catalogue 22 légumes), des diagnostics de problèmes ;
- un **assistant IA optionnel** (Gemini) en « partage explicite » : il ne voit que ce que Mathieu attache.

Principe cardinal : **le journal (`GardenLogEntry`) est l'unique registre d'événements** ; arrosages, récoltes, dépenses sont des vues filtrées de ce journal.

## 2. Stack et volumes

- React 19 + TypeScript + Vite, Tailwind (v4, plugin Vite), react-router 7 (HashRouter), lucide-react. Dépendances volontairement minimales (7 en production).
- Données : Dexie 4 (IndexedDB, base `mon-potager`) + Firebase 12 (Auth Google, Firestore).
- PWA : vite-plugin-pwa (generateSW), HTML servi en NetworkFirst, assets précachés, vérification de mise à jour toutes les 30 min + bannière de mise à jour cliquable (ajoutée le 05/07) avec `version.json` publié à chaque build.
- Tests : Vitest + Testing Library + fake-indexeddb, **477 tests, 63 fichiers** (~6 500 lignes de tests pour ~10 500 lignes de code source). Lint : oxlint. CI : GitHub Actions déploie sur GitHub Pages (`mgiroux16.github.io/mon-potager/`) à chaque push sur `main`.
- Code : 20 pages, 17 composants, 33 services. Les services sont bien séparés (waterUsage, tankAutonomy, todayAgenda, seasonSummary, voiceParse, weather...) et testés unitairement.

## 3. Architecture données (le point central)

### 3.1 État actuel : double couche avec synchro maison

- **Dexie = source de vérité locale.** 14 tables : `log`, `parcels`, `crops`, `oyas`, `trees`, `tanks`, `catalog`, `expenses`, `soil`, `settings`, `varieties`, `seasonNotes`, `diagnostics`, `auditLog` (cette dernière locale, jamais synchronisée). Ids UUID (migration Dexie v4-v7 depuis les ids auto-incrémentés), 13 versions de schéma dans `src/data/db.ts`.
- **Firestore = miroir de synchro** entre appareils, chemin `users/{uid}/{table}/{id}`, plan **Spark gratuit** (50 k lectures / 20 k écritures / jour), cache persistant multi-onglets activé.
- **Couche de synchro maison** :
  - `src/data/syncHooks.ts` : hooks Dexie `creating`/`updating` qui poussent chaque écriture vers Firestore (`pushRecord`), garde anti-écho `markRemoteWrite`/`remoteEchoKeys`, soft delete par tombstone `deletedAt` + hook `reading` qui masque les tombstones, `withMaintenanceMode` pour les lire quand même.
  - `src/services/syncService.ts` : sync initiale incrémentale par curseurs `updatedAt` (localStorage, buffer anti-décalage d'horloge de 5 min), listeners `onSnapshot` par table, merge last-write-wins (`syncMerge.ts`), purge des tombstones > 30 jours, dédoublonnage.
  - `src/components/AuthGate.tsx` : orchestre auth Google → purge tombstones → sync initiale → listeners temps réel (single-flight par uid).

### 3.2 Historique d'incidents de cette couche (important)

Cette couche maison a produit une série de boucles d'écriture : fuite mémoire 5 Go (écho snapshot→put→push sur tombstones), dedupe au démarrage qui réécrivait des tombstones à chaque reload, rejeu de la chaîne de sync à chaque refresh de token. Dernier épisode (04/07) : ~10 000 écritures + ~11 000 lectures en 4 min à l'ouverture, quota épuisé. **Diagnostic confirmé le 05/07** : pas une boucle active, mais le **backlog de mutations du cache persistant Firestore** (le SDK traite `resource-exhausted` comme retryable : toute écriture émise pendant un épuisement de quota reste dans IndexedDB et rejoue à CHAQUE ouverture). Backlog purgé manuellement (suppression de la base IndexedDB `firestore/...`, hors-ligne).

### 3.3 Cible décidée : migration cloud-first (option B)

Plan complet dans `docs/superpowers/plans/2026-07-05-migration-cloud-first-option-b.md`. En résumé : Firestore devient la source de vérité unique, lectures par `useCollection`/`useDoc` (déjà écrits dans `src/data/firestoreHooks.ts`, pas encore branchés), écritures directes `setDoc` avec `updatedAt: serverTimestamp()`, hors-ligne par le cache natif, démontage complet de la couche maison (tombstones et curseurs compris), Dexie réduit à `auditLog`. Migration table par table, journal d'abord, un commit par lot, validation entre les lots. Préalables déjà en place : règles Firestore vérifiées (étape 0), outil de réconciliation local→serveur (`/dev/reconciliation`, étape 2).

### 3.4 État des données

Il reste de **vrais doublons** dans parcelles/cultures (même nom en double ou triple, variantes « (copie) »), créés avant que la synchro fonctionne. Le nettoyage est prévu au Lot 3 du plan (fusion batchée côté Firestore) ; le service actuel `dedupeService.ts` fonctionne mais écrit une mise à jour par entrée de journal remappée, donc coûteux en quota (c'est pour ça qu'il attend).

## 4. Navigation et UX

- 4 intentions : `Aujourd'hui` (dashboard actionnable : météo, agenda du jour, alertes) · `Carnet` (journal, diagnostics, assistant) · `Jardin` (parcelles, carte, eau, verger) · `Pilotage` (bilan, récoltes, argent, calendrier), + bouton central « Ajouter » (QuickAdd, avec sas vocal).
- Nav basse fixe sur mobile (max-w-md), disposition élargie sur desktop (breakpoint lg). Couleurs sémantiques figées : marque=vert, eau=bleu, récolte=ambre, argent=indigo, alerte=rouge.
- Refonte UX en cours, spécifiée dans `docs/audit/2026-06-29-audit-ux-produit.md` et `2026-06-29-brief-claude-code-implementation.md` (phases 1A nav et 1B dashboard livrées ; 2B système de design et 3 assistant restent à faire).

## 5. Contraintes non négociables (à respecter dans toute proposition)

1. **Local-first : tout marche hors-ligne.** L'IA est optionnelle et ne voit que ce qui est explicitement partagé. Pas de LLM local in-browser.
2. **Quota Firestore Spark gratuit** : ne JAMAIS proposer de passer au plan payant Blaze pour « régler » un problème. Toute solution doit être sobre en lectures/écritures. Ne pas lancer l'app en boucle contre le vrai Firestore pour tester.
3. **Mono-utilisateur**, mobile ET desktop sur chaque écran.
4. `npm test` (Vitest) et `npm run lint` (oxlint) verts à chaque étape ; chaque ajout a ses tests. Une phase = un commit, validation de Mathieu entre les phases, toujours un plan avant de coder.
5. Pas de nouvelle dépendance lourde sans justification.
6. Langue : français, tutoiement. Jamais de tiret em dans les textes.
7. Mathieu n'est pas développeur (très à l'aise no-code) : les propositions doivent être expliquées simplement et exécutables par un agent.

## 6. Zones d'amélioration déjà identifiées (pistes pour Cowork)

- **La priorité absolue est la migration cloud-first** (plan déjà écrit et validé) : éviter de proposer des refontes qui la contredisent ou la retardent.
- `GardenPage.tsx` cumule parcelles + verger (même composant monté sur deux routes) et grossit ; candidate à un découpage.
- Le monkey-patch de `Table.prototype.toArray` dans `syncHooks.ts` (filtrage des tombstones) est fragile ; il disparaîtra avec la migration, ne pas investir dessus.
- `exportService.ts` (export/import JSON + CSV) devra suivre la migration (il lit/écrit encore Dexie en masse).
- Phase 2B du brief UX (système de design cohérent) et Phase 3 (assistant en partage explicite) sont spécifiées mais pas commencées.
- Accessibilité : quelques bases en place (roles, labels), jamais auditée systématiquement.
- Le bundle dépasse l'avertissement de taille Vite (warning chunk > 500 k au build) ; pas de code-splitting par route à ce jour.

## 7. Repères pratiques

- Repo : `https://github.com/mgiroux16/mon-potager` (branche `main`, déploiement auto).
- Docs de référence dans `docs/audit/` (audit UX, brief d'implémentation par phases, brief du diagnostic quota) et `docs/specs/` (5 specs de fonctionnalités eau/récoltes).
- Instructions projet : `CLAUDE.md` à la racine.
- Fichiers pivots : `src/data/db.ts` (schéma), `src/data/model.ts` (types), `src/data/syncHooks.ts` + `src/services/syncService.ts` (couche à démonter), `src/data/firestoreHooks.ts` (lectures cloud-first prêtes), `src/components/AuthGate.tsx`, `vite.config.ts` (PWA + version.json).
