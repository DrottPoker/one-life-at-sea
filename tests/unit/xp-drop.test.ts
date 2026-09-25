import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { XpDropCard } from "../../src/components/xp-drop";
import { skillGains, type SkillProgress } from "../../src/lib/skills";

const progress = (xp: Record<string, number>): SkillProgress => ({ character_level: 7,
  skills: ["fishing", "crafting", "ship_battling"].map(id => ({ id, xp: xp[id] ?? 0, level: 1 })) });

describe("XP drop", () => {
  it("finds every skill whose XP grew, whatever awarded it", () => {
    expect(skillGains(progress({}), progress({}))).toEqual([]);
    expect(skillGains(progress({ fishing: 190 }), progress({ fishing: 200, crafting: 10 }))).toEqual([
      { id: "fishing", name: "Fishing", gained: 10, xp: 200, level: 2, levelUp: true, nextXp: 416, remaining: 216, percent: 0 },
      { id: "crafting", name: "Crafting", gained: 10, xp: 10, level: 1, levelUp: false, nextXp: 200, remaining: 190, percent: 5 },
    ]);
  });
  it("ignores lower XP and skills that were not in the previous snapshot", () => {
    expect(skillGains(progress({ fishing: 500 }), progress({ fishing: 300 }))).toEqual([]);
    const added = { character_level: 8, skills: [...progress({}).skills, { id: "mining", xp: 10, level: 1 }] };
    expect(skillGains(progress({}), added)).toEqual([]);
  });
  it("shows the skill, the gain, the total and progress to the next level, and marks a level-up", () => {
    const [gain] = skillGains(progress({ ship_battling: 195 }), progress({ ship_battling: 205 }));
    const html = renderToStaticMarkup(createElement(XpDropCard, { gains: [gain] }));
    expect(html).toContain('aria-label="Ship Battling XP gained"');
    expect(html).toContain('<span class="o-xp-drop-name">Ship Battling</span><strong class="o-xp-drop-gain">+10 XP</strong>');
    expect(html).toContain('aria-valuetext="211 XP to level 3"');
    expect(html).toContain("<span>Level 2</span><span>205 XP</span>");
    expect(html).toContain("Level up! Now level 2.");
    expect(html).toContain("--o-xp-drop:5000ms");
  });
  it("shows the maximum level without a next level", () => {
    const [gain] = skillGains(progress({ fishing: 4_999_990 }), progress({ fishing: 5_000_000 }));
    const html = renderToStaticMarkup(createElement(XpDropCard, { gains: [gain] }));
    expect(html).toContain('aria-valuetext="Maximum level"');
    expect(html).toContain('<div class="o-xp-drop-next">Maximum level</div>');
    expect(html).toContain("Level up! Now level 100.");
  });
});
