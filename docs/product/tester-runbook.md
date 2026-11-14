# Tester exposure runbook (ADR-0018, issue #54)

How the owner opens asv to the two testers through a Cloudflare Tunnel, then closes it.

## Environment (in `~/.config/asv/tester.env`, never committed)

| Variable | Value |
|---|---|
| `ASV_LOG_FILE` | `~/.local/state/asv/connection-log.jsonl` (BR-084) |
| `ASV_VAULT_FILE` | `~/.local/state/asv/vault.jsonl` (BR-084) |
| `ASV_ALLOWED_ORIGINS` | `https://asvchat.fr` (BR-085); required, `https://` only, in tunnel mode |
| `ASV_DATA_KEYS`, `ASV_HMAC_KEY`, `ASV_VAULT_PUBLIC_KEY` | ADR-0017 secrets, required in tunnel mode (the server refuses to start without them) |
| `BREVO_API_KEY`, `ASV_MAIL_FROM` | Brevo key and sender (ADR-0013) |
| `ASV_MODERATOR_FILE`, `ASV_OWNER_SECRET`, `ASV_PUBLIC_ORIGIN` | unused in tunnel mode: every `/mod/*` and `/owner/*` route answers 404 there until the owner opens moderation once the impact assessment is signed (BR-097, BR-108); they serve `pnpm mod:invite` and `pnpm mod:revoke` on a local run (BR-093, BR-098, BR-099) |
| `ASV_MISTRAL_API_KEY`, `ASV_TRIAGE_MODEL` | unset in tunnel mode: no AI triage, urgency `unknown` (ADR-0019) |
| `ASV_OWNER_NAME`, `ASV_OWNER_ADDRESS`, `ASV_OWNER_PHONE`, `ASV_CONTACT_EMAIL`, `ASV_BREVO_LOCATION` | legal pages (`legal-pages-draft.md`) |

`pnpm tester` builds the bundle and starts the Node transport on 127.0.0.1 with `ASV_TUNNEL=1` (client IP from
`CF-Connecting-IP`, `Secure` cookie, HSTS) and `ASV_STATIC_ROOT=dist`.

## Keys, once (until the #35 tool exists)

Keep the private key off the machine's synced folders and back it up offline: without it the vault cannot be read.

```bash
openssl ecparam -name prime256v1 -genkey -noout -out ~/.config/asv/vault-owner.pem
```

```bash
openssl ec -in ~/.config/asv/vault-owner.pem -pubout -conv_form uncompressed -outform DER | tail -c 65 | base64
```

The second command prints `ASV_VAULT_PUBLIC_KEY`. `ASV_DATA_KEYS` is `1:` followed by `openssl rand -base64 32`;
`ASV_HMAC_KEY` is another `openssl rand -base64 32`.

## Named tunnel and mail, once (done 2026-10-24)

- Domain `asvchat.fr` on Cloudflare. `cloudflared tunnel login`, then `cloudflared tunnel create asv-tester`
  and `cloudflared tunnel route dns asv-tester asvchat.fr`. Credentials and `cert.pem` stay in `~/.cloudflared/`
  (mode 0600), never in the repository.
- `~/.cloudflared/asv-tester.yml` (0600), with absolute paths:

  ```yaml
  tunnel: <tunnel id>
  credentials-file: /home/<user>/.cloudflared/<tunnel id>.json
  ingress:
    - hostname: asvchat.fr
      service: http://127.0.0.1:8787
    - service: http_status:404
  ```
- Brevo: domain `asvchat.fr` authenticated (Brevo code TXT, two DKIM CNAMEs, DMARC TXT, all DNS only); sender
  `contact@asvchat.fr`. Cloudflare Email Routing forwards `contact@asvchat.fr` to the owner's mailbox.
- All variables live in `~/.config/asv/tester.env` (0600), outside the repository.

## Session

1. `set -a; . ~/.config/asv/tester.env; set +a; pnpm tester`
2. In another shell: `cloudflared tunnel --config ~/.cloudflared/asv-tester.yml run asv-tester`
3. Check https://asvchat.fr: entry screen, legal pages, a guest entry, a member code.
4. Send the URL and the feedback form (issue #54) to the testers yourself.
5. At the end: stop `cloudflared`, then the server. Keep the two JSONL files for their legal periods; never
   copy them into the repository.

A short tunnel drop shows « Hors ligne » until the page is reloaded.

## Before the first session

- Check in the Brevo and Cloudflare DPAs where Brevo processes data and which transfer framework Cloudflare uses.
- Tell the testers that rooms, messages and accounts reset at every restart.
