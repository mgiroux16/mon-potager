# Spec de conception : PWA « Mon Potager Intelligent »

Date : 2026-06-24
Auteur : Mathieu Giroux (conception assistée)
Statut : en validation (réécriture périmètre élargi)
Remplace : la version eau-centrée du même jour. Le socle (palier 1) existe déjà, cette spec
se construit par-dessus, elle ne le réinitialise pas.

## 1. Objectif (périmètre élargi)

Une application personnelle, locale d'abord, pour le potager réel de Mathieu à Champniers
(16430). Ce n'est plus une simple app d'arrosage : c'est un **carnet de jardin fidèle + un
copilote actif + un tableau de bord chiffré**, sur **tout le vivant** (potager, verger arbre
par arbre, sol/compost, santé et biodiversité).

Trois promesses :
1. **Noter vite** ce qui se passe au jardin, depuis le téléphone, même hors-ligne.
2. **Être guidé** : un « à faire aujourd'hui » qui tient compte de la météo, de l'eau et du calendrier.
3. **Mesurer** : eau, rendements, économies réelles, saison après saison.

Cible matérielle : **Honor Magic 7 Pro (Android)**, installée comme PWA, accessible
rapidement comme un raccourci sur l'écran d'accueil.

## 2. Posture de confidentialité (local-first, à lire en premier)

C'est la règle qui prime sur tout le reste.

1. **Ta base ne sort jamais.** Tout ce que tu notes (journal, parcelles, cultures, arbres,
   eau, récoltes, dépenses) vit dans **IndexedDB, sur ton téléphone**. Aucun serveur,
   aucune IA ne peut « entrer » dans l'app ni lire ta base.
2. **Aucune IA n'a d'accès permanent.** Les fonctions IA ne se branchent pas sur ta base.
   Le sens de circulation est sortant et ponctuel : à un instant précis, **sur ton appui**,
   l'app envoie une seule chose et reçoit une réponse.
3. **Ce qui peut sortir, et rien d'autre :**
   - une **photo** de plante, quand tu appuies sur « diagnostiquer » ;
   - un **extrait que tu attaches toi-même** à une question de l'assistant.
4. **Assistant verrouillé en mode « partage explicite ».** L'assistant ne voit **que** ce que
   tu lui attaches. Il n'a aucun accès au reste de ta base, jamais.
5. **Aucune clé API en clair dans le navigateur.** Les appels IA passent par un **mini-relais
   Tailscale** sur la machine de Mathieu (voir §6).
6. **Caveat honnête.** Ce qui part (une photo, un extrait) est vu par le fournisseur. Sur le
   **palier gratuit de Google (Gemini)**, ces contenus **peuvent être conservés et réutilisés**
   pour entraîner leurs modèles. Une feuille n'a rien de confidentiel, mais c'est documenté.
7. **Tout l'IA est optionnel.** Le copilote déterministe (§7) fonctionne à 100% en local,
   sans aucune IA. L'IA est un bonus, jamais un prérequis.

## 3. Les 8 décisions verrouillées

1. **Âme** : carnet fidèle + copilote actif + pilotage chiffré.
2. **Périmètre** : tout le vivant (potager, verger fiche par arbre, sol/compost,
   santé/biodiversité).
3. **Intelligence** : moteur déterministe explicable + diagnostic photo IA + assistant
   conversationnel **en mode partage explicite** (cf. §2 et §7).
4. **Météo** : Open-Meteo modèle Météo-France **AROME** haute résolution aux coordonnées GPS
   exactes + **évapotranspiration ET0** et température du sol. Pluie réelle : **pluviomètre
   manuel** (~5€) relevé le matin et saisi au journal. Sonde de PAC : appoint nocturne pour le
   **gel seulement** (le jour elle surchauffe au soleil, +2 à 4°C, non fiable).
5. **Copilote** : « à faire aujourd'hui » en consultation. L'**alerte gel poussée** en
   notification est **reportée en V2** (cf. §12).
