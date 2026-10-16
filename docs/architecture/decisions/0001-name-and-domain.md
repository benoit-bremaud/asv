# ADR-0001 — Product name "asv" and domain asvchat.fr

- Status: accepted
- Date: 2026-10-15
- Deciders: Benoît Bremaud

## Context

The product rebuilds a Caramail-style chat. It needs a short, retro, French name and a dedicated domain.

## Options and MCDA — name

Scores 0–5. Criteria: evocation of Caramail 30, memorable 25, domain availability 20,
meaning for newcomers 15, fun 10.

| Name | Evocation | Memorable | Domain | Meaning | Fun | Total /500 |
|---|---|---|---|---|---|---|
| rosebleu | 4 | 4 | 4 | 3 | 3 | 375 |
| pseudo | 4 | 5 | 1 | 5 | 3 | 370 |
| asv | 5 | 4 | 1 | 2 | 4 | 340 |
| causette | 2 | 4 | 4 | 4 | 4 | 340 |
| papote | 2 | 4 | 4 | 4 | 4 | 340 |

- asv: "âge / sexe / ville", the Caramail ritual opener. Short `.fr` and `.chat` taken.
- rosebleu: names the visual identity, domains free, a bit descriptive.
- pseudo: very clear, domains taken.

Sensitivity (evocation 50, memorable 25, domain 0, meaning 15, fun 10): pseudo 430, asv 420. asv never
tops the matrix: the choice is an explicit owner override (below).

**Owner override.** The owner chose asv although rosebleu tops the domain-weighted matrix.
Reason: evocation for people who knew Caramail matters more than a perfect domain, and a free
domain variant of asv exists (see below).

## Options and MCDA — domain

Criteria: fun/retro 30, readability and trust 25, price 20, French TLD 15, memorable 10.

| Domain | Fun | Readability | Price | .fr | Memorable | Renewal / year | Total /500 |
|---|---|---|---|---|---|---|---|
| asv-chat.fr | 3 | 5 | 5 | 5 | 3 | ~8 € | 420 |
| asvchat.fr | 3 | 4 | 5 | 5 | 3 | ~8 € | 395 |
| asv.lol | 5 | 3 | 2 | 2 | 5 | 28.89 € HT | 345 |
| asv.club | 3 | 4 | 4 | 2 | 4 | 16.49 € HT | 340 |

Availability checked through RDAP (rdap.org) on 2026-10-15. Prices: OVHcloud France public pages
and the Afnic 2026 wholesale tariff (5.07 € HT / year).

**Owner override.** asvchat.fr instead of asv-chat.fr: no hyphen, easier to say out loud. Same price.

## Decision

- Name: **asv**.
- Domain: **asvchat.fr**.

## Consequences

- `.fr` is not listed in Cloudflare Registrar's supported TLDs (checked 2026-10-15 on
  <https://www.cloudflare.com/tld-policies/>). Buy at Namecheap, OVH or Gandi. DNS can be on Cloudflare.
- The domain is not bought yet (owner action).

## Sources

- [Afnic 2026 tariffs](https://www.afnic.fr/wp-media/uploads/2025/12/Afnic-Annexe-1-tarifs-enregistrement-2026.pdf)
- [OVHcloud .lol](https://www.ovhcloud.com/fr/domains/tld/lol/), [.club](https://www.ovhcloud.com/fr/domains/tld/club/)
- [Cloudflare Registrar TLD policies](https://www.cloudflare.com/tld-policies/)
