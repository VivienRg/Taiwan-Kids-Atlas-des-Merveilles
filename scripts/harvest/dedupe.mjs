// scripts/harvest/dedupe.mjs
// Merge near-duplicate places across sources using name similarity + geo proximity.

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\(\)（）【】\[\]\-_,.、，。]+/g, '')
    .trim();
}

function jaroWinkler(a, b) {
  a = normName(a); b = normName(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aM = Array(a.length).fill(false), bM = Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - m), end = Math.min(i + m + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bM[j] || a[i] !== b[j]) continue;
      aM[i] = bM[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0, trans = 0;
  for (let i = 0; i < a.length; i++) if (aM[i]) {
    while (!bM[k]) k++;
    if (a[i] !== b[k]) trans++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - trans / 2) / matches) / 3;
  let l = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) { if (a[i] === b[i]) l++; else break; }
  return jaro + l * 0.1 * (1 - jaro);
}

function haversineMeters(p1, p2) {
  if (!p1 || !p2) return Infinity;
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat), dLon = toRad(p2.lon - p1.lon);
  const lat1 = toRad(p1.lat), lat2 = toRad(p2.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isDuplicate(a, b, cfg) {
  const sim = jaroWinkler(a.name, b.name);
  const dist = haversineMeters(a.position, b.position);
  // strong: very similar name AND physically close
  if (sim >= cfg.nameSimilarity && dist <= cfg.maxMergeMeters) return true;
  // exact normalized name in the same region
  if (normName(a.name) === normName(b.name) && a.region && a.region === b.region) return true;
  return false;
}

function uniq(arr) { return [...new Set(arr)]; }

function priorityOf(place, priority) {
  const src = place.sources[0]?.source || '';
  const idx = priority.indexOf(src);
  return idx === -1 ? priority.length : idx;
}

function merge(base, other) {
  // base wins scalar fields; fill blanks from other; union list fields.
  const out = { ...base };
  const scalars = ['name_en', 'description', 'address', 'city', 'district', 'phone',
    'website', 'map_link', 'open_time', 'ticket_info', 'charge',
    'start_time', 'end_time', 'src_update_time', 'position'];
  for (const k of scalars) if (!out[k] && other[k]) out[k] = other[k];
  if (!out.region && other.region) out.region = other.region;
  if (!out.age_range && other.age_range) out.age_range = other.age_range;
  out.categories = uniq([...(out.categories || []), ...(other.categories || [])]);
  out.tags = uniq([...(out.tags || []), ...(other.tags || [])]);
  out.sources = [...out.sources, ...other.sources];
  out.pictures = [...(out.pictures || []), ...(other.pictures || [])]
    .filter((p, i, a) => a.findIndex((q) => q.url === p.url) === i);
  // audience: prefer a specific (kids/adults) over 'all'
  if (out.audience === 'all' && other.audience !== 'all') out.audience = other.audience;
  return out;
}

export function dedupe(places, cfg) {
  // Bucket by region to keep comparisons local (O(n^2) within a region only).
  const buckets = new Map();
  for (const p of places) {
    const key = normName(p.region) || '__none__';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }

  const result = [];
  let merged = 0;
  for (const bucket of buckets.values()) {
    const kept = [];
    for (const place of bucket) {
      let hit = null;
      for (const k of kept) {
        if (isDuplicate(place, k, cfg)) { hit = k; break; }
      }
      if (hit) {
        // ensure the higher-priority record stays as base
        if (priorityOf(place, cfg.priority) < priorityOf(hit, cfg.priority)) {
          const idx = kept.indexOf(hit);
          kept[idx] = merge(place, hit);
        } else {
          const idx = kept.indexOf(hit);
          kept[idx] = merge(hit, place);
        }
        merged++;
      } else {
        kept.push(place);
      }
    }
    result.push(...kept);
  }
  return { places: result, mergedCount: merged };
}

export { jaroWinkler, haversineMeters, normName };
