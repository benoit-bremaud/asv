# Tester exposure runbook (ADR-0018, issue #54)

How the owner opens asv to the two testers through a Cloudflare Tunnel, then closes it.

## Environment (shell only, never committed)

| Variable | Value |
|---|---|
| `ASV_LOG_FILE` | `~/.local/state/asv/connection-log.jsonl` (BR-084) |
| `ASV_VAULT_FILE` | `~/.local/state/asv/vault.jsonl` (BR-084) |
| `ASV_ALLOWED_ORIGINS` | `https://<tunnel host>` (BR-085); required, `https://` only, in tunnel mode |
| `ASV_DATA_KEYS`, `ASV_HMAC_KEY`, `ASV_VAULT_PUBLIC_KEY` | ADR-0017 secrets, required in tunnel mode (the server refuses to start without them) |
| `BREVO_API_KEY`, `ASV_MAIL_FROM` | Brevo key and sender (ADR-0013) |
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

## Session

1. Export the variables, run `pnpm tester`.
2. In another shell: `cloudflared tunnel --url http://127.0.0.1:8787` and note the `https://…trycloudflare.com`
   host. If the host changes, update `ASV_ALLOWED_ORIGINS` and restart.
3. Send the URL and the feedback form (issue #54) to the testers yourself.
4. At the end: stop `cloudflared`, then the server. Keep the two JSONL files for their legal periods; never
   copy them into the repository.

## Before the first session

- Check in the Brevo and Cloudflare DPAs where Brevo processes data and which transfer framework Cloudflare uses.
- Tell the testers that rooms, messages and accounts reset at every restart.
