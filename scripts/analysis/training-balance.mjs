// Research model only. This does not change game rules or access the database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gameplay = JSON.parse(readFileSync(new URL("../../config/gameplay.json", import.meta.url), "utf8"));
const multipliers = gameplay.training.crewTiers.map(tier => tier.efficiency);
const legacyGains = [1, 2, 4, 8, 20, 50, 125, 300, 750, 1500];
const statNames = ["attack", "defense", "speed", "accuracy"];
const checkpoints = [30, 90, 180, 365, 730, 1095];
const drillEnergy = gameplay.training.energyCost;
assert.equal(drillEnergy, 5, "This research model uses 5-Energy blocks.");
assert.equal(gameplay.training.energyPerUnit, drillEnergy);
const crewExpectedMultiplier = 1 + gameplay.training.perfectChanceBps / 10_000 * (gameplay.training.perfectMultiplier - 1);

function candidateGain(stat, multiplier, exponent = gameplay.training.statExponent) {
  let gain = 0;
  for (let unit = 0; unit < drillEnergy; unit++) {
    const step = Math.round(multiplier / gameplay.training.energyPerUnit * (1 + (stat + gain) / gameplay.training.statScale) ** exponent * 1e6);
    gain = Math.round(gain * 1e6 + step) / 1e6;
  }
  return gain;
}

function simulate(dailyEnergy, { candidate = true, exponent = gameplay.training.statExponent, starterOnly = false, focus = false } = {}) {
  assert.equal(dailyEnergy % drillEnergy, 0);
  const stats = ["crew", "ship"].flatMap(group => statNames.map(stat => gameplay.startingStats[group][stat]));
  const xp = [0, 0];
  const boughtTier = [0, 0];
  const goldSpent = [0, 0];
  const series = [];
  let bothFinalTiersUnlockedDay = null;
  let trainIndex = 0;

  for (let day = 1; day <= checkpoints.at(-1); day++) {
    for (let train = 0; train < dailyEnergy / drillEnergy; train++, trainIndex++) {
      const index = focus ? 0 : trainIndex % stats.length;
      const group = Math.floor(index / statNames.length);
      const tiers = group === 0 ? gameplay.training.crewTiers : gameplay.training.shipTiers;
      const tierIndex = starterOnly ? 0 : tiers.findLastIndex(tier => xp[group] >= tier.xpRequired);
      for (let purchase = boughtTier[group] + 1; purchase <= tierIndex; purchase++) {
        goldSpent[group] += tiers[purchase].goldCost;
      }
      boughtTier[group] = tierIndex;
      const raw = candidate ? candidateGain(stats[index], multipliers[tierIndex], exponent) : legacyGains[tierIndex];
      // Deterministic mean-bonus approximation, not an exact stochastic expectation.
      stats[index] += raw * (group === 0 ? crewExpectedMultiplier : 1);
      xp[group] += drillEnergy * gameplay.training.xpPerEnergy;
    }
    const thresholds = [gameplay.training.crewTiers.at(-1).xpRequired, gameplay.training.shipTiers.at(-1).xpRequired];
    if (bothFinalTiersUnlockedDay === null && xp.every((value, index) => value >= thresholds[index])) {
      bothFinalTiersUnlockedDay = day;
    }
    if (checkpoints.includes(day)) series.push({
      day, crewAttack: Math.round(stats[0]), crewDefense: Math.round(stats[1]),
      shipAttack: Math.round(stats[4]), goldRequired: goldSpent.reduce((sum, value) => sum + value, 0),
    });
  }
  return { dailyEnergy, candidate, exponent, starterOnly, focus, bothFinalTiersUnlockedDay, series };
}

assert.equal(gameplay.training.crewTiers.length, multipliers.length);
assert.equal(gameplay.training.shipTiers.length, multipliers.length);
for (const stat of [10, 100, 1_000, 10_000, 100_000, 1_000_000]) {
  assert(candidateGain(stat * 10, 1) > candidateGain(stat, 1));
  assert(candidateGain(stat * 10, 1) / (stat * 10) < candidateGain(stat, 1) / stat);
  assert(candidateGain(stat, 3) > candidateGain(stat, 1) * 2.99);
}

const output = {
  model: { scale: gameplay.training.statScale, exponent: gameplay.training.statExponent, multipliers, crewExpectedMultiplier, drillEnergy },
  assumptions: [
    "Implemented stat-dependent curve, compared with the explicit legacy fixed-gain table; not Torn's formula.",
    "Daily Energy is already reserved for training, not all generated Energy.",
    "Eight stats rotate equally; focus scenario trains only Crew Attack.",
    "Gold is available for every tier as soon as XP permits, unless starterOnly.",
    "Current XP thresholds and prices; starting stats from gameplay config.",
    "Ship work is represented in 5-Energy blocks with no calendar delay or workshop downtime.",
    "Normal gains round each Energy unit to six decimals; Perfect Drill uses its mean multiplier rather than random rolls.",
    "No items, income simulation, sea schedule, missed Energy ticks, combat or equipment.",
    "This is a progression illustration, not a PvP win-rate simulation.",
  ],
  gainsPerFiveEnergy: [10, 100, 1_000, 10_000, 100_000, 1_000_000].map(stat => ({
    stat, firstTier: candidateGain(stat, multipliers[0]), finalTier: candidateGain(stat, multipliers.at(-1)),
  })),
  scenarios: [300, 600, 1_000, 1_440].flatMap(energy => [
    simulate(energy, { candidate: false }), simulate(energy),
  ]),
  sensitivity: [
    simulate(600, { starterOnly: true }),
    simulate(600, { focus: true }),
    simulate(600, { exponent: 0.5 }),
    simulate(600, { exponent: 0.7 }),
  ],
};
console.log(JSON.stringify(output, null, 2));
