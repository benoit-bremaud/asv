# State diagram — accounts — account lifecycle

> **Feature**: accounts
> **Use cases**: UC17, UC19, UC12, UC11
> **Business rules**: BR-074 to BR-080
> **Related ADRs**: ADR-0012

## Context

Lifecycle of an account from the first verified code to deletion, including the three-strike path.
Does not cover device records, which expire on their own.

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Active: first verified code
  state Active {
    [*] --> Clean
    Clean --> Warned: moderator warns, strike added
    Warned --> Warned: second or third strike
    Warned --> Clean: all strikes expired after 90 days
  }
  Active --> Deleted: confirmSuspension with 3+ active strikes, statement sent, e-mail blocked 7 days
  Active --> Deleted: severe case, e-mail blocked longer
  Active --> Deleted: account holder deletes the account
  Active --> Deleted: inactive 2 years, after e-mail notice
  Deleted --> [*]
```

## Notes

- The suspension proposal is not a stored state: the moderator panel offers it whenever an account has
  three or more active strikes and no decision yet (BR-075).
- Every deletion by a moderator sends a statement of reasons by e-mail first (DSA art. 17, BR-076).
- Self-deletion with active strikes keeps a strike carry-over record (BR-080).
- Deleting the account removes the e-mail. Only keyed hashes remain until they expire.
