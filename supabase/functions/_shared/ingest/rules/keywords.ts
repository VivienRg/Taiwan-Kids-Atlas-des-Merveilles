// Name-keyword categories (docs/ingestion.md §4.5). Emitted as "kw:<slug>"
// source category codes from the attraction name only; migration 0300 maps
// every kw:<slug> to <slug>.
// Regexes are JavaScript RegExp equivalents of the jq prototype rules.
export const KEYWORD_RULES: Array<{ slug: string; pattern: RegExp }> = [
  { slug: 'animals', pattern: /動物園|水族館|海洋館|昆蟲館|蝴蝶園|鳥園|牧場/ },
  { slug: 'museum', pattern: /博物館|美術館|文物館|紀念館|藝術館|展示館|文化館/ },
  { slug: 'science', pattern: /科學|科教館|天文|探索館|教育館|自然教育中心/ },
  { slug: 'library', pattern: /圖書館|書店/ },
  { slug: 'theme-park', pattern: /樂園|遊樂園|主題園區/ },
  { slug: 'playground', pattern: /遊戲場|兒童遊戲|共融|親子館|兒童館|遊樂場/ },
  { slug: 'park', pattern: /公園|綠地|森林園區/ },
  { slug: 'trail', pattern: /步道|自行車道|古道|綠廊|鐵馬道/ },
  { slug: 'water', pattern: /海灘|海水浴場|沙灘|親水|戲水/ },
  { slug: 'farm', pattern: /農場|牧場|農園|果園|茶園|休閒農業/ },
  { slug: 'diy', pattern: /觀光工廠|體驗館|工坊|DIY/ },
  { slug: 'market', pattern: /老街|夜市|市集|商圈/ },
  { slug: 'hot-spring', pattern: /溫泉/ },
  { slug: 'transport', pattern: /車站|火車站|鐵道|機場/ },
  { slug: 'nature', pattern: /瀑布|海岸|濕地|峽谷|風景區/ },
];

export function keywordCodes(name: string | null | undefined): string[] {
  const n = name ?? '';
  return KEYWORD_RULES.filter((r) => r.pattern.test(n)).map((r) => `kw:${r.slug}`);
}
