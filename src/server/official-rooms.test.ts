import { describe, expect, it } from "vitest";
import { emptyHubState, foldPseudo } from "../domain";
import { OFFICIAL_ROOMS } from "./official-rooms";

describe("BR-033 official rooms configuration", () => {
  it("has unique ids and names, ignoring case and accents", () => {
    const ids = OFFICIAL_ROOMS.map((room) => room.id);
    const names = OFFICIAL_ROOMS.map((room) => foldPseudo(room.name));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("seeds a fresh hub in configuration order", () => {
    expect([...emptyHubState(OFFICIAL_ROOMS).rooms.keys()]).toEqual(OFFICIAL_ROOMS.map((room) => room.id));
  });
});
