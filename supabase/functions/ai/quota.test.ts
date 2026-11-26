import { expect, test } from "bun:test";
import { isDailyLimitReached } from "./quota.ts";

test("allows 40 AI calls and blocks the 41st", () => {
  expect(isDailyLimitReached(39)).toBe(false);
  expect(isDailyLimitReached(40)).toBe(false);
  expect(isDailyLimitReached(41)).toBe(true);
});