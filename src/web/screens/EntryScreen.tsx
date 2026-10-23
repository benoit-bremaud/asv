import { useEffect, useState, type SubmitEvent } from "react";
import { gender as genderSchema, type Gender } from "../../shared/protocol";
import { useChat } from "../chat-context";
import { STRINGS } from "../strings";
import { Header } from "./Header";

const GENDERS = genderSchema.options;
/** BR-006, in code points: `maxLength` would count UTF-16 units and stop at 20 emoji. */
const MAX_CITY = 40;
/** Refresh interval (ms) of the connected count on the entry screen (D8). */
export const STATS_MS = 30_000;

/** Connected count from `GET /api/stats`, hidden when the request fails (D8). */
const useConnectedCount = (): number | undefined => {
  const [count, setCount] = useState<number>();
  useEffect(() => {
    // Unmount aborts the request in flight, so no late answer reaches an unmounted screen.
    const controller = new AbortController();
    const { signal } = controller;
    const load = async () => {
      try {
        const response = await fetch("/api/stats", { signal });
        const body: unknown = response.ok ? await response.json() : undefined;
        const connected = typeof body === "object" && body !== null && "connected" in body ? body.connected : undefined;
        if (!signal.aborted) setCount(typeof connected === "number" ? connected : undefined);
      } catch {
        if (!signal.aborted) setCount(undefined);
      }
    };
    void load();
    const timer = setInterval(() => void load(), STATS_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return count;
};

/** UC1 entry screen from the validated mockup (design pack, `web-ui/04`). */
export const EntryScreen = () => {
  const { state, commands } = useChat();
  const connected = useConnectedCount();
  const [pseudo, setPseudo] = useState(state.lastPseudo ?? "");
  const [gender, setGender] = useState<Gender>("unspecified");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const ready = adult && terms && pseudo.trim() !== "" && age !== "" && state.link === "online" && state.pendingPseudo === undefined;

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!ready) return;
    commands.enter({
      pseudo: pseudo.trim(),
      gender,
      age: Number(age),
      ...(city.trim() ? { city: city.trim() } : {}),
      adultConfirmed: adult,
      termsAccepted: terms,
    });
  };

  return (
    <>
      <Header connected={connected} />
      <main className="entry">
        <form className="panel" onSubmit={submit} aria-labelledby="guest-title">
          <h2 id="guest-title">{STRINGS.guestTitle}</h2>
          <label>
            {STRINGS.pseudo}
            <input value={pseudo} maxLength={20} autoComplete="off" onChange={(e) => setPseudo(e.target.value)} />
          </label>
          <fieldset>
            <legend>{STRINGS.iAm}</legend>
            {GENDERS.map((value) => (
              <label key={value} className="inline">
                <input type="radio" name="gender" checked={gender === value} onChange={() => setGender(value)} />
                {STRINGS.genders[value]}
              </label>
            ))}
          </fieldset>
          <div className="row">
            <label>
              {STRINGS.age}
              <input type="number" min={18} max={99} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </label>
            <label>
              {STRINGS.city}
              <input value={city} onChange={(e) => setCity([...e.target.value].slice(0, MAX_CITY).join(""))} />
            </label>
          </div>
          <label className="inline">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            {STRINGS.adult}
          </label>
          <label className="inline">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            {STRINGS.terms}
          </label>
          {state.entryError && (
            <p role="alert" className="error">
              {STRINGS.entryRefused[state.entryError as keyof typeof STRINGS.entryRefused]}
            </p>
          )}
          <button type="submit" className="bevel primary big" disabled={!ready}>{STRINGS.enter}</button>
        </form>
        <section className="panel" aria-labelledby="members-title">
          <h2 id="members-title">{STRINGS.membersTitle}</h2>
          <p className="soon">{STRINGS.soon}</p>
          <label>
            {STRINGS.email}
            <input type="email" disabled />
          </label>
          <button type="button" className="bevel" disabled>{STRINGS.getCode}</button>
          <label>
            {STRINGS.code}
            <input inputMode="numeric" disabled />
          </label>
          <button type="button" className="bevel" disabled>{STRINGS.validate}</button>
          <p className="small">{STRINGS.codeCreates}</p>
          <p className="small">{STRINGS.emailKept}</p>
        </section>
      </main>
      <footer className="footer">
        {STRINGS.footer.map((label) => <span key={label}>{label}</span>)}
      </footer>
    </>
  );
};
