import { writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createTestAccount, cleanupTestAccounts, loginTestAccount, testSql } from "../support/accounts";

// Opt-in measurements use disposable local accounts and a production build.
test("measure action and page latency", async ({ page }) => {
  test.skip(!process.env.MEASURE_PERFORMANCE, "Opt-in performance measurements");
  test.setTimeout(180000);
  const own = await createTestAccount("latency");
  const samples: Record<string, number[]> = {};
  const record = (name: string, value: number) => (samples[name] ??= []).push(value);
  try {
    testSql("update public.characters set stamina=200,stamina_updated_at=clock_timestamp()+interval '1 day' where id='" + own.id + "';");
    for (let index = 0; index < 15; index++) {
      const start = performance.now();
      const result = await own.api.rpc("perform_activity", { activity_id: "shore_fishing", expected_stamina_cost: 1, expected_xp_gain: 10, request_id: crypto.randomUUID() });
      expect(result.error).toBeNull();
      record("rpc_activity_ms", performance.now() - start);
      const readStart = performance.now();
      expect((await own.api.rpc("get_game_state")).error).toBeNull();
      record("rpc_game_state_ms", performance.now() - readStart);
    }
    await loginTestAccount(page, own);
    for (const path of ["/harbor", "/activities", "/harbor/bank", "/harbor/crew-training", "/harbor/ship-upgrades", "/inventory", "/harbor/marketplace", "/hideout/crafting", "/notifications", "/players/" + own.playerNumber]) {
      for (let index = 0; index < 3; index++) {
        const start = performance.now();
        const response = await page.goto(path);
        expect(response?.ok()).toBe(true);
        await expect(page.getByRole("main")).toBeVisible();
        record("page_" + path.replace(/\d+$/, "profile") + "_ms", performance.now() - start);
      }
    }
    await page.goto("/activities");
    await page.waitForLoadState("networkidle");
    const button = page.getByRole("button", { name: "Fish for 1 Stamina", exact: true });
    const xp = page.getByLabel("Shore Fishing XP", { exact: true });
    const requests: Promise<void>[] = [];
    page.on("requestfinished", request => {
      if (request.method() === "POST" && (request.url().includes("/activities") || request.url().includes("/rpc/"))) requests.push((async () => {
        const response = await request.response();
        if (!response) return;
        const timing = request.timing();
        record("http_" + new URL(request.url()).pathname + "_ms", timing.responseEnd);
        record("payload_" + new URL(request.url()).pathname + "_bytes", (await response.body()).byteLength);
      })());
    });
    for (let index = 0; index < 15; index++) {
      const before = Number((await xp.textContent())!.replaceAll(",", ""));
      const elapsed = await button.evaluate(async (element, before) => {
        const button = element as HTMLButtonElement;
        const start = performance.now();
        button.click();
        await new Promise<void>(resolve => {
          const check = () => {
            const xp = Number(document.querySelector('[aria-label="Shore Fishing XP"]')!.textContent!.replaceAll(",", ""));
            if (!button.disabled && xp === before + 10) resolve(); else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
        return performance.now() - start;
      }, before);
      record("click_to_ready_ms", elapsed);
    }
    await page.waitForLoadState("networkidle");
    await Promise.all(requests);
    testSql("update public.characters set gold_coins=10000,crew_morale=-50 where id='" + own.id + "';");
    await page.goto("/harbor/bank");
    for (let index = 0; index < 10; index++) {
      await page.getByLabel("Amount", { exact: true }).fill("1");
      const before = Number((await page.getByLabel("Bank balance", { exact: true }).textContent())!.replaceAll(",", ""));
      const elapsed = await page.getByRole("button", { name: "Deposit", exact: true }).evaluate(async (element, before) => {
        const button = element as HTMLButtonElement, start = performance.now();
        button.click();
        await new Promise<void>(resolve => {
          const check = () => {
            const balance = Number(document.querySelector('[aria-label="Bank balance"]')!.textContent!.replaceAll(",", ""));
            if (button.closest("form")!.getAttribute("aria-busy") === "false" && balance === before + 1) resolve(); else requestAnimationFrame(check);
          }; requestAnimationFrame(check);
        });
        return performance.now() - start;
      }, before);
      record("bank_click_to_ready_ms", elapsed);
    }
    await page.goto("/harbor/crew-training");
    for (let index = 0; index < 5; index++) {
      const energy = Number(await page.getByRole("progressbar", { name: "Energy", exact: true }).getAttribute("aria-valuenow"));
      const elapsed = await page.getByRole("button", { name: "Train Attack for 5 Energy", exact: true }).evaluate(async (element, energy) => {
        const button = element as HTMLButtonElement, start = performance.now();
        button.click();
        await new Promise<void>(resolve => {
          const check = () => {
            const current = Number(document.querySelector('[aria-label="Energy"][role="progressbar"]')!.getAttribute("aria-valuenow"));
            if (!button.disabled && current === energy - 5) resolve(); else requestAnimationFrame(check);
          }; requestAnimationFrame(check);
        });
        return performance.now() - start;
      }, energy);
      record("training_click_to_ready_ms", elapsed);
    }

    const summarize = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return { count: values.length, median: Math.round(sorted[Math.floor(sorted.length / 2)]), p95: Math.round(sorted[Math.ceil(sorted.length * .95) - 1]), min: Math.round(sorted[0]), max: Math.round(sorted.at(-1)!) }; };
    const summary = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, summarize(values)]));
    const tag = process.env.MEASURE_PERFORMANCE!.replace(/[^a-z0-9-]/gi, "");
    writeFileSync(".local/performance-" + tag + ".json", JSON.stringify({ summary, samples }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally { await cleanupTestAccounts([own]); }
});
