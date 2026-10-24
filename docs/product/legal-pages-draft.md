# Legal pages — provisional draft for the tester exposure (ADR-0018)

Not legal advice. Short provisional texts shown during the tester exposure (issue #54). The full legal
pack comes in brick 10 (`docs/architecture/security-and-rgpd.md` §5). The texts are in French because
the site is. Fields in `{braces}` are filled at run time from environment variables set by the owner, never
committed (owner choice 2026-10-24). `{Brevo processing location}` and the Cloudflare transfer
framework are checked against the providers' DPAs before exposure.

## Règles du chat (CGU provisoires)

> asv est un chat rétro en phase de test, réservé aux personnes majeures (18 ans ou plus).
> En entrant, tu t'engages à : respecter les autres, ne pas harceler, ne publier aucun contenu illégal
> (haine, menaces, contenu sexuel impliquant des mineurs, incitation à la violence), ne pas te faire
> passer pour quelqu'un d'autre. Signaler sciemment un contenu licite comme illicite est puni par la loi
> (LCEN art. 6 VII).
> Pendant la phase de test, le site peut être coupé ou remis à zéro à tout moment : salons, messages et
> comptes sont effacés à chaque redémarrage.
> Le responsable du site peut exclure toute personne qui ne respecte pas ces règles. Aucune sanction
> n'est décidée par une machine.

## Mentions légales

> Éditeur et hébergeur pendant la phase de test : {owner name}, particulier, non professionnel,
> {owner postal address}, {owner phone}. Le site est hébergé sur sa machine personnelle, en France.
> Directeur de la publication : {owner name}.
> Acheminement HTTPS (ce n'est pas l'hébergement) : Cloudflare, Inc., 101 Townsend St, San Francisco,
> CA 94107, États-Unis.
> Contact, y compris pour les autorités et le droit de réponse : {contact e-mail}.

## Confidentialité

> Responsable du traitement : {owner name} (voir mentions légales). Contact : {contact e-mail}.
>
> | Ce que nous traitons | Pourquoi | Base légale | Combien de temps |
> |---|---|---|---|
> | Journal de connexion (adresse IP, date et heure, pseudo, identifiant de compte) et une ligne par message envoyé, sans son contenu | Obligation des hébergeurs (LCEN art. 6, décret 2021-1362) | Obligation légale (RGPD art. 6(1)(c)) | 1 an |
> | Adresse e-mail, si tu crées un compte (facultatif, seulement pour les messages privés) | Envoyer le code de connexion, gérer le compte | Contrat (art. 6(1)(b)) | Jusqu'à la suppression du compte ou l'arrêt du serveur de test |
> | Trace légale d'un compte fermé (identifiant, e-mail, dates), scellée | Obligation des hébergeurs (décret 2021-1362 arts. 2 et 3) | Obligation légale | Identifiant 1 an, e-mail et dates 5 ans |
> | Cookie de connexion, si tu restes connecté | Te garder connecté | Exempté de consentement (strictement nécessaire, loi Informatique et Libertés art. 82) | 30 jours |
>
> Ce que nous ne gardons jamais : ton sexe, ton âge, ta ville, le contenu des messages.
> Destinataires : Brevo (envoi du code par e-mail, sous-traitant, {Brevo processing location}),
> Cloudflare (acheminement ; données traitées aussi aux États-Unis, cadre EU-US Data Privacy Framework).
> Les autorités habilitées par la loi peuvent obtenir le journal légal sur réquisition.
> Aucune publicité, aucune mesure d'audience, aucun traceur tiers.
> Tes droits : accès, rectification, effacement, opposition, limitation, portabilité, en écrivant au
> contact. Le journal légal n'est pas couvert par l'effacement (RGPD art. 17(3)(b)). Tu peux saisir la
> CNIL (cnil.fr).

## Notice before the e-mail code (account panel)

> Ton adresse sert uniquement à t'envoyer un code de connexion (via Brevo) et à gérer ton compte. Elle
> est chiffrée chez nous. Détails dans « confidentialité ».
