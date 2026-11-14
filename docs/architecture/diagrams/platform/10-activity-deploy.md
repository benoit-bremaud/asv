# Activity diagram — platform — deploy to staging and production, then the private switch

> **Feature**: platform (roadmap brick 9, issue #233)
> **Business rules**: BR-108, BR-109, BR-111, BR-113
> **Related ADRs**: ADR-0018, ADR-0020

## Context

The owner-run procedure from a merged, green `main` to asvchat.fr, including the one-time setup and the switch
of the repository to private. Every step marked "owner yes" waits for the owner's explicit approval in chat.

## Diagram

```mermaid
flowchart TD
  Start([main merged, gate green]) --> First{First deploy?}
  First -->|yes| Setup["One-time setup, owner yes: Cloudflare zone asvchat.fr, spending limit on the Workers Paid plan (already subscribed), DPA of Cloudflare checked for Durable Object storage (EU jurisdiction), Access apps and policies (site, /owner with Service Auth), named and expiring API token and service token"]
  Setup --> Secrets["Wrangler secrets per environment, owner yes (BR-111): keys, owner secret, API keys, legal identity fields"]
  Secrets --> Staging
  First -->|no| Staging["wrangler deploy --env staging, owner yes"]
  Staging --> QA{"QA pass on staging.asvchat.fr, owner only: JRN-43 to JRN-45, moderation on (BR-108)"}
  QA -->|fail| Fix([Fix on a branch, back to the gate])
  QA -->|pass| Tag["Signed release tag vX.Y.Z"]
  Tag --> Quiet["Pick a quiet hour: a deploy disconnects everyone (BR-109)"]
  Quiet --> Prod["wrangler deploy --env production from the tag, owner yes"]
  Prod --> Check{"Smoke on asvchat.fr"}
  Check -->|fail| Rollback{"Schema change since the target version?"}
  Rollback -->|no| RB["wrangler rollback, owner yes"] --> Fix
  Rollback -->|yes| Forward["No rollback: fix forward with an additive migration"] --> Fix
  Check -->|pass| FirstProd{First production deploy?}
  FirstProd -->|no| DPIA
  FirstProd -->|yes| Tunnel["Stop the tester tunnel; keep the local log file for its legal year (ADR-0018)"]
  Tunnel --> Derog["Record the visibility derogation in PROJECT_LOG.md (ADR-0005, history that cannot be published)"]
  Derog --> Private["gh repo edit --visibility private, owner yes; the GitHub ruleset no longer applies, the gate is agent-side only"]
  Private --> DPIA{"Owner recorded the signed impact assessment?"}
  DPIA -->|no| Done([Log the deploy in PROJECT_LOG.md; moderation stays off in production])
  DPIA -->|yes| ModOn["Turn moderation on in production, owner yes (BR-108)"] --> Done
```

## Notes

- Staging and production have separate Durable Object namespaces, so staging data never meets production
  data. Staging secrets are distinct values. The staging allow-list is the owner only; the production one is
  the owner and the testers (BR-113).
- Production runs from the signed release tag, never from a branch. A rollback is allowed only when no schema
  change landed since the target version; migrations are additive only.
- The derogation reason: ADR-0005 of the owner's global rules (repository visibility), category "a history
  that cannot be published": the code of a live moderated service and its impact assessment material; the
  repository holds no personal data.
- One-time setup sets `workers_dev: false` and `preview_urls: false` per environment, and creates
  two Access applications per environment (site, `/owner`) whose AUD tags the Worker checks in
  `Cf-Access-Jwt-Assertion` (`ASV_ACCESS_AUD_SITE`, `ASV_ACCESS_AUD_OWNER`, issuer from `ASV_ACCESS_TEAM_DOMAIN`; BR-113); the owner replaces the
  `TBD-by-owner` placeholders of `wrangler.jsonc` with those values. Turning moderation on in production sets
  `ASV_MODERATION` to `on` in the production environment of `wrangler.jsonc` and redeploys (BR-108). The owner CLI reaches `/owner/*` with `ASV_OWNER_URL` and the Service Auth token in `ASV_ACCESS_CLIENT_ID` and `ASV_ACCESS_CLIENT_SECRET` (BR-093).