6. **Module IA visuel** : **Gemini** (Google AI Studio, gratuit) pour diagnostic + conseil bio
   adapté ; **Pl@ntNet** (gratuit) pour l'identification d'espèce. **Claude API = repli payant**.
   On reste sur le gratuit (besoin léger et ponctuel).
7. **Pilotage chiffré** : eau + rendements (kg/pièces par légume et par an, comparaison
   inter-années) + **économies avec amortissement**. Dépense : consommable imputé à la saison /
   étalé sur la période d'usage (paille) / durable amorti sur sa durée de vie (bâche 80€ sur
   5 ans = 16€/an), + rattachement parcelle/culture/jardin + catégorie. Pas l'autonomie
   alimentaire (V2).
8. **Catalogue de légumes adapté Champniers** : base des 44 légumes zone océanique du brief
   « Potabook ». Alimente le calendrier idéal vs réel, les rotations, le compagnonnage.
   Éditable, s'enrichit chaque saison.

## 4. Cible matérielle & PWA

- **Appareil** : Honor Magic 7 Pro, Android, navigateur Chrome.
- **Installation** : invite d'ajout à l'écran d'accueil (Chrome gère l'install native sur
  Android, pas de manipulation manuelle). Icône, ouverture directe, plein écran.
- **Hors-ligne** : service worker + cache (déjà amorcé par `vite-plugin-pwa`). L'app marche au
  jardin sans réseau ; les fonctions IA, elles, demandent une connexion au moment de l'appel.
- **Notifications** : pas de notification poussée en v1. Le « à faire aujourd'hui » se consulte
  dans l'app. À noter pour la V2 : sur Android, le **Web Push fonctionne même app fermée**, ce
  qui rendra l'**alerte gel** simple à ajouter (pas de contrainte de type iOS).

## 5. Modèle de données unifié (esquisse, à affiner au plan)

**Le journal reste la source unique de vérité.** Tout événement est une entrée de journal typée ;
les arrosages, remplissages d'oya, relevés de pluviomètre, traitements, récoltes sont des **vues
filtrées**, pas des registres séparés.

Objets durables :
- `Parcel` : parcelle (nom, surface, exposition, sol, paillage, humidité, notes, photo).
- `Crop` : culture rattachée à une parcelle (nom, variété, dates semis/plantation/récolte,
  statut, besoin en eau, problèmes observés).
- `Oya` : réservoir d'irrigation lente (nom, parcelle, capacité, niveau, cultures couvertes).
- `FruitTree` : arbre fruitier, **une fiche par arbre** (nom, variété, parcelle, ombre portée,
  besoin en eau, taille, état).
- `WaterTank` : cuve de récupération (nom, capacité, niveau estimé).
- `CatalogItem` : entrée du catalogue Champniers (légume, fenêtres de semis/plantation/récolte
  idéales, famille pour rotation, compagnons, anti-compagnons). Éditable.
- `Expense` : dépense avec règle d'amortissement (type consommable/étalé/durable, montant, durée
  de vie, rattachement parcelle/culture/jardin, catégorie).
- `SoilNote` / `CompostNote` : suivi sol et compost (apports, BRF, paillage, observations).
- `AppSettings` : localisation et coordonnées GPS, seuils (gel, pluie significative, chaleur,
  surveillance/remplissage oya), débit d'arrosage par défaut, capacité totale des cuves,
  préférence IA (niveau choisi).

Flux d'événements :
- `GardenLogEntry` : registre unique. Champ `type` (arrosage, remplissage_oya, releve_pluie,
  recolte, semis, plantation, paillage, traitement, observation, probleme, compost, taille,
  depense, diagnostic, note). Champs optionnels selon le type : `parcelId`, `cropId`, `oyaId`,
  `treeId`, `volumeLiters`, `rainMm`, `quantityKg`, `expenseRef`, `date`, `time`, `title`,
  `description`, `photoUrls`.

