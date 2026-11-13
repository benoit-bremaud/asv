import { useEffect, useState, type MouseEvent, type SubmitEvent } from "react";
import { gender as genderSchema, type entryRefusal, type Gender } from "../../shared/protocol";
import { hasForbiddenChar } from "../../domain/text";
import { useChat } from "../chat-context";
import { MODERATOR_LIMITS } from "../../domain/moderators";
import { moderationAccess, signInModerator, type ModerationAccess } from "../moderator-passkey";
import { STRINGS } from "../strings";
import { Header } from "./Header";
import { LegalPage, type LegalTopic } from "./LegalPage";

const GENDERS = genderSchema.options;
const LEGAL_TOPICS: readonly LegalTopic[] = ["rules", "notice", "privacy"];
/** BR-006, in code points: `maxLength` would count UTF-16 units and stop at 20 emoji. */
const MAX_CITY = 40;
const ENTRY_ERROR_ID = "entry-error";
const MISSING_ID = "entry-missing";
/** Refusals that mean the pseudo itself must change (#154). */
const PSEUDO_REFUSALS: ReadonlySet<string | undefined> = new Set<(typeof entryRefusal.options)[number]>(["pseudoTaken", "pseudoInvalid"]);
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

/** `web-ui/09`: the moderator sign-in link, shown only where `/mod` answers (BR-097); the grant expires in 60 s (BR-095). */
const useModeratorSignIn = (entryError: string | undefined) => {
  const [access, setAccess] = useState<ModerationAccess>("off");
  const [asking, setAsking] = useState(false);
  const [grant, setGrant] = useState<{ readonly grant: string; readonly name: string }>();
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    let live = true;
    void moderationAccess().then((value) => live && setAccess(value));
    return () => { live = false; };
  }, []);
  // `web-ui/09` Granted → Plain: a refused grant is never sent again (each retry would count for BR-096).
  // Adjusted during render when the refusal arrives, as React advises instead of an effect.
  const [seenError, setSeenError] = useState(entryError);
  if (entryError !== seenError) {
    setSeenError(entryError);
    if (entryError === "notModerator") setGrant(undefined);
  }
  useEffect(() => {
    if (!grant) return;
    const timer = setTimeout(() => { setGrant(undefined); setNotice(STRINGS.moderatorExpired); }, MODERATOR_LIMITS.grantTtlMs);
    return () => clearTimeout(timer);
  }, [grant]);
  const signIn = async () => {
    setAsking(true);
    setNotice(undefined);
    const result = await signInModerator();
    setAsking(false);
    if (typeof result === "object") { setGrant(result); setNotice(STRINGS.moderatorAccepted(result.name)); }
    else setNotice(STRINGS.moderatorRefused);
  };
  const cancel = () => { setGrant(undefined); setNotice(undefined); };
  return { access, asking, grant, notice, signIn, cancel };
};

