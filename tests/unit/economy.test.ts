import { describe, expect, it } from "vitest";
import { economyNumber, economyShare } from "@/lib/economy";

describe("economy precision", () => {
  it("formats world wealth exactly beyond safe JavaScript integers", () => {
    expect(economyNumber("81129638414606663681390495662081")).toBe("81,129,638,414,606,663,681,390,495,662,081");
    expect(economyNumber(null)).toBe("Unpriced");
    expect(economyNumber("-1234")).toBe("-1,234");
  });
  it("scales large totals without rounding balances or dividing by zero", () => {
    expect(economyShare("81129638414606663681390495662081", "81129638414606663681390495662081")).toBe(100);
    expect(economyShare("1", "3")).toBe(33.33);
    expect(economyShare("0", "0")).toBe(0);
  });
});
