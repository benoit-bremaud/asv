# Deployment diagram — platform — environments

> **Feature**: platform
> **Requirements**: ASV-NF-003
> **Business rules**: BR-084, BR-085, BR-086
> **Related ADRs**: ADR-0001, ADR-0002, ADR-0007, ADR-0008, ADR-0010, ADR-0018

## Context

Where each part runs in local development and in production. Mermaid has no native deployment diagram,
so nodes are drawn as nested boxes. Does not cover CI pipelines.

## Diagram

```mermaid
flowchart TB
  subgraph Dev ["local — developer machine"]
    NodeProc["Node process: Hono + in-memory hub + no-AI triage"]
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
  subgraph Prod ["production — Cloudflare"]
    DNS["asvchat.fr DNS on Cloudflare"]
    Worker["Worker: Hono app + static assets"]
    HubDO["Hub Durable Object + SQLite"]
    Secrets["Secrets: BAN_HMAC_KEY, EMAIL_HMAC_KEY, GRANT_KEY, OWNER_SECRET, AI_API_KEY, MAIL_API_KEY"]
    DNS --> Worker
    Worker --> HubDO
    Secrets -.-> Worker
    Secrets -.-> HubDO
  end
  AI["AI provider for report triage"]
  Registrar["Registrar: Namecheap, OVH or Gandi"]
  Registrar -->|"name servers"| DNS
  HubDO -->|"reported context only"| AI
  Mail["Transactional e-mail provider"]
  HubDO -->|"sign-in codes, statements of reasons"| Mail
```

## Notes

- A staging environment (separate Worker and Durable Object namespace) is added before public launch,
  following the owner's environments convention.
- Tester exposure (ADR-0018): the tunnel runs only during test sessions. The Node process serves the built
  bundle on loopback with the tunnel flag, so it trusts `CF-Connecting-IP` (BR-085), and with
  `secureCookie` on, so it sets the `Secure` cookie and HSTS (BR-073, BR-086).
  Mail goes from the Node process to Brevo with `BREVO_API_KEY` from the shell environment.
- Exit door: the Node process can be containerised and run elsewhere (ADR-0002).
- Secret names are proposals for brick 9. Values live in Wrangler secrets, never in the repo.
