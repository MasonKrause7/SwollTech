import { describe, expect, it } from "vitest";
import { planClaim } from "./claim";

describe("planClaim", () => {
  it("keeps the notebook for the same account, even with unsynced changes", () => {
    expect(planClaim({ owner: "u1", userId: "u1", unsaved: 12, hasData: true })).toBe("keep");
  });

  it("keeps an empty notebook with no owner", () => {
    expect(planClaim({ owner: null, userId: "u1", unsaved: 0, hasData: false })).toBe("keep");
  });

  it("clears rows nobody owns (a sync that raced a sign out)", () => {
    expect(planClaim({ owner: null, userId: "u1", unsaved: 0, hasData: true })).toBe("clear");
  });

  it("clears a different account's notebook when everything in it was saved", () => {
    expect(planClaim({ owner: "u1", userId: "u2", unsaved: 0, hasData: true })).toBe("clear");
  });

  it("asks before throwing away another account's unsaved changes", () => {
    expect(planClaim({ owner: "u1", userId: "u2", unsaved: 3, hasData: true })).toBe("confirm-clear");
    expect(planClaim({ owner: null, userId: "u2", unsaved: 1, hasData: true })).toBe("confirm-clear");
  });
});
