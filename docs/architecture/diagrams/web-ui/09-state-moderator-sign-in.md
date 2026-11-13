# State diagram — web-ui — moderator sign-in and enrolment (brick 8b)

> **Feature**: web-ui (brick 8b, issue #210)
> **Use cases**: UC15, UC16
> **Business rules**: BR-054, BR-094, BR-095
> **Design**: `docs/architecture/design-pack.md` (retro modal dialog, entry form)

## Context

The "panneau modérateur" chosen by the owner (choice A, 425/500, 2026-11-13): a "connexion modérateur"
link on the entry form, an enrolment page reached by the invitation link, and the 8a queue dialog
(`web-ui/08`) with the moderator name in its title. Replaces the "modération" token field of 8a. Does
not cover the queue itself.

## Diagram

```mermaid
stateDiagram-v2
  state EntrySignIn {
    [*] --> Plain
    Plain --> Asking: "connexion modérateur"
    Asking --> Granted: grant received, notice "Clé acceptée : <nom>"
    Asking --> Plain: refused or cancelled, notice "clé refusée"
    Granted --> Plain: "annuler", or 60 s elapsed (notice "recommencez")
    Granted --> [*]: "entrer" sends the grant (UC1)
  }
  state Enrolment {
    [*] --> Ready: #/mod/enroll/token opened
    Ready --> Creating: "créer ma clé"
    Creating --> Done: enrolled, link back to the entry screen
    Creating --> Ready: device cancelled, notice
    Creating --> Refused: invitation expired, used or unknown
  }
```

## Notes

- WebAuthn runs only from the user's click (browser rule); no passkey prompt opens on page load.
- Without `PublicKeyCredential` the link shows "navigateur sans clé d'accès" and stays disabled.
- After `entered(isModerator)` the room screen shows the "signalements" button; the queue title reads
  "Signalements — <nom>".
- The grant lives in component state only, never in storage.
