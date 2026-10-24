import { useEffect, useState, type ReactNode } from "react";
import { STRINGS } from "../strings";

/** The three provisional legal pages of ADR-0018 (`web-ui/05`, `LegalPage`). */
export type LegalTopic = "rules" | "notice" | "privacy";

/** Owner identity served by `/api/legal` from the environment; never in the bundle. */
interface LegalIdentity {
  readonly ownerName?: string;
  readonly postalAddress?: string;
  readonly phone?: string;
  readonly contactEmail?: string;
  readonly brevoLocation?: string;
}

const MISSING = "(à compléter)";
const PRIVACY_COLUMNS = ["Ce que nous traitons", "Pourquoi", "Base légale", "Combien de temps"] as const;

const isIdentity = (value: unknown): value is LegalIdentity => typeof value === "object" && value !== null;

const Rules = () => (
  <>
    <p>asv est un chat rétro en phase de test, réservé aux personnes majeures (18 ans ou plus).</p>
    <p>
      En entrant, tu t'engages à : respecter les autres, ne pas harceler, ne publier aucun contenu illégal (haine,
      menaces, contenu sexuel impliquant des mineurs, incitation à la violence), ne pas te faire passer pour quelqu'un
      d'autre. Signaler sciemment un contenu licite comme illicite est puni par la loi (LCEN art. 6 VII).
    </p>
    <p>
      Pendant la phase de test, le site peut être coupé ou remis à zéro à tout moment : salons, messages et comptes sont
      effacés à chaque redémarrage.
    </p>
    <p>Le responsable du site peut exclure toute personne qui ne respecte pas ces règles. Aucune sanction n'est décidée par une machine.</p>
  </>
);

const Notice = ({ id }: { id: LegalIdentity }) => (
  <>
    <p>
      Éditeur et hébergeur pendant la phase de test : {id.ownerName ?? MISSING}, particulier, non professionnel,{" "}
      {id.postalAddress ?? MISSING}, {id.phone ?? MISSING}. Le site est hébergé sur sa machine personnelle, en France.
    </p>
    <p>Directeur de la publication : {id.ownerName ?? MISSING}.</p>
    <p>
      Acheminement HTTPS (ce n'est pas l'hébergement) : Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107,
      États-Unis.
    </p>
    <p>Contact, y compris pour les autorités et le droit de réponse : {id.contactEmail ?? MISSING}.</p>
  </>
);

const Privacy = ({ id }: { id: LegalIdentity }) => (
  <>
    <p>
      Responsable du traitement : {id.ownerName ?? MISSING} (voir mentions légales). Contact : {id.contactEmail ?? MISSING}.
    </p>
    <table className="legal-table">
      <thead>
        <tr>{PRIVACY_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr>
      </thead>
      <tbody>
        <tr>
          <td data-label={PRIVACY_COLUMNS[0]}>Journal de connexion (adresse IP, date et heure, pseudo, identifiant de compte) et une ligne par message envoyé, sans son contenu</td>
          <td data-label={PRIVACY_COLUMNS[1]}>Obligation des hébergeurs (LCEN art. 6, décret 2021-1362)</td>
          <td data-label={PRIVACY_COLUMNS[2]}>Obligation légale (RGPD art. 6(1)(c))</td>
          <td data-label={PRIVACY_COLUMNS[3]}>1 an</td>
        </tr>
        <tr>
          <td data-label={PRIVACY_COLUMNS[0]}>Adresse e-mail, si tu crées un compte (facultatif, seulement pour les messages privés)</td>
          <td data-label={PRIVACY_COLUMNS[1]}>Envoyer le code de connexion, gérer le compte</td>
          <td data-label={PRIVACY_COLUMNS[2]}>Contrat (art. 6(1)(b))</td>
          <td data-label={PRIVACY_COLUMNS[3]}>Jusqu'à la suppression du compte ou l'arrêt du serveur de test</td>
        </tr>
        <tr>
          <td data-label={PRIVACY_COLUMNS[0]}>Trace légale d'un compte fermé (identifiant, e-mail, dates), scellée</td>
          <td data-label={PRIVACY_COLUMNS[1]}>Obligation des hébergeurs (décret 2021-1362 arts. 2 et 3)</td>
          <td data-label={PRIVACY_COLUMNS[2]}>Obligation légale</td>
          <td data-label={PRIVACY_COLUMNS[3]}>Identifiant 1 an, e-mail et dates 5 ans</td>
        </tr>
        <tr>
          <td data-label={PRIVACY_COLUMNS[0]}>Cookie de connexion, si tu restes connecté</td>
          <td data-label={PRIVACY_COLUMNS[1]}>Te garder connecté</td>
          <td data-label={PRIVACY_COLUMNS[2]}>Exempté de consentement (strictement nécessaire, loi Informatique et Libertés art. 82)</td>
          <td data-label={PRIVACY_COLUMNS[3]}>30 jours</td>
        </tr>
      </tbody>
    </table>
    <p>Ce que nous ne gardons jamais : ton sexe, ton âge, ta ville, le contenu des messages.</p>
    <p>
      Destinataires : Brevo (envoi du code par e-mail, sous-traitant, {id.brevoLocation ?? MISSING}), Cloudflare
      (acheminement ; données traitées aussi aux États-Unis, cadre EU-US Data Privacy Framework). Les autorités
      habilitées par la loi peuvent obtenir le journal légal sur réquisition.
    </p>
    <p>Aucune publicité, aucune mesure d'audience, aucun traceur tiers.</p>
    <p>
      Tes droits : accès, rectification, effacement, opposition, limitation, portabilité, en écrivant au contact. Le
      journal légal n'est pas couvert par l'effacement (RGPD art. 17(3)(b)). Tu peux saisir la CNIL (cnil.fr).
    </p>
  </>
);

/** A legal page as a non-modal dialog over the current screen; identity fields show "(à compléter)" until set. */
export const LegalPage = ({ topic, onClose }: { readonly topic: LegalTopic; readonly onClose: () => void }) => {
  const [identity, setIdentity] = useState<LegalIdentity>({});
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const response = await fetch("/api/legal");
        const body: unknown = response.ok ? await response.json() : {};
        if (live && isIdentity(body)) setIdentity(body);
      } catch {
        // Offline: the page still shows its text with "(à compléter)".
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, []);
  const body: Record<LegalTopic, ReactNode> = { rules: <Rules />, notice: <Notice id={identity} />, privacy: <Privacy id={identity} /> };
  return (
    <dialog open aria-label={STRINGS.legal[topic]} className="panel legal-page">
      <h2>{STRINGS.legal[topic]}</h2>
      {body[topic]}
      <button type="button" className="bevel" onClick={onClose}>{STRINGS.close}</button>
    </dialog>
  );
};
