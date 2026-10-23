import type { OfficialRoom } from "../domain";

/** BR-033: official rooms, never deleted. Ids are stable slugs (`rooms/07`). */
export const OFFICIAL_ROOMS: readonly OfficialRoom[] = [
  { id: "blabla", name: "Blabla", kind: "themed" },
  { id: "poesie", name: "Poésie", kind: "themed" },
  { id: "cine", name: "Ciné", kind: "themed" },
  { id: "musique", name: "Musique", kind: "themed" },
  { id: "paris", name: "Paris", kind: "regional" },
  { id: "lyon", name: "Lyon", kind: "regional" },
];
