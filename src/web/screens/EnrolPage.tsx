import { useState } from "react";
import { enrolModerator } from "../moderator-passkey";
import { STRINGS } from "../strings";

type Step = { readonly kind: "ready" | "creating" | "refused" | "failed" | "cancelled" } | { readonly kind: "done"; readonly name: string };

/** UC15 (`web-ui/09` Enrolment): the page an invitation link opens; `token` is empty when malformed. */
export const EnrolPage = ({ token, onBack }: { token: string; onBack: () => void }) => {
  const [step, setStep] = useState<Step>(token === "" ? { kind: "refused" } : { kind: "ready" });
  const create = async () => {
    setStep({ kind: "creating" });
    const result = await enrolModerator(token);
    if (typeof result === "object") setStep({ kind: "done", name: result.name });
    else setStep({ kind: result === "gone" ? "refused" : result });
  };
  const message = {
    ready: undefined,
    creating: undefined,
    cancelled: STRINGS.enrolCancelled,
    failed: STRINGS.enrolFailed,
    refused: STRINGS.enrolRefused,
    done: step.kind === "done" ? STRINGS.enrolDone(step.name) : undefined,
  }[step.kind];
  const canCreate = step.kind === "ready" || step.kind === "cancelled" || step.kind === "failed";
  return (
    <main className="entry">
      <section className="panel" aria-labelledby="enrol-title">
        <h2 id="enrol-title">{STRINGS.enrolTitle}</h2>
        <p className="small">{STRINGS.enrolIntro}</p>
        {message && <p role={step.kind === "done" ? "status" : "alert"} className={step.kind === "done" ? undefined : "error"}>{message}</p>}
        {canCreate && <button type="button" className="bevel primary big" onClick={() => void create()}>{STRINGS.enrolCreate}</button>}
        {step.kind === "creating" && <button type="button" className="bevel primary big" disabled>{STRINGS.enrolCreate}</button>}
        <button type="button" className="link" onClick={onBack}>{STRINGS.enrolBack}</button>
      </section>
    </main>
  );
};
