# ADR-0017 — Application-level encryption at rest, vault sealed to an owner key

- Status: accepted, settles the ADR-0014 encryption criterion; closes issue #8
- Date: 2026-10-23
- Deciders: Benoît Bremaud

## Context

The owner requires every personal or sensitive value to be unreadable from a copy of the hub database
(issue #8, option A of the 2026-10-22 MCDA: application-level encryption, 385/500). ADR-0014 adds a
criterion for the legal vault: the application must not be able to read back what it wrote. Keys must
stay available to the owner for the whole legal retention (1 year for logs, 5 years for the vault),
otherwise a requisition cannot be answered (LCEN art. 6 V-A).

WebCrypto (`crypto.subtle`) offers AES-GCM, HMAC and ECDH P-256 on both Node and Cloudflare Workers, so
one implementation serves both transports (ADR-0002).

## Options and MCDA — scheme

Scores 0–5. Criteria: protection against a database copy 35, legal availability of the keys 25,
simplicity 20, portability Node/Workers 20.

| Option | Protection | Legal | Simplicity | Portability | Total /500 |
|---|---|---|---|---|---|
| **B. AES-GCM data key for live data, vault sealed to the owner public key (ECDH P-256 + AES-GCM)** | 5 | 4 | 3 | 5 | **435** |
| A. One versioned AES-GCM key for everything, vault included | 3 | 5 | 5 | 5 | 430 |
| C. Cloudflare at-rest encryption only | 1 | 5 | 5 | 3 | 320 |

Sensitivity: with simplicity 30 and protection 25, A leads 440 to 425. B is the only option that meets
the ADR-0014 criterion. The owner chose B on 2026-10-23.

## Options and MCDA — what brick 5 persists

Criteria: testable value 30, no throwaway work 25, risk for brick 9 25, effort 20.

| Option | Value | No throwaway | Risk | Effort | Total /500 |
|---|---|---|---|---|---|
| **A. In-memory stores (Node) behind an encrypting layer tested now; SQLite with Durable Objects in brick 9** | 4 | 4 | 3 | 4 | **375** |
| B. Encrypted Node SQLite store (`node:sqlite`) now | 5 | 3 | 4 | 2 | 365 |
| C. In-memory, encryption postponed to brick 9 | 3 | 5 | 2 | 5 | 365 |

## Decision

- **Field cipher.** Every personal or sensitive value is encrypted with AES-256-GCM before it reaches a
  store: random 96-bit IV per value, the record id and field name as additional data, stored as
  `v<keyVersion>.<iv>.<ciphertext>` (base64url). Encrypted in brick 5: account e-mail, pending code
  e-mail, pending statement (e-mail and text). Later bricks apply the same cipher to their own fields
  (connection log IP, port and pseudo; reports; bans; away records; moderator data).
- **Lookups** use HMAC-SHA-256 keyed hashes stored beside the ciphertext (`emailKeyedHash`), never the
  plain value. E-mails are normalised (trimmed, lower-cased) before hashing.
- **Clear columns**: random ids, dates used for expiry and purge, counters. They reveal nothing personal.
- **Vault sealed to the owner.** The vault e-mail is encrypted to the owner's ECDH P-256 public key:
  an ephemeral key pair per record, ECDH, HKDF-SHA-256 to an AES-256-GCM key, ciphertext with the
  ephemeral public key. Only the owner's private key, kept offline, opens it. The application holds the
  public key only, so it cannot read back what it wrote. Access entries (BR-082) are sealed the same way.
- **Keys.** `ASV_DATA_KEYS` (versioned AES keys, the newest encrypts, all decrypt), `ASV_HMAC_KEY` and
  `ASV_VAULT_PUBLIC_KEY` live in environment secrets (Wrangler secrets in production), never in the
  repository or the database. Rotation adds a new data key version; values are re-encrypted lazily on
  write and by a one-off job before an old version is removed. The HMAC key is not rotated in V1, since
  rotating it breaks every lookup (blocks, carry-overs): a rotation would need a dual-hash window,
  studied if ever needed.
- **Backup.** The owner keeps an offline copy of the data keys, the HMAC key and the vault private key
  for at least 5 years. Losing the vault private key makes the vault unreadable: a breach of LCEN
  art. 6 V-A, so the backup is part of the brick 10 launch checklist.
- **Scope in brick 5** (option A above): account, device and vault stores stay in memory on the Node
  transport, behind the same ports, with the encrypting layer in front. Brick 9 adds the Durable Object
  SQLite stores and reuses the layer unchanged.

## Consequences

- `src/server/crypto/` holds the field cipher, the keyed hash and the vault sealer, all on WebCrypto.
  The domain never sees ciphertext or keys.
- Exception (ADR-0018): during the tester exposure the connection log file is plaintext until brick 9.
- Development runs with generated throwaway keys when the variables are absent, with a warning.
  Production refuses to start without them.
- Cloudflare's own at-rest encryption is still to be checked in the docs in brick 9 for the clear
  columns.
- Tests cover round-trip, wrong additional data, key rotation (old version decrypts, new version
  encrypts) and lookup by keyed hash (`test-strategy.md`).
