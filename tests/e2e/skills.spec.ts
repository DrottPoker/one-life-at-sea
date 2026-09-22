import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";
import { localDatabaseContainer } from "../support/local";

const execute = promisify(execFile);

test("profiles show private skills only to their owner and publish a live Character Level", async ({ page }) => {
  const own = await createTestAccount("skills-owner"), other = await createTestAccount("skills-other");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    testSql("select private.award_skill_xp('" + own.id + "','fishing',200); select private.award_skill_xp('" + other.id + "','crafting',2495);");
    await loginTestAccount(page, own);
    await page.getByRole("link", { name: "My Profile", exact: true }).click();
    const skills = page.getByRole("region", { name: "Skills", exact: true });
    await expect(skills.getByRole("article")).toHaveCount(7);
    await expect(page.getByLabel("Character Level", { exact: true })).toHaveText("8");
    await expect(skills.getByLabel("Fishing level", { exact: true })).toHaveText("2");
    await expect(skills.getByLabel("Fishing XP", { exact: true })).toHaveText("200");
    await expect(skills.getByLabel("Fishing level progress", { exact: true })).toHaveAttribute("aria-valuetext", "216 XP to level 3");
    testSql("select private.award_skill_xp('" + own.id + "','fishing',216);");
    await expect(skills.getByLabel("Fishing level", { exact: true })).toHaveText("3");
    await expect(page.getByLabel("Character Level", { exact: true })).toHaveText("9");
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(skills.getByLabel("Ship Battling level", { exact: true })).toBeVisible();
      if (width !== 320) await page.screenshot({ path: ".local/skills-owner-" + width + ".png", fullPage: true });
    }
    const otherState = await other.api.rpc("get_own_skills");
    expect(otherState.error).toBeNull();
    expect(otherState.data!.skills.find(skill => skill.id === "crafting")).toMatchObject({ xp: 2495, level: 10 });
    expect((await own.api.rpc("get_own_skills")).data!.skills.find(skill => skill.id === "crafting")).toMatchObject({ xp: 0, level: 1 });
    const publicProfile = await own.api.from("character_profiles").select("*").eq("character_id", other.id).single();
    expect(publicProfile.data!.character_level).toBe(16);
    expect(Object.keys(publicProfile.data!)).not.toContain("skills");
    expect(Object.keys(publicProfile.data!)).not.toContain("xp");
    await page.goto("/players/" + other.playerNumber);
    await expect(skills).toHaveCount(0);
    await expect(page.getByLabel("Character Level", { exact: true })).toHaveText("16");
    await expect(page.getByLabel("Crafting XP", { exact: true })).toHaveCount(0);
    testSql("select private.award_skill_xp('" + other.id + "','fishing',200);");
    await expect(page.getByLabel("Character Level", { exact: true })).toHaveText("17");
    await expect(skills).toHaveCount(0);
    await page.screenshot({ path: ".local/skills-other.png", fullPage: true });
    expect(errors).toEqual([]);
  } finally { await cleanupTestAccounts([own, other]); }
});

test("concurrent skill awards preserve every XP increment and the public sum", async () => {
  const own = await createTestAccount("skills-concurrent");
  try {
    await Promise.all(Array.from({ length: 8 }, (_, index) => execute("docker", ["exec", localDatabaseContainer,
      "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc",
      "select private.award_skill_xp('" + own.id + "','" + (index % 2 ? "fishing" : "crafting") + "',200);"])));
    const result = await own.api.rpc("get_own_skills");
    expect(result.error).toBeNull();
    expect(result.data!.skills.find(skill => skill.id === "fishing")).toMatchObject({ xp: 800, level: 4 });
    expect(result.data!.skills.find(skill => skill.id === "crafting")).toMatchObject({ xp: 800, level: 4 });
    expect(result.data!.character_level).toBe(13);
    expect((await own.api.from("character_profiles").select("character_level").eq("character_id", own.id).single()).data!.character_level).toBe(13);
  } finally { await cleanupTestAccounts([own]); }
});
