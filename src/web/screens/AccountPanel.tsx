import { useState, type SubmitEvent } from "react";
import { useChat } from "../chat-context";
import { STRINGS } from "../strings";

const CODE_LENGTH = 6;

/** E-mail form, shared by the overlay (`web-ui/06`, `askEmail`). */
const AskEmail = () => {
  const { state, commands } = useChat();
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (email.trim() !== "") commands.requestCode({ email: email.trim(), remember });
  };
  return (
    <form onSubmit={submit}>
      <label>
        {STRINGS.email}
        <input type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="inline">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {STRINGS.remember}
      </label>
      <button type="submit" className="bevel primary" disabled={email.trim() === "" || state.account.pendingRequest}>{STRINGS.getCode}</button>
      <p className="small">{STRINGS.codeCreates}</p>
      <p className="small">{STRINGS.emailKept}</p>
    </form>
  );
};

/** Six digits only; sent on the sixth digit or on "valider" (`web-ui/06`, `waitingCode`). */
const WaitingCode = () => {
  const { state, commands } = useChat();
  const [code, setCode] = useState("");
  const { triesLeft, pendingVerify } = state.account;
  // One `verifyCode` at a time: a second one would burn a try (`web-ui/06`).
  const canSend = (digits: string) => digits.length === CODE_LENGTH && !pendingVerify;
  const change = (value: string) => {
    const digits = value.replaceAll(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (canSend(digits)) commands.verifyCode(digits);
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (canSend(code)) commands.verifyCode(code);
  };
  return (
    <form onSubmit={submit}>
      <label>
        {STRINGS.code}
        <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => change(e.target.value)} />
      </label>
      <p className="small">{STRINGS.codeHelp}</p>
      {triesLeft !== undefined && <p role="alert" className="error">{STRINGS.triesLeft(triesLeft)}</p>}
      <button type="submit" className="bevel primary" disabled={!canSend(code)}>{STRINGS.validate}</button>
      <button type="button" className="link" onClick={() => commands.local({ type: "accountStep", step: "askEmail" })}>{STRINGS.newCode}</button>
    </form>
  );
};

const SignedIn = () => {
  const { commands } = useChat();
  return (
    <>
      <p>{STRINGS.signedInAs}</p>
      <button type="button" className="bevel" onClick={commands.signOutDevice}>{STRINGS.signOutDevice}</button>
      <button type="button" className="bevel" onClick={commands.signOutEverywhere}>{STRINGS.signOutEverywhere}</button>
      <button type="button" className="bevel" onClick={() => commands.local({ type: "accountStep", step: "confirmDelete" })}>{STRINGS.deleteAccount}</button>
    </>
  );
};

const ConfirmDelete = () => {
  const { commands } = useChat();
  return (
    <>
      <p role="alert">{STRINGS.confirmDelete}</p>
      <p className="small">{STRINGS.emailKept}</p>
      <button type="button" className="bevel primary" onClick={commands.deleteAccount}>{STRINGS.confirm}</button>
      <button type="button" className="bevel" onClick={() => commands.local({ type: "accountStep", step: "signedIn" })}>{STRINGS.cancel}</button>
    </>
  );
};

/** Account overlay in the chat (`web-ui/06`); closing keeps the step. */
export const AccountPanel = () => {
  const { state, commands } = useChat();
  if (!state.account.open) return null;
  const { step } = state.account;
  return (
    <dialog open className="panel overlay" aria-labelledby="account-title">
      <h2 id="account-title">{STRINGS.accountTitle}</h2>
      {(step === "askEmail" || step === "signedOut") && <AskEmail />}
      {step === "waitingCode" && <WaitingCode />}
      {step === "redeemingDevice" && <p>{STRINGS.savingDevice}</p>}
      {step === "signedIn" && <SignedIn />}
      {step === "confirmDelete" && <ConfirmDelete />}
      <button type="button" className="link" onClick={() => commands.local({ type: "closeAccount" })}>{STRINGS.close}</button>
    </dialog>
  );
};
