# Deployment diagram — platform — environments

> **Feature**: platform
> **Requirements**: ASV-NF-003
> **Business rules**: BR-084, BR-085, BR-086, BR-109 to BR-113
> **Related ADRs**: ADR-0001, ADR-0002, ADR-0007, ADR-0008, ADR-0010, ADR-0018, ADR-0020

## Context

Where each part runs in local development and in production. Mermaid has no native deployment diagram,
so nodes are drawn as nested boxes. Does not cover CI pipelines.

## Diagram

```mermaid
flowchart TB
  subgraph Dev ["local — developer machine"]
    NodeProc["Node process: Hono + in-memory hub + triage adapter (ADR-0019)"]
    Vite["Vite dev server: web client"]
    Vite -->|"proxy /ws, /mod"| NodeProc
    LogFile[("connection-log.jsonl and vault.jsonl, outside the repo (BR-084)")]
    NodeProc -->|"append, purge per BR-060 and BR-081"| LogFile
  end
  subgraph Test ["tester exposure — temporary (ADR-0018)"]
    Tester["Tester browser"]
    Edge["Cloudflare edge: HTTPS, adds CF-Connecting-IP"]
    Cloudflared["cloudflared on the developer machine"]
    Tester --> Edge
    Edge --> Cloudflared
  end
  Cloudflared -->|"http://127.0.0.1"| NodeProc
  subgraph Prod ["production and staging — Cloudflare (ADR-0020), one of each"]
    DNS["asvchat.fr and staging.asvchat.fr DNS on Cloudflare"]
    Access["Cloudflare Access: staging owner only, production owner and testers, /owner with Service Auth (BR-113)"]
    Worker["Worker: static assets (run_worker_first), Origin, CF-Connecting-IP and Access JWT checks"]
    HubDO["Hub Durable Object (EU jurisdiction): Hono app + hub in memory, no hibernation (BR-109) + SQLite stores"]
    Secrets["Wrangler secrets per env: ASV_DATA_KEYS, ASV_HMAC_KEY, ASV_VAULT_PUBLIC_KEY, ASV_OWNER_SECRET, BREVO_API_KEY, ASV_MISTRAL_API_KEY, legal identity fields"]
    DNS --> Access
    Access --> Worker
    Worker --> HubDO
    Secrets -.-> HubDO
  end
  AI["Mistral API, EU (ADR-0019)"]
  Registrar["Registrar: Namecheap, OVH or Gandi"]
  Registrar -->|"name servers"| DNS
  HubDO -->|"reported context only"| AI
  NodeProc -->|"labelled lines (BR-100), key set, not tunnel"| AI
  Mail["Transactional e-mail provider"]
  HubDO -->|"sign-in codes, statements of reasons"| Mail
```

## Notes

- Staging (staging.asvchat.fr) and production (asvchat.fr) are Wrangler environments, each with its own
  Worker, Durable Object namespace and secrets, both behind Access until brick 10 (ADR-0020). Deploy procedure:
  `platform/10`. The grant key is drawn at start, never a secret (BR-095).
- Tester exposure (ADR-0018): the tunnel runs only during test sessions. The Node process serves the built
  bundle on loopback with the tunnel flag, so it trusts `CF-Connecting-IP` (BR-085), and with
  `secureCookie` on, so it sets the `Secure` cookie and HSTS (BR-073, BR-086).
  Mail goes from the Node process to Brevo with `BREVO_API_KEY` from the shell environment.
- Exit door: the Node process can be containerised and run elsewhere (ADR-0002).
- The triage key `ASV_MISTRAL_API_KEY` and model `ASV_TRIAGE_MODEL` (ADR-0019) are unset in tunnel mode,
  so the no-AI adapter runs there.
- Secret values live in Wrangler secrets, never in the repo (BR-111); the legal identity fields (`ASV_OWNER_NAME`,
  `ASV_OWNER_ADDRESS`, `ASV_OWNER_PHONE`, `ASV_CONTACT_EMAIL`, `ASV_BREVO_LOCATION`) are secrets too. Non-secret
  variables in `wrangler.jsonc`: `ASV_ALLOWED_ORIGINS`, `ASV_PUBLIC_ORIGIN`, `ASV_MAIL_FROM`, `ASV_TRIAGE_MODEL`.
  Each environment sets `workers_dev: false` and `preview_urls: false`.
