// Anchor points in the combat artwork's own pixels (public/images/combat-*.webp). The attacker is drawn left, the defender right.
// Recalibrate these when the artwork changes; unit tests check that every configured hit zone has a point.
export const SCENE_SIZE = { width: 1774, height: 887 } as const;
export type ScenePoint = { x: number; y: number };
export type SceneSide = "attacker" | "defender";
// Ship zones plus the deck crew grape shot hits, the bow gun that fires, where a miss splashes and where the result label sits.
export type ShipAnchors = { rigging: ScenePoint; hull: ScenePoint; waterline: ScenePoint; deck: ScenePoint; guns: ScenePoint; splash: ScenePoint; label: ScenePoint };
// Crew zones plus the weapon hand, the free hand that throws, where a missed shot or throw lands and where the result label sits.
export type CrewAnchors = { head: ScenePoint; body: ScenePoint; legs: ScenePoint; feet: ScenePoint; blade: ScenePoint; hand: ScenePoint; stray: ScenePoint; floor: ScenePoint; label: ScenePoint };

export const sceneAnchors: { sea: Record<SceneSide, ShipAnchors>; boarding: Record<SceneSide, CrewAnchors> & { parry: ScenePoint } } = {
  sea: {
    attacker: { rigging: { x: 372, y: 318 }, hull: { x: 360, y: 585 }, waterline: { x: 340, y: 646 }, deck: { x: 400, y: 525 }, guns: { x: 445, y: 606 },
      splash: { x: 600, y: 676 }, label: { x: 350, y: 800 } },
    defender: { rigging: { x: 1418, y: 318 }, hull: { x: 1420, y: 590 }, waterline: { x: 1440, y: 650 }, deck: { x: 1380, y: 528 }, guns: { x: 1330, y: 608 },
      splash: { x: 1172, y: 680 }, label: { x: 1424, y: 800 } },
  },
  boarding: {
    attacker: { head: { x: 592, y: 387 }, body: { x: 575, y: 470 }, legs: { x: 650, y: 628 }, feet: { x: 694, y: 706 }, blade: { x: 745, y: 490 },
      hand: { x: 430, y: 482 }, stray: { x: 520, y: 300 }, floor: { x: 805, y: 732 }, label: { x: 560, y: 818 } },
    defender: { head: { x: 1196, y: 392 }, body: { x: 1215, y: 478 }, legs: { x: 1120, y: 628 }, feet: { x: 1085, y: 706 }, blade: { x: 1060, y: 520 },
      hand: { x: 1350, y: 490 }, stray: { x: 1275, y: 300 }, floor: { x: 975, y: 732 }, label: { x: 1214, y: 818 } },
    parry: { x: 895, y: 402 },
  },
};
