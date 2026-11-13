/**
 * No-AI adapter of the `ReportTriage` port (ADR-0019): development, tests and the tester tunnel. Every
 * report stays urgency `unknown`, sorted at its reason's floor (BR-101, BR-102).
 */
import type { ReportTriage } from "../../domain";

export const noAiTriage: ReportTriage = { triage: () => Promise.resolve("unavailable") };
