import { describe, expect, it } from "vitest";
import { avatarInitial, DEFAULT_OPERATOR_PROFILE, parseOperatorProfile } from "./operatorProfile";

describe("operator profile after the Harness rename", () => {
  it("maps a stored legacy Studio default to the new default", () => {
    expect(parseOperatorProfile(JSON.stringify({ displayName: "Studio" }))).toEqual({
      displayName: DEFAULT_OPERATOR_PROFILE.displayName,
    });
    expect(DEFAULT_OPERATOR_PROFILE.displayName).toBe("Harness");
  });

  it("keeps a name the operator chose", () => {
    expect(parseOperatorProfile(JSON.stringify({ displayName: "snowpear" }))).toEqual({ displayName: "snowpear" });
  });

  it("derives the avatar initial from the effective name", () => {
    expect(avatarInitial("Harness")).toBe("H");
    expect(avatarInitial("  ")).toBe("H");
  });
});
