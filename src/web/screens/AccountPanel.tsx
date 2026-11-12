import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type SubmitEvent, type SyntheticEvent } from "react";
import { useChat } from "../chat-context";
import { isAccountNotice } from "../store";
import { STRINGS } from "../strings";
import { LegalPage } from "./LegalPage";
import { Notice } from "./Notice";

const CODE_LENGTH = 6;

/** E-mail form, shared by the overlay (`web-ui/06`, `askEmail`). */
const AskEmail = () => {
  const { state, commands } = useChat();
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);
  const [privacy, setPrivacy] = useState(false);
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
      <p className="small">
        {STRINGS.emailKept}{" "}
        <button type="button" className="link" onClick={(event) => {
          // Safari and Firefox on macOS do not focus a clicked button: focus it, so the page gives it back (#130).
          event.currentTarget.focus();
          setPrivacy(true);
        }}>{STRINGS.legal.privacy}</button>
      </p>
      {privacy && <LegalPage topic="privacy" onClose={() => setPrivacy(false)} />}
    </form>
  );
};

/** Six digits only; sent on the sixth digit or on "valider" (`web-ui/06`, `waitingCode`). */
const WaitingCode = () => {
  const { state, commands } = useChat();
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // The code step opens after a request or a restore (BR-087): the field takes the focus, so a phone can paste at once.
  useEffect(() => input.current?.focus(), []);
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
        <input inputMode="numeric" autoComplete="one-time-code" ref={input} value={code} onChange={(e) => change(e.target.value)} />
      </label>
      <p className="small">{STRINGS.codeHelp}</p>
      {triesLeft !== undefined && <p role="alert" className="error">{STRINGS.triesLeft(triesLeft)}</p>}
      <button type="submit" className="bevel primary" disabled={!canSend(code)}>{STRINGS.validate}</button>
      <button type="button" className="link" onClick={commands.newCode}>{STRINGS.newCode}</button>
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

/** Modal account dialog in the chat (`web-ui/06`, `web-ui/04` Accessibility, #63); closing keeps the step. */
const AccountDialog = () => {
  const { state, commands } = useChat();
  const dialog = useRef<HTMLDialogElement>(null);
  // Layout effect: its cleanup runs while the dialog is still in the page, so `close()` and the focus return happen.
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  const close = () => commands.local({ type: "closeAccount" });
  // The state closes the dialog, not the browser: `cancel` covers close requests (Android back), the key handler
  // covers Escape when the browser sends no close request.
  const cancel = (event: SyntheticEvent) => {
    event.preventDefault();
    close();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") cancel(event);
  };
  const { step } = state.account;
  return (
    <dialog ref={dialog} className="panel overlay" aria-labelledby="account-title" onCancel={cancel} onKeyDown={keyDown}>
      <h2 id="account-title">{STRINGS.accountTitle}</h2>
      {(step === "askEmail" || step === "signedOut") && <AskEmail />}
      {step === "waitingCode" && <WaitingCode />}
      {step === "redeemingDevice" && <p>{STRINGS.savingDevice}</p>}
      {step === "signedIn" && <SignedIn />}
      {step === "confirmDelete" && <ConfirmDelete />}
      {/* After the step, so `showModal()` focuses the step's first control, not the dismiss button. */}
      <Notice show={isAccountNotice} />
      <button type="button" className="link" onClick={close}>{STRINGS.close}</button>
    </dialog>
  );
};

export const AccountPanel = () => (useChat().state.account.open ? <AccountDialog /> : null);