Dérivés (calculés, jamais stockés) :
- `WeatherData` : calé sur la réponse Open-Meteo (AROME, ET0, température sol).
- `Recommendation` : généré par le moteur (cible, sévérité, titre, message, **liste de raisons**).
- `WaterUsageSummary`, `WaterAutonomy`, `YieldSummary`, `SavingsSummary` : agrégats à la volée.

## 6. Architecture (couches)

- `data/` : schéma **Dexie** + données de démo (le vrai jardin) + catalogue Champniers.
- `services/` : logique métier **pure et testable**, aucune dépendance React (volume d'eau,
  autonomie des cuves, ET0, moteur de reco, calendrier idéal vs réel, amortissement des
  dépenses, agrégats de rendement, client météo Open-Meteo, client IA).
- `hooks/` : ponts React vers les services et le stockage.
- `components/` + `pages/` : UI mobile-first (les 6 pages du socle, à remplir).
- `pwa/` : service worker + manifest + abonnement Web Push.
- **Mini-relais Tailscale** (hors front, sur la machine de Mathieu), **rôles strictement limités** :
  1. cacher les clés API (Gemini) : le front ne les voit jamais ;
  2. relayer l'appel assistant/diagnostic (le front envoie la photo ou l'extrait attaché, le
     relais ajoute la clé et transmet).
  En v1, le relais n'a besoin d'être actif **que quand tu utilises une fonction IA**, pas en
  permanence. L'alerte gel push (qui exigerait une machine allumée en continu) est reportée en
  V2. Ce n'est **pas** un backend qui stocke des données : il ne fait que relayer.

Règle : la logique métier ne vit jamais dans les composants. Chaque service répond à
« que fait-il, comment l'utiliser, de quoi dépend-il ».

## 7. Intelligence (trois niveaux distincts)

1. **Copilote déterministe (100% local, par défaut).** Une fonction de score unifiée fusionne
   les règles eau/oyas/météo/calendrier, seuils lus dans les Réglages. Chaque reco est
   **explicable** (liste de raisons). Ton inspiré de l'expert « Jacques » : diagnostic chiffré,
   action sur 7-15 jours, points de vigilance, honnête et sans flatterie. **Aucune donnée ne
   sort.**
2. **Diagnostic photo (opt-in, photo seule).** Sur appui, une photo part vers **Pl@ntNet**
   (identification) ou **Gemini** (diagnostic + conseil bio). Rien d'autre que l'image. Via le
   mini-relais (§6).
3. **Assistant conversationnel (opt-in, mode « partage explicite » verrouillé).** Tu poses une
   question et tu **attaches toi-même** la note ou la culture concernée. L'assistant ne voit
   **que** ce que tu attaches, zéro accès au reste de la base. Via le mini-relais.

## 8. Météo et mesures terrain

- **Open-Meteo, modèle AROME** aux coordonnées GPS de Champniers, sans clé API.
- **ET0** (évapotranspiration de référence) et **température du sol** intégrées au type
  `WeatherData` dès le départ : ce sont elles qui pilotent les besoins en eau réels.
- **Pluie réelle** : saisie manuelle d'un **pluviomètre** (~5€) au journal, plus fiable que la
  prévision pour le cumul tombé.
