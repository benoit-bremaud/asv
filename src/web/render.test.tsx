import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderText } from "./render";

const html = (text: string) => {
  const { container } = render(<p>{renderText(text)}</p>);
  return container;
};

describe("renderText", () => {
  it.each([
    [":)", "🙂"],
    [":(", "🙁"],
    [";)", "😉"],
    [":D", "😄"],
    [":P", "😛"],
    [":o", "😮"],
    ["<3", "❤️"],
    [":caramel:", "🍬"],
  ])("renders %s as an accessible symbol", (code, symbol) => {
    const container = html(`a ${code} b`);

    const span = container.querySelector("span[role='img']");
    expect(span?.getAttribute("aria-label")).toBe(code);
    expect(span?.textContent).toBe(symbol);
    expect(container.textContent).toBe(`a ${symbol} b`);
  });

  it("keeps plain text as a single text node without smileys", () => {
    const container = html("hello");

    expect(container.querySelectorAll("span[role='img']")).toHaveLength(0);
    expect(container.textContent).toBe("hello");
  });

  it("renders several smileys in order", () => {
    const container = html(":):(");

    const labels = [...container.querySelectorAll("span[role='img']")].map((s) => s.getAttribute("aria-label"));
    expect(labels).toEqual([":)", ":("]);
  });

  it("lets the longest code win over a shorter one", () => {
    const container = html(":caramel:");

    expect(container.querySelectorAll("span[role='img']")).toHaveLength(1);
    expect(container.querySelector("span[role='img']")?.getAttribute("aria-label")).toBe(":caramel:");
  });

  it("keeps HTML literal as text", () => {
    const container = html("<b>x</b>");

    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toBe("<b>x</b>");
  });

  it("drops empty parts and returns no node for an empty text", () => {
    expect(renderText("")).toEqual([]);
    expect(renderText(":)")).toHaveLength(1);
  });
});
