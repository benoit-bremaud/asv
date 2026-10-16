# Data-flow diagram — directory — what a search reveals

> **Feature**: directory
> **Use cases**: UC7

## Context

Personal data returned by a search. Nothing is stored. Does not cover entry data collection (see `entry`).

## Diagram

```mermaid
flowchart LR
  Searcher(("Chatter searching"))
  subgraph asv ["asv hub"]
    Sess["Live sessions in memory"]
  end
  Searcher -->|"query: pseudo part or city"| Sess
  Sess -->|"PII: pseudo, colour, age, city, rooms, away flag"| Searcher
```

## Notes

- Queries are not logged.
- Results exclude chatters the searcher ignores.
