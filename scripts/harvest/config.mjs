// scripts/harvest/config.mjs
// Central configuration for the open-data harvest pipeline.
// Everything sensitive (TDX credentials) comes from environment variables.

export const config = {
  // ---- TDX (Transport Data eXchange) — official Taiwan tourism open data ----
  tdx: {
    enabled: process.env.HARVEST_TDX !== 'false', // on by default
    tokenUrl:
      process.env.TDX_TOKEN_URL ||
      'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    baseUrl: process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic/v2',
    clientId: process.env.TDX_CLIENT_ID || '',
    clientSecret: process.env.TDX_CLIENT_SECRET || '',
    // Tourism endpoints to page through (path under baseUrl -> place `type`)
    endpoints: [
      { path: '/Tourism/ScenicSpot', type: 'scenic_spot', source: 'tdx:scenicspot' },
      { path: '/Tourism/Activity', type: 'activity', source: 'tdx:activity' },
      { path: '/Tourism/Restaurant', type: 'restaurant', source: 'tdx:restaurant' },
    ],
    pageSize: Number(process.env.TDX_PAGE_SIZE || 300),
    delayMs: Number(process.env.TDX_DELAY_MS || 250), // polite pause between pages
    maxPagesPerEndpoint: Number(process.env.TDX_MAX_PAGES || 200), // safety cap
  },

  // ---- data.gov.tw — fragmented; supply direct JSON/CSV resource URLs ----
  // Provide a comma-separated list in DATAGOV_RESOURCES, optionally as
  //   "label|type|url" tuples (type ∈ scenic_spot|activity|restaurant|other).
  // Examples can be added without touching code.
  datagov: {
    enabled: process.env.HARVEST_DATAGOV !== 'false',
    resources: parseDatagovResources(process.env.DATAGOV_RESOURCES || ''),
  },

  // ---- output ----
  output: {
    places: 'data/places.json',
    stats: 'data/places.stats.json',
  },

  // ---- dedupe tuning ----
  dedupe: {
    nameSimilarity: Number(process.env.DEDUPE_NAME_SIM || 0.85), // Jaro-Winkler
    maxMergeMeters: Number(process.env.DEDUPE_MAX_METERS || 150), // geo proximity
    // source priority when merging (lower index wins as the "base" record)
    priority: ['tdx:scenicspot', 'tdx:activity', 'tdx:restaurant'],
  },
};

function parseDatagovResources(raw) {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const parts = entry.split('|').map((p) => p.trim());
      if (parts.length === 3) {
        const [label, type, url] = parts;
        return { label: label || `datagov-${i}`, type: type || 'other', url };
      }
      return { label: `datagov-${i}`, type: 'other', url: parts[parts.length - 1] };
    });
}

// ---- keyword maps used by normalize.mjs ----

// Audience is assigned ONLY when explicit. Conservative keyword lists.
export const audienceKeywords = {
  kids: [
    '親子', '兒童', '幼兒', '寶寶', '童樂', '溜滑梯', '遊樂園', '遊樂區', '親子館',
    '親子友善', '兒童樂園', 'kids', 'children', 'family-friendly', 'playground',
  ],
  adults: [
    '酒吧', '夜店', '夜生活', '成人', '限制級', '十八禁', '18禁', '清吧',
    'bar', 'nightclub', 'pub', 'nightlife',
  ],
};

// Explicit age range like "0-3歲", "3~6 歲", "適合 6 至 12 歲"
export const ageRegex = /(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*歲/;

// Derived tags: substring (case-insensitive) -> tag
export const tagKeywords = {
  '室內': 'indoor', 'indoor': 'indoor',
  '戶外': 'outdoor', 'outdoor': 'outdoor',
  '自然': 'nature', '生態': 'nature', '森林': 'nature', '步道': 'trail',
  '瀑布': 'waterfall', '溫泉': 'hot spring', '海灘': 'beach', '沙灘': 'beach',
  '夜市': 'night market', '老街': 'old street', '廟': 'temple', '宮': 'temple',
  '博物館': 'museum', 'museum': 'museum', '美術館': 'art', '藝術': 'art',
  '科學': 'science', '水族': 'aquarium', '動物園': 'zoo', '牧場': 'farm', '農場': 'farm',
  '公園': 'park', '湖': 'lake', '步行': 'walking', '單車': 'bike path', '自行車': 'bike path',
  '美食': 'food', '餐廳': 'food', '咖啡': 'cafe', '觀景': 'viewpoint', '展望': 'viewpoint',
  '燈會': 'festival', '節': 'festival', '市集': 'market',
};