- **Sonde de PAC** : utilisée **uniquement** comme appoint pour le gel nocturne (le jour, elle
  surchauffe au soleil et n'est pas fiable).

## 9. Pilotage chiffré

- **Eau** : litres par semaine et par parcelle, réserve des cuves, projection d'autonomie.
- **Rendements** : kg ou pièces par légume et par an, comparaison inter-années.
- **Économies avec amortissement** : consommable imputé à la saison, étalé sur sa période
  d'usage (paille), ou durable amorti sur sa durée de vie. Rattachable à une parcelle, une
  culture ou le jardin entier, avec catégorie.

## 10. Catalogue Champniers (44 légumes « Potabook »)

Base éditable de légumes adaptés à la zone océanique de Champniers. Elle alimente :
- le **calendrier idéal vs réel** (ce qu'il faudrait faire vs ce que Mathieu a réellement fait) ;
- les **rotations** (familles) ;
- le **compagnonnage** (compagnons et anti-compagnons).
Le catalogue s'enrichit chaque saison.

## 11. Données de démo réelles (le vrai jardin)

- Localisation : Champniers 16430, océanique dégradé, USDA 8b, sol argilo-calcaire pH 7,2-7,8,
  profondeur travaillable 10-20 cm.
- Potager : 100-110 m². Eau : 5 cuves (~2500 L total), goutte-à-goutte gravitaire.
- Cultures (état mai 2026) : ~100 pieds de tomates (30 aux oyas), pommes de terre Agata sur
  20 m linéaires, oignons/ail/échalotes, courgettes, courges, patisson, patate douce, haricots
  rames.
- Verger : pommier Belchard, Red Delicious, pêcher plat (2 pieds), prunabricotier hybride,
  poirier Williams, poirier portugais, nectarinier portugais.
- Méthodes : permaculture, BRF, paillage permanent, rotations. Zéro phyto de synthèse.
- ~40 photos disponibles dans `~/PROJETS-IA/Conseiller potager/`.

## 12. Périmètre v1 et au-delà

**Inclus en v1** (construit par paliers) : carnet/journal unifié, parcelles, cultures, verger
fiche par arbre, oyas, récoltes, réserve d'eau, sol/compost, dépenses amorties, tableau de bord
chiffré, météo AROME + ET0 + pluviomètre, copilote déterministe, calendrier idéal vs réel,
catalogue Champniers, diagnostic photo et assistant (opt-in), PWA installable,
accès distant Tailscale, sauvegarde export/import JSON.

**Hors v1 (V2)** : **alerte gel push (Web Push)**, plan visuel riche (fond photo aérienne +
carte d'ensoleillement), mode « tournée du soir », capteurs Home Assistant, sync multi-appareils,
autonomie alimentaire, Cloudflare Tunnel, backend/Supabase.

## 13. Les 8 paliers (ordre validé) et état du code

Le **palier 1 est déjà fait** (socle présent dans `~/PROJETS-IA/mon-potager`). On construit
par-dessus, on ne réinitialise pas.

1. **Socle (FAIT)** : Vite + React 19 + react-router-dom 7 + Tailwind 4 + vite-plugin-pwa +
   lucide-react + oxlint + TypeScript. 6 pages vides routées (`/`, `/journal`, `/ajouter`,
   `/jardin`, `/eau`, `/reglages`) + Layout. **Pas encore de Dexie, ni service, ni modèle.**
2. **Modèle unifié + Dexie** : types, schéma de stockage, catalogue Champniers, le vrai jardin chargé.
3. **Saisie rapide + vocale + journal** filtrable + recherche.
4. **Eau + cuves + météo AROME + pluviomètre + ET0** : tableau de bord eau et autonomie.
5. **Calendrier idéal vs réel + copilote** « à faire aujourd'hui ».
6. **Compagnon IA visuel (Gemini + Pl@ntNet) + assistant** en mode partage explicite.
7. **Pilotage chiffré** : rendements + économies amorties + bilan de saison.
8. **Déploiement Tailscale + mini-relais (pour l'IA) + sauvegardes** et documentation.
   (L'alerte gel push passe en V2.)

## 14. Méthode de livraison : paliers avec validation

Chaque palier : je code, je vérifie que ça compile et tourne, je corrige les bugs en boucle
jusqu'à ce que l'étape soit propre, je montre, Mathieu valide ou on corrige, puis on enchaîne.
**Jamais de gros livrable d'un coup.**

## 15. Emplacement du projet

`~/PROJETS-IA/mon-potager` (séparé du projet Claude « Conseiller potager », qui reste
l'assistant conversationnel ; cette PWA est l'outil de suivi). Données réelles et photos pour la
démo dans `~/PROJETS-IA/Conseiller potager/`.
