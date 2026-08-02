# Documents juridiques — note de livraison

Quatre documents, rédigés pour Encre & Plume au [DATE_MISE_A_JOUR] :

| Fichier | Objet | Statut |
|---|---|---|
| [`mentions-legales.md`](./mentions-legales.md) | Identification de l'éditeur, hébergeur, point de contact DSA | Obligatoire (art. 1-1 LCEN) |
| [`cgu.md`](./cgu.md) | Contrat d'utilisation, contenus, modération, gouvernance des groupes | Essentiel (service à comptes + UGC) |
| [`politique-de-confidentialite.md`](./politique-de-confidentialite.md) | Traitements RGPD, durées, sous-traitants, droits | Obligatoire |
| [`charte-communaute.md`](./charte-communaute.md) | Comportement, contenus, fan-art, formats, sanctions, recours | Partie intégrante des CGU |

**Non produits, et pourquoi.** Pas de **CGV** : le service est gratuit aujourd'hui. Pas de **politique cookies** : à produire dès qu'un traceur non strictement nécessaire est déposé (voir l'article 9 de la politique de confidentialité, qui en liste le contenu obligatoire).

**Mise en ligne.** Ces fichiers sont la source. Le Service sert son texte légal depuis la table `LegalDocument` (kinds `cgu`, `privacy`, `mentions`), qui ne contient aujourd'hui que des espaces réservés de 74 à 92 caractères — `[Contenu juridique à valider par l'équipe]`. Il faut donc : compléter les placeholders, faire relire, puis charger le texte validé en base avec un numéro de version, et rattacher la charte (aucun `LegalKind` ne lui correspond encore).

---

## 1. Champs à compléter

| Placeholder | Où trouver la valeur |
|---|---|
| `[NOM_DE_LA_SOCIETE]`, `[FORME_JURIDIQUE]`, `[CAPITAL_SOCIAL]`, `[NUMERO_RCS]`, `[VILLE_RCS]`, `[NUMERO_TVA]` | Extrait Kbis. **Structure non encore arrêtée** : les documents sont rédigés en version « société ». En entreprise individuelle ou en association, remplacer le bloc d'identification (indications dans les mentions légales). |
| `[ADRESSE_SIEGE_SOCIAL]`, `[TELEPHONE]`, `[EMAIL_CONTACT]` | Statuts / décision de l'exploitant |
| `[NOM_DIRECTEUR_PUBLICATION]`, `[QUALITE_DIRECTEUR_PUBLICATION]` | Représentant légal en principe |
| `[NOM_HEBERGEUR_WEB]`, `[NOM_HEBERGEUR_APPLICATIF]`, `[NOM_STOCKAGE_OBJET]`, `[NOM_SERVICE_EMAIL]`, `[NOM_SUPERVISION_ERREURS]` + adresses, téléphones, pays | Contrats d'hébergement et de sous-traitance. **Ne pas deviner** : une mention d'hébergeur inexacte est opposable. |
| `[EMAIL_POINT_CONTACT_AUTORITES]`, `[EMAIL_POINT_CONTACT_UTILISATEURS]`, `[EMAIL_CONTACT_RGPD]`, `[EMAIL_RECLAMATION]` | À créer et à faire relever réellement |
| `[NOM_DPO]`, `[EMAIL_DPO]` | Seulement si un DPO est désigné (art. 37 RGPD) |
| `[URL_SPECIFICATIONS_TECHNIQUES]` | **Document à écrire** — voir point de vigilance n° 3 |
| Toutes les `[DUREE_*]` de la politique de confidentialité | Décisions de l'exploitant. Aucune n'est une valeur légale. |
| `[TERRITOIRE_LICENCE]`, `[SUPPORTS_DE_PROMOTION_ENUMERES]`, `[DUREE_APRES_SUPPRESSION]` | Décisions produit — voir point de vigilance n° 4 |
| `[DELAI_PREAVIS_MODIFICATION]`, `[MOYEN_INFORMATION_MODIFICATION]`, `[MOYEN_DE_RECLAMATION]`, `[DELAI_TRAITEMENT_RECLAMATION]`, `[DUREE_SUSPENSION_TYPE]` | Décisions d'exploitation |
| `[VERSION_*]`, `[DATE_*]` | À la publication |

---

## 2. Points de vigilance

**1 — Âge minimum fixé à 15 ans (décision, 2026-08-02).** C'est le seuil à partir duquel un mineur consent seul au traitement de ses données en France (art. 8 RGPD, art. 45 loi 78-17). Conséquence : **aucun consentement parental à recueillir, à vérifier, à conserver ni à révoquer** — toute la mécanique correspondante disparaît, ainsi que le traitement des coordonnées d'un tiers parent.

Ce qu'il reste à faire, et c'est modeste : **la porte d'âge doit refuser l'inscription en dessous de 15 ans** (aujourd'hui la date de naissance est collectée, mais le seuil de création de compte est à vérifier dans le code), et la suspension d'un compte créé en méconnaissance de cette condition doit exister.

Subsiste un point mineur, traité par rédaction plutôt que par mécanisme : un utilisateur de 15 à 17 ans reste un mineur au sens du droit civil (art. 1145-1146 C. civ.), et un engagement excédant les actes de la vie courante lui est en principe inopposable. C'est pourquoi la licence de l'article 8.2 des CGU est **non exclusive, gratuite, limitée aux besoins du Service et révocable par la suppression du Contenu** : ainsi rédigée, elle ne demande pas au mineur un engagement qu'il ne peut pas valablement prendre. **Ne pas élargir cette licence** sans réexaminer ce point.

**2 — Un disclaimer sur le fan-art ne vous protège pas d'un ayant droit.** Votre clause organise les rapports avec vos utilisateurs ; elle est **inopposable au titulaire de droits**, qui n'est pas partie au contrat. Ce qui vous protège réellement, c'est le **statut d'hébergeur** (art. 6 LCEN ; art. 6 et 8 du DSA, absence d'obligation générale de surveillance) — et il est **conditionné au retrait prompt dès connaissance effective** d'un contenu manifestement illicite. Concrètement : une adresse de signalement qui fonctionne, un délai de traitement court et tenu, une trace de chaque décision, et une politique de récidive appliquée. Une modération éditoriale trop active (mise en avant, sélection) peut à l'inverse vous faire glisser vers un rôle d'éditeur, avec la responsabilité qui va avec. C'est un arbitrage produit autant que juridique.

**3 — Les spécifications techniques n'existent pas encore.** Les CGU et la Charte y renvoient comme à un document contraignant. Il faut l'écrire : format et dimensions de planche, rapport hauteur/largeur, résolution et mode colorimétrique, fond perdu et zones de sécurité, doubles pages, numérotation, couverture, formats de fichiers. Le code applique aujourd'hui un ratio de planche (`MANGA_PAGE_RATIO = 2 / 3`) ; les valeurs professionnelles exactes (B5, B6, dpi, fond perdu) sont une décision éditoriale à arrêter et à publier. **Les tenir hors du contrat est volontaire** : elles évolueront sans qu'il faille amender les CGU.

**4 — La licence sur les contenus est volontairement étroite.** Non exclusive, gratuite, limitée à l'exploitation et à la promotion du Service, pour la durée de publication augmentée d'un délai de purge. Il faut néanmoins arrêter le territoire, les supports de promotion et le délai. **Ne pas élargir** : une licence trop large sur une plateforme d'auteur·rices est à la fois un risque juridique (art. L. 131-3 CPI) et un problème de réputation.

**5 — Le crédit d'auteur est indisponible, y compris pour vous.** Le droit à la paternité est perpétuel et inaliénable (art. L. 121-1 CPI) : ni un utilisateur exclu, ni un chef de groupe, ni la plateforme ne peuvent supprimer un crédit. Les documents l'écrivent, et le code doit le rendre vrai — l'audit en cours a montré que la révocation d'un membre supprimait sa ligne de crédit. **Un document qui promet ce que le produit ne fait pas est pire que pas de document.**

**6 — Les obligations DSA sont opérationnelles, pas rédactionnelles.** Point de contact joignable, formulaire de signalement, exposé des motifs pour chaque mesure, recours interne gratuit ouvert six mois et traité par un humain. Les textes les décrivent ; il faut que le produit les serve. Les sanctions du DSA se comptent en pourcentage du chiffre d'affaires mondial.

**7 — Cohérence entre les quatre documents.** Identité de l'éditeur, adresses de contact, procédure de modération et échelle de sanctions doivent concorder. Une contradiction entre pages légales est l'un des constats les plus fréquents en contrôle.

---

## 3. À produire au lancement des fonctionnalités payantes

- **CGV** distinctes, avec l'information précontractuelle de l'art. L. 221-5 C. consom.
- **Fonctionnalité de rétractation en ligne** — obligatoire depuis le **19 juin 2026** (art. L. 221-21 et D. 221-5 C. consom.) : gratuite, clairement identifiée, accessible pendant tout le délai. Les CGV doivent dire où elle se trouve.
- **Médiateur de la consommation** effectivement souscrit, nommé dans les mentions légales (art. L. 616-1).
- **Résiliation en trois clics** si des abonnements sont proposés (art. L. 215-1-1).
- Mise à jour de la politique de confidentialité : prestataire de paiement, données de facturation, durées comptables.
- Reprise du principe de **non-rétroactivité de la clé de répartition** déjà posé à l'article 10 des CGU.

---

**Avertissement** — Ces documents sont des modèles rédigés à titre informatif, sur la base du droit français et européen en vigueur au [DATE_MISE_A_JOUR]. Ils ne constituent pas une consultation juridique et n'engagent pas la responsabilité de leur rédacteur. Avant toute mise en ligne, faites-les relire par un avocat spécialisé en droit du numérique et de la propriété intellectuelle. Pour les aspects données personnelles, les guides et modèles de la **CNIL** sont une ressource de référence ; pour les aspects droit d'auteur, la **SGDL**, le **SNAC** et la **Ligue des auteurs professionnels** proposent un accompagnement à leurs membres.
