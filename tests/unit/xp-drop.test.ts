import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { XpDropCard } from "../../src/components/xp-drop";
import { nextXpDrop, skillGains, type SkillProgress } from "../../src/lib/skills";

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
  it("adds more XP of the same skill to the drop on show and lets another skill take it over", () => {
    const first = nextXpDrop(null, skillGains(progress({ fishing: 190 }), progress({ fishing: 200 })))!;
    expect(first).toMatchObject({ id: "fishing", gained: 10, xp: 200, level: 2, levelUp: true, updates: 1 });
    const more = nextXpDrop(first, skillGains(progress({ fishing: 200 }), progress({ fishing: 210 })))!;
    expect(more).toMatchObject({ id: "fishing", gained: 20, xp: 210, level: 2, levelUp: true, updates: 2 });
    const other = nextXpDrop(more, skillGains(progress({ fishing: 210 }), progress({ fishing: 210, crafting: 10 })))!;
    expect(other).toMatchObject({ id: "crafting", gained: 10, xp: 10, levelUp: false, updates: 3 });
    expect(nextXpDrop(other, [])).toBe(other);
    expect(nextXpDrop(null, skillGains(progress({}), progress({ fishing: 10, crafting: 30 })))).toMatchObject({ id: "crafting", gained: 30 });
  });
  it("shows the skill, the gain, the level, the total and progress to the next level", () => {
    const drop = nextXpDrop(null, skillGains(progress({ ship_battling: 195 }), progress({ ship_battling: 205 })))!;
    const html = renderToStaticMarkup(createElement(XpDropCard, { drop }));
    expect(html).toContain('aria-label="Ship Battling XP gained"');
    expect(html).toContain('<span class="o-xp-drop-name">Ship Battling</span><strong class="o-xp-drop-gain">+10 XP</strong>');
    expect(html).toContain('aria-valuetext="211 XP to level 3"');
    expect(html).toContain('<span class="o-xp-drop-level">Level up! Level 2</span><span class="o-xp-drop-total">205 XP</span>');
    expect(renderToStaticMarkup(createElement(XpDropCard, { drop: { ...drop, levelUp: false } }))).toContain('<span class="o-xp-drop-level">Level 2</span>');
  });
  it("shows the maximum level without a next level", () => {
    const drop = nextXpDrop(null, skillGains(progress({ fishing: 4_999_990 }), progress({ fishing: 5_000_000 })))!;
    const html = renderToStaticMarkup(createElement(XpDropCard, { drop }));
    expect(html).toContain('aria-valuetext="Maximum level"');
    expect(html).toContain("Level up! Level 100");
  });
});
