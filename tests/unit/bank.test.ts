import { describe, expect, it } from "vitest";
import { formatGold, isBankDirection, parseGoldAmount } from "../../src/lib/bank";
import { gameplay } from "../../src/config/public";

describe("Gold Coins inputs", () => {
  it.each([null, undefined, 10, "", " ", "0", "-1", "1.5", "1e3", "+2", "1,000", "1 000", "NaN", "Infinity", "9007199254740992"])(
    "rejects invalid amount %s", value => expect(parseGoldAmount(value)).toBeNull(),
  );
  it("accepts positive whole coins up to the safe configured maximum", () => {
    expect(parseGoldAmount("1")).toBe(1);
    expect(parseGoldAmount("0012")).toBe(12);
    expect(parseGoldAmount(String(gameplay.economy.maxGoldCoins))).toBe(gameplay.economy.maxGoldCoins);
  });
  it("recognizes only deposit and withdraw", () => {
    expect(isBankDirection("deposit")).toBe(true);
    expect(isBankDirection("withdraw")).toBe(true);
    expect(isBankDirection("purchase")).toBe(false);
    expect(isBankDirection(null)).toBe(false);
  });
  it("formats balances without losing large integer precision", () => {
    expect(formatGold(0)).toBe("0");
    expect(formatGold(1234)).toBe("1,234");
    expect(formatGold(9007199254740991)).toBe("9,007,199,254,740,991");
  });
});
