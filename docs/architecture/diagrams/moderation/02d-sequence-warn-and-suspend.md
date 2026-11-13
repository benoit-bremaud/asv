# Sequence diagram — moderation — warn, third strike, suspension

> **Feature**: moderation
> **Use cases**: UC12, UC11
> **Business rules**: BR-057, BR-074 to BR-078, BR-081
> **Related ADRs**: ADR-0012, ADR-0014

## Context

The three-strike path for a target whose report carries an account id. A target without an account can
only be expelled with a timed IP and pseudo ban (see 02a). Does not cover severe cases (see the UC11 spec).

## Diagram

```mermaid
sequenceDiagram
  actor M as Moderator
  participant H as Hub
  participant D as Domain
  participant AS as Account store
  participant ST as Moderation store
  participant ML as Mailer
  participant T as Target sessions
  M->>H: closeReport(reportId, warned)
  H->>ST: load report with targetAccountId
  H->>AS: load account
  H->>D: warn(state, report, account, moderator, now)
  D-->>H: Strike + active strikes count
  H->>AS: save account with strike
  H-->>T: warned(rule, activeStrikes) if connected
  alt Fewer than 3 active strikes
    H->>ST: close report with outcome warned
    H-->>M: reportClosed
  else Third active strike
    H-->>M: suspensionProposed(accountId, reportId, activeStrikes)
    alt Moderator confirms
      M->>H: confirmSuspension(accountId, reportId)
      H->>D: suspend(state, account, moderator, now)
      D-->>H: Statement + block until now + 7 days + all sessions and away records + IP and pseudo ban
      H->>ST: save ban (keyed IP and pseudo hashes)
      H->>AS: blockEmail, deleteAccount + vault record, same transaction (BR-081)
      H-)ML: send statement of reasons, not awaited (refused: retried every 10 min, BR-076)
      H-->>T: expelled(until) then close every socket of the account
      H->>ST: close report with outcome suspended
      H-->>M: reportClosed
    else Moderator declines
      M->>H: declineSuspension(accountId, reportId)
      H->>ST: close report with outcome warned
      H-->>M: reportClosed
    end
  end
```

## Notes

- A second `closeReport(warned)` on the same report adds no strike (`struckAt`, BR-074): it proposes
  the suspension again at three active strikes, otherwise closes the report as `warned`.
- Write order on `confirmSuspension`: a failure before the account deletion leaves the report open
  to retry on; after it, the statement and the evictions still happen and only the report stays open
  (`warning(unavailable)` to the moderator, #212).
- The report is closed once the final choice is known: outcome `warned` or `suspended` (BR-057).
- If the moderator leaves before choosing, the proposal is shown again next time: it is derived from
  the active strikes, not stored (BR-075).
- The statement of reasons lists the facts, the terms clause, whether AI triage was used, and how to
  contest by replying to the contact address (DSA art. 17). It is retried until sent, for at most 7 days.
- Every account deletion, including this one, writes the legal retention record to the vault in the same
  transaction (ADR-0014). The vault holds no reason, strike or report.
- A warning itself restricts nothing, so it is notified in the chat only.
