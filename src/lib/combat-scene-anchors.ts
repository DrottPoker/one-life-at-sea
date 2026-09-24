// Anchor points and hit areas in the combat artwork's own pixels (public/images/combat-*.webp). The attacker is drawn left,
// the defender right. Recalibrate these when the artwork changes; unit tests check that every configured hit zone has an area.
export const SCENE_SIZE = { width: 1774, height: 887 } as const;
// A new artwork gets a new file name so image caches never serve the old one.
export const SCENE_ART = { sea: "/images/combat-sea-broadside.webp", boarding: "/images/combat-boarding-duel.webp" } as const;
export type ScenePoint = { x: number; y: number };
export type SceneEllipse = ScenePoint & { rx: number; ry: number };
// A hit area is one or more ellipses covering the part that can be struck, such as each sail or each leg; the first is its centre.
export type SceneArea = readonly SceneEllipse[];
export type SceneSide = "attacker" | "defender";
// Ship zones, the deck crew grape shot hits and the water around the ship a miss splashes into, plus the firing gun and the result label.
export type ShipAnchors = { rigging: SceneArea; hull: SceneArea; waterline: SceneArea; deck: SceneArea; splash: SceneArea; guns: ScenePoint; label: ScenePoint };
// Crew zones, the space around the figure a missed shot or swing passes through and the plank a missed throw lands on,
// plus the weapon hand, the free hand that throws and the result label.
export type CrewAnchors = { head: SceneArea; body: SceneArea; legs: SceneArea; feet: SceneArea; near: SceneArea; floor: SceneArea;
  blade: ScenePoint; hand: ScenePoint; label: ScenePoint };

export const sceneAnchors: { sea: Record<SceneSide, ShipAnchors>; boarding: Record<SceneSide, CrewAnchors> & { parry: SceneArea } } = {
  sea: {
    attacker: {
      rigging: [{ x: 350, y: 362, rx: 100, ry: 100 }, { x: 330, y: 196, rx: 62, ry: 44 }, { x: 522, y: 392, rx: 56, ry: 70 }, { x: 478, y: 258, rx: 48, ry: 36 },
        { x: 152, y: 386, rx: 66, ry: 52 }],
      hull: [{ x: 322, y: 592, rx: 228, ry: 28 }, { x: 98, y: 544, rx: 40, ry: 32 }],
      waterline: [{ x: 322, y: 648, rx: 205, ry: 7 }],
      deck: [{ x: 352, y: 514, rx: 170, ry: 16 }],
      splash: [{ x: 330, y: 722, rx: 250, ry: 22 }, { x: 650, y: 690, rx: 90, ry: 22 }, { x: 662, y: 632, rx: 44, ry: 9 }, { x: 62, y: 690, rx: 45, ry: 16 }],
      guns: { x: 445, y: 606 }, label: { x: 350, y: 800 },
    },
    defender: {
      rigging: [{ x: 1440, y: 380, rx: 106, ry: 88 }, { x: 1442, y: 196, rx: 66, ry: 48 }, { x: 1252, y: 405, rx: 58, ry: 58 }, { x: 1295, y: 266, rx: 52, ry: 32 },
        { x: 1632, y: 392, rx: 58, ry: 66 }],
      hull: [{ x: 1467, y: 598, rx: 228, ry: 28 }, { x: 1686, y: 546, rx: 38, ry: 32 }],
      waterline: [{ x: 1462, y: 652, rx: 210, ry: 7 }],
      deck: [{ x: 1470, y: 522, rx: 185, ry: 16 }],
      splash: [{ x: 1460, y: 724, rx: 250, ry: 22 }, { x: 1120, y: 692, rx: 90, ry: 22 }, { x: 1110, y: 634, rx: 44, ry: 9 }, { x: 1718, y: 694, rx: 45, ry: 16 }],
      guns: { x: 1330, y: 608 }, label: { x: 1424, y: 800 },
    },
  },
  boarding: {
    attacker: {
      head: [{ x: 590, y: 402, rx: 25, ry: 33 }],
      body: [{ x: 575, y: 492, rx: 48, ry: 58 }],
      legs: [{ x: 440, y: 640, rx: 32, ry: 42 }, { x: 660, y: 636, rx: 28, ry: 42 }, { x: 560, y: 592, rx: 56, ry: 20 }],
      feet: [{ x: 385, y: 712, rx: 24, ry: 14 }, { x: 686, y: 715, rx: 28, ry: 12 }],
      near: [{ x: 595, y: 335, rx: 45, ry: 20 }, { x: 470, y: 425, rx: 34, ry: 32 }, { x: 665, y: 415, rx: 30, ry: 40 }, { x: 372, y: 560, rx: 30, ry: 34 },
        { x: 722, y: 565, rx: 26, ry: 34 }, { x: 560, y: 662, rx: 40, ry: 28 }],
      floor: [{ x: 540, y: 736, rx: 110, ry: 8 }, { x: 800, y: 738, rx: 70, ry: 8 }],
      blade: { x: 745, y: 490 }, hand: { x: 430, y: 482 }, label: { x: 560, y: 818 },
    },
    defender: {
      head: [{ x: 1163, y: 412, rx: 28, ry: 36 }],
      body: [{ x: 1212, y: 520, rx: 48, ry: 62 }],
      legs: [{ x: 1112, y: 640, rx: 30, ry: 42 }, { x: 1327, y: 645, rx: 32, ry: 42 }, { x: 1215, y: 588, rx: 56, ry: 20 }],
      feet: [{ x: 1080, y: 712, rx: 30, ry: 13 }, { x: 1382, y: 712, rx: 24, ry: 12 }],
      near: [{ x: 1165, y: 342, rx: 45, ry: 20 }, { x: 1105, y: 440, rx: 30, ry: 38 }, { x: 1300, y: 438, rx: 34, ry: 38 }, { x: 1052, y: 585, rx: 26, ry: 34 },
        { x: 1418, y: 560, rx: 28, ry: 34 }, { x: 1218, y: 662, rx: 44, ry: 28 }],
      floor: [{ x: 1232, y: 736, rx: 110, ry: 8 }, { x: 975, y: 738, rx: 70, ry: 8 }],
      blade: { x: 1060, y: 520 }, hand: { x: 1350, y: 490 }, label: { x: 1214, y: 818 },
    },
    parry: [{ x: 895, y: 405, rx: 30, ry: 26 }],
  },
};
