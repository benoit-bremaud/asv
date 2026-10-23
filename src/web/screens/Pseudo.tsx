import type { Member } from "../../shared/protocol";
import { STRINGS } from "../strings";

type Gender = Extract<Member, { away: false }>["gender"];

/** A pseudo in its colour (ADR-0006); away: `-away` colour, italics and "(absent)", never colour alone. */
export const Pseudo = ({ pseudo, gender, away = false }: { pseudo: string; gender?: Gender; away?: boolean }) => (
  <span className={`pseudo pseudo-${gender ?? "unspecified"}${away ? " pseudo-away" : ""}`}>
    {pseudo}
    {away && <span className="away-mark"> {STRINGS.away}</span>}
  </span>
);
