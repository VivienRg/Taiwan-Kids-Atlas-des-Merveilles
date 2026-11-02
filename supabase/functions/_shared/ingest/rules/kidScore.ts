// Kid-friendliness score rules v1 (docs/ingestion.md §4.4, KID_RULES_VERSION = 1).
// Mirrors the jq prototype ta_attractions.jq / ta_events.jq exactly so the TS
// normaliser produces the same rows as the verified reference.

const CLASS_WEIGHT: Record<string, number> = {
  '26': 60, '20': 60, '25': 40, '27': 40, '14': 40, '9': 40, '15': 40,
  '19': 30, '17': 30, '24': 20, '16': 20, '13': 20, '12': 20,
};

const NAME_BOOST = /動物園|水族館|樂園|兒童|親子|博物館|科學館|科教館|天文館|圖書館|農場|牧場|觀光工廠/;
const FAMILY = /親子|兒童|孩童|小朋友|幼兒|寶寶/;
const PLAYGROUND = /遊戲場|遊樂場|溜滑梯|共融|遊具|沙坑/;
const WATER = /戲水|玩水|親水/;
const ANIMAL_TXT = /動物|水族|昆蟲|蝴蝶/;
const DIY = /DIY|手作|體驗/;
const LEARNING = /科學|科技|天文|恐龍|探索/;
const NEGATIVE = /酒吧|夜店|酒莊|酒廠|賭場|情趣/;
const NATURE_CLASSES = new Set(['2', '7', '8', '11', '16', '18']);

export interface KidScoreInput {
  classes: string[];          // raw class codes as strings
  name?: string | null;
  description?: string | null;
  tags?: string[];
  facilities: string[];       // FacilityEnum codes as strings
  isAccessibleForFree: number | null;
  fees: Array<{ Price: number }>;
  serviceStatus: number | null;
}

export function computeKidScore(input: KidScoreInput): { score: number; kidTags: string[] } {
  const classes = input.classes;
  const base = Math.max(0, ...classes.map((c) => CLASS_WEIGHT[c] ?? 0));

  const name = input.name ?? '';
  const desc = input.description ?? '';
  const tagsText = (input.tags ?? []).join(' ');
  const txt = `${name} ${desc} ${tagsText}`.replace(/\s+/g, ' ');

  let raw = base;
  const tags: string[] = [];

  if (NAME_BOOST.test(name)) raw += 30;
  if (FAMILY.test(txt)) { raw += 30; tags.push('family'); }
  if (PLAYGROUND.test(txt)) { raw += 30; tags.push('playground'); }
  if (WATER.test(txt)) { raw += 15; tags.push('water_play'); }
  if (ANIMAL_TXT.test(txt)) { raw += 10; tags.push('animals'); }
  if (DIY.test(txt)) { raw += 10; tags.push('diy'); }
  if (LEARNING.test(txt)) { raw += 10; tags.push('learning'); }
  if (input.facilities.includes('3')) { raw += 20; tags.push('nursing_room'); }
  if (input.facilities.includes('56')) { raw += 15; tags.push('stroller_friendly'); }
  if (NEGATIVE.test(txt)) raw -= 60;

  const score =
    input.serviceStatus === 0
      ? 0
      : Math.min(100, Math.max(0, raw));

  // Class-derived tags (jq order; final array is deduped + sorted by callers).
  if (classes.includes('26') || ANIMAL_TXT.test(txt)) tags.push('animals');
  if (classes.includes('20')) tags.push('rides');
  if (classes.includes('25') || LEARNING.test(txt)) tags.push('learning');
  if (DIY.test(txt)) tags.push('diy');
  if (classes.some((c) => NATURE_CLASSES.has(c))) tags.push('nature');
  if (input.facilities.includes('3')) tags.push('nursing_room');
  if (input.facilities.includes('56')) tags.push('stroller_friendly');
  if (
    input.isAccessibleForFree === 1 ||
    (input.fees.length > 0 && input.fees.every((f) => f.Price === 0))
  ) {
    tags.push('free');
  }

  return { score, kidTags: [...new Set(tags)].sort() };
}
