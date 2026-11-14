# Activity diagram — platform — deploy to staging and production, then the private switch

> **Feature**: platform (roadmap brick 9, issue #233)
> **Business rules**: BR-109, BR-111, BR-113
> **Related ADRs**: ADR-0018, ADR-0020

## Context

The owner-run procedure from a merged, green `main` to asvchat.fr, including the one-time setup and the switch
of the repository to private. Every step marked "owner yes" waits for the owner's explicit approval in chat.

## Diagram

```mermaid
flowchart TD
  Start([main merged, gate green]) --> First{First deploy?}
  First -->|yes| Setup["One-time setup, owner yes: Cloudflare zone asvchat.fr, Access apps and policies (site, owner), named and expiring API token"]
  Setup --> Secrets["Wrangler secrets per environment, owner yes (BR-111)"]
  Secrets --> Staging
  First -->|no| Staging["wrangler deploy --env staging, owner yes"]
  Staging --> Smoke{"Smoke on staging.asvchat.fr: entry, room, member sign-in, report, /owner behind Access"}
  Smoke -->|fail| Fix([Fix on a branch, back to the gate])
  Smoke -->|pass| Quiet["Pick a quiet hour: a deploy disconnects everyone (BR-109)"]
  Quiet --> Prod["wrangler deploy --env production, owner yes"]
  Prod --> Check{"Smoke on asvchat.fr"}
  Check -->|fail| Rollback["wrangler rollback, owner yes"] --> Fix
  Check -->|pass| FirstProd{First production deploy?}
  FirstProd -->|no| Done([Log the deploy in PROJECT_LOG.md])
  FirstProd -->|yes| Tunnel["Stop the tester tunnel; keep the local log file for its legal year (ADR-0018)"]
  Tunnel --> Derog["Record the visibility derogation in PROJECT_LOG.md"]
  Derog --> Private["gh repo edit --visibility private, owner yes"]
  Private --> Done
```

## Notes

- Staging and production have separate Durable Object namespaces, so staging data never meets production
  data. Staging secrets are distinct values.
- The derogation reason: production holds a live chat with moderation, the legal vault and DPIA material;
  publishing the running code's history is no longer wanted.