/** UC1 entry screen from the validated mockup (design pack, `web-ui/04`). */
export const EntryScreen = () => {
  const { state, commands } = useChat();
  const connected = useConnectedCount();
  const [pseudo, setPseudo] = useState(state.lastPseudo ?? "");
  const [gender, setGender] = useState<Gender>("unspecified");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [legal, setLegal] = useState<LegalTopic>();
  const openLegal = (event: MouseEvent<HTMLButtonElement>, topic: LegalTopic) => {
    // Safari and Firefox on macOS do not focus a clicked button: focus it, so the page gives it back (#130).
    event.currentTarget.focus();
    setLegal(topic);
  };
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);
  const [hint, setHint] = useState(false);
  // `web-ui/09`: the passkey grant lives in this state only, never saved (BR-095).
  const moderator = useModeratorSignIn(state.entryError);
  // BR-090, checked on the trimmed city as the server does.
  const cityInvisible = hasForbiddenChar(city.trim());
  const pseudoRefused = PSEUDO_REFUSALS.has(state.entryError) && pseudo.trim().normalize("NFC") === state.refusedPseudo;
  // #60: the fields still to fill, in form order, named under ENTRER and in the "Membres" hint.
  const missing = Object.entries({ pseudo: pseudo.trim() === "", age: age === "", adult: !adult, terms: !terms })
    .filter(([, absent]) => absent)
    .map(([field]) => STRINGS.missingFields[field as keyof typeof STRINGS.missingFields]);
  const ready = !cityInvisible && missing.length === 0 && state.link === "online" && state.pendingPseudo === undefined;
  // The "Membres" hint says why the click did nothing: missing fields first, then the city or the link (#60).
  const membersHint = (): string | undefined => {
    if (missing.length > 0) return STRINGS.missing(missing);
    if (cityInvisible) return STRINGS.invisibleChars;
    return state.link === "online" ? undefined : STRINGS.notices.notConnected;
  };

  const form = () => ({
      pseudo: pseudo.trim(),
      gender,
      age: Number(age),
      ...(city.trim() ? { city: city.trim() } : {}),
      adultConfirmed: adult,
      termsAccepted: terms,
      ...(moderator.grant ? { moderatorGrant: moderator.grant.grant } : {}),
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (ready) commands.enter(form());
  };
  // The "Membres" panel reuses the pseudo form: enter, then ask for the code (`web-ui/06`).
  const submitMember = (event: SubmitEvent) => {
    event.preventDefault();
    setHint(!ready);
    if (ready && email.trim() !== "") commands.enter(form(), { email: email.trim(), remember });
  };

  return (
    <>
      <Header connected={connected} />
      <main className="entry">
        <form className="panel" onSubmit={submit} aria-labelledby="guest-title">
          <h2 id="guest-title">{STRINGS.guestTitle}</h2>
          <label>
            {STRINGS.pseudo}
            <input name="pseudo" value={pseudo} aria-invalid={pseudoRefused || undefined} aria-describedby={pseudoRefused ? ENTRY_ERROR_ID : undefined} maxLength={20} autoComplete="off" onChange={(e) => setPseudo(e.target.value)} />
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
              <input name="age" type="number" autoComplete="off" min={18} max={99} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </label>
            <label>
              {STRINGS.city}
              <input name="city" autoComplete="off" value={city} aria-invalid={cityInvisible || undefined} onChange={(e) => setCity([...e.target.value].slice(0, MAX_CITY).join(""))} />
              {cityInvisible && <output className="small too-long">{STRINGS.invisibleChars}</output>}
            </label>
          </div>
          <label className="inline">
            <input name="adult" type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            {STRINGS.adult}
          </label>
          <label className="inline">
            <input name="terms" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            {STRINGS.terms}
          </label>
          {state.entryError && (
            <p id={ENTRY_ERROR_ID} role="alert" className="error">
              {STRINGS.entryRefused[state.entryError as keyof typeof STRINGS.entryRefused]}
              {state.bannedUntil && STRINGS.until(state.bannedUntil)}
            </p>
          )}
          {moderator.notice && (moderator.grant
            ? <output className="small">{moderator.notice}</output>
            : <p role="alert" className="error">{moderator.notice}</p>)}
          <button type="submit" className="bevel primary big" disabled={!ready} aria-describedby={missing.length > 0 ? MISSING_ID : undefined}>{STRINGS.enter}</button>
          {missing.length > 0 && <p id={MISSING_ID} className="small">{STRINGS.missing(missing)}</p>}
        </form>
        <form className="panel" onSubmit={submitMember} aria-labelledby="members-title">
          <h2 id="members-title">{STRINGS.membersTitle}</h2>
          <label>
            {STRINGS.email}
            <input name="email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="inline">
            <input name="remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {STRINGS.remember}
          </label>
          {hint && !ready && membersHint() && <p role="alert" className="error">{membersHint()}</p>}
          <button type="submit" className="bevel" disabled={email.trim() === "" || state.pendingPseudo !== undefined}>{STRINGS.getCode}</button>
          <p className="small">{STRINGS.codeCreates}</p>
          <p className="small">{STRINGS.emailKept}</p>
          <p className="small">{STRINGS.emailRetention}</p>
        </form>
      </main>
      <footer className="footer">
        {moderator.access === "noPasskey" && <button type="button" className="link" disabled>{STRINGS.moderatorSignIn} ({STRINGS.noPasskey})</button>}
        {moderator.access === "on" && (moderator.grant
          ? <button type="button" className="link" onClick={moderator.cancel}>{STRINGS.moderatorCancel}</button>
          : <button type="button" className="link" disabled={moderator.asking} onClick={() => void moderator.signIn()}>{STRINGS.moderatorSignIn}</button>)}
        {LEGAL_TOPICS.map((topic) => (
          <button key={topic} type="button" className="link" onClick={(event) => openLegal(event, topic)}>{STRINGS.legal[topic]}</button>
        ))}
      </footer>
      {legal && <LegalPage topic={legal} onClose={() => setLegal(undefined)} />}
    </>
  );
};
