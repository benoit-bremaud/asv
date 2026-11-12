# State diagram — web-ui — account panel

> **Feature**: web-ui (brick 5)
> **Use cases**: UC17, UC18, UC19
> **Business rules**: BR-070 to BR-073, BR-081, BR-087
> **Related ADRs**: ADR-0013, ADR-0014

## Context

The account panel in the chat and the "Membres" panel of the entry screen (owner choice 2026-10-23,
425/500: the entry panel reuses the pseudo form, enters the chat, then asks for the code). Does not
cover private windows (brick 6).

## Diagram

```mermaid
stateDiagram-v2
  [*] --> SignedOut
  SignedOut --> AskEmail: "Mon compte" button, or "recevoir mon code" on the entry screen once entered
  AskEmail --> WaitingCode: requestCode sent, codeSent received
  AskEmail --> AskEmail: warning (disposable domain, IP quota, invalid)
  WaitingCode --> WaitingCode: wrong code, tries left shown
  WaitingCode --> AskEmail: code expired or invalidated, "nouveau code"
  WaitingCode --> WaitingCode: resumed without accountId, panel kept open or closed (BR-087)
  WaitingCode --> SignedOut: entered or resumeRefused (new session, code lost)
  SignedOut --> WaitingCode: page reloaded, resumed without accountId before the saved code deadline (BR-087)
  WaitingCode --> RedeemingDevice: accountLinked with deviceClaim
  WaitingCode --> SignedIn: accountLinked without deviceClaim
  RedeemingDevice --> SignedIn: POST /account/device done or failed
  SignedOut --> SignedIn: entered or resumed with accountId
  SignedIn --> ConfirmDelete: "supprimer mon compte"
  ConfirmDelete --> SignedIn: cancel
  ConfirmDelete --> SignedOut: deleteAccount confirmed, accountUnlinked
  SignedIn --> SignedOut: sign out of this device (POST /account/sign-out)
  SignedIn --> SignedOut: signOutEverywhere, accountUnlinked
  SignedIn --> SignedOut: accountUnlinked from the server
```

## Notes

- The panel is a modal dialog over `InChat` (`web-ui/05`, #63), closable at any time with "fermer" or
  Escape; closing keeps the state and gives the focus back (`web-ui/04` Accessibility).
- **Entry screen "Membres" panel**: e-mail field, "se souvenir de cet appareil" box (ticked by default),
  "recevoir mon code" button. The button needs the pseudo form valid (pseudo, 18+, rules), shows a hint
  otherwise, then enters the chat and sends `requestCode` as soon as `entered` arrives. The code field
  then appears in the account overlay. A failed `POST /account/device` keeps the session signed in for
  this visit only and shows a notice.
- `codeSent` always reads "Si l'adresse peut recevoir un code, il vient d'être envoyé. Valable
  10 minutes." (ADR-0013 amendment, same answer).
- Sign-up legal notice, shown under the e-mail field and before deletion: "Ton e-mail est gardé 5 ans
  après la fermeture du compte, uniquement pour la loi." (ADR-0014, GDPR art. 13).
- `SignedIn` shows "connecté·e comme membre" (never the e-mail, since the client does not receive it) and
  the three actions. `entered.staleDevice` triggers `POST /account/sign-out` silently.
- **Tab switch (BR-087)**: `codeSent` saves the code deadline in `sessionStorage`. A resume keeps the
  code step in memory; after a reload, a resume before the deadline reopens the panel on the code step
  with the code field focused. A warning leading to `AskEmail`, "nouveau code" and `accountLinked` drop
  the deadline; `accountLinked` also clears an account notice such as "code envoyé" (#136).
- `WaitingCode` accepts digits only, six characters, and sends `verifyCode` on the sixth digit or on
  "valider".
