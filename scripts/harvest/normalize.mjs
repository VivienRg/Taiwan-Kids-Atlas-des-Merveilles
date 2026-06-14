// scripts/harvest/normalize.mjs
// Map heterogeneous source records into the unified Place schema.

import { audienceKeywords, ageRegex, tagKeywords } from './config.mjs';

// pick the first non-empty value among candidate keys (case-insensitive-ish)
function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
  }
  return '';
}

function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Encode a few CJK chars into the slug deterministically so ids stay unique & ascii-safe.
function safeId(prefix, name, srcId) {
  const base = slug(name).replace(/[一-鿿]/g, '');
  const hashSrc = `${name}|${srcId}`;
  let h = 0;
  for (let i = 0; i < hashSrc.length; i++) h = (h * 31 + hashSrc.charCodeAt(i)) >>> 0;
  return `${prefix}-${base || 'x'}-${h.toString(36)}`;
}

function picturesFrom(raw) {
  const pics = [];
  const p = raw.Picture || raw.picture || {};
  for (let i = 1; i <= 3; i++) {
    const url = p[`PictureUrl${i}`] || p[`pictureUrl${i}`];
    if (url) pics.push({ url, description: p[`PictureDescription${i}`] || '' });
  }
  // generic single-image fields
  const single = pick(raw, ['imageUrl', 'image', 'photo', 'PicURL']);
  if (single) pics.push({ url: single });
  return pics;
}

function positionFrom(raw) {
  const pos = raw.Position || raw.position || {};
  const lat = num(pos.PositionLat ?? pos.lat ?? raw.lat ?? raw.Lat ?? raw.latitude ?? raw.Py);
  const lon = num(pos.PositionLon ?? pos.lon ?? raw.lon ?? raw.Lon ?? raw.longitude ?? raw.Px);
  if (lat == null || lon == null) return undefined;
  return { lat, lon, ...(pos.GeoHash ? { geohash: pos.GeoHash } : {}) };
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function categoriesFrom(raw) {
  const cats = [
    raw.Class1, raw.Class2, raw.Class3, raw.Class,
    raw.category, raw.Category, raw.type, raw.Type,
  ].filter((c) => c != null && String(c).trim() !== '');
  return [...new Set(cats.map((c) => String(c).trim()))];
}

function deriveTags(blob, categories) {
  const hay = blob.toLowerCase();
  const tags = new Set();
  for (const [needle, tag] of Object.entries(tagKeywords)) {
    if (hay.includes(needle.toLowerCase())) tags.add(tag);
  }
  // fold simple category strings in as tags too (kept short)
  for (const c of categories) {
    const t = String(c).trim();
    if (t && t.length <= 12) tags.add(t);
  }
  return [...tags];
}

// Audience ONLY when explicit; otherwise 'all'.
function deriveAudience(blob) {
  const hay = blob.toLowerCase();
  const hasKids = audienceKeywords.kids.some((k) => hay.includes(k.toLowerCase()));
  const hasAdults = audienceKeywords.adults.some((k) => hay.includes(k.toLowerCase()));
  if (hasKids && !hasAdults) return 'kids';
  if (hasAdults && !hasKids) return 'adults';
  return 'all';
}

function deriveAgeRange(blob) {
  const m = blob.match(ageRegex);
  if (!m) return undefined;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  if (Number.isFinite(a) && Number.isFinite(b) && a <= b && b <= 99) return [a, b];
  return undefined;
}

export function normalizeRecord(rec, harvestedAt) {
  const { raw, type, source } = rec;

  const name = pick(raw, [
    'ScenicSpotName', 'ActivityName', 'RestaurantName', 'Name', 'name', 'title',
  ]);
  if (!name) return null;

  const srcId = pick(raw, [
    'ScenicSpotID', 'ActivityID', 'RestaurantID', 'ID', 'id', '_id',
  ]) || `${rec.sourceIndex ?? ''}`;

  const description = pick(raw, [
    'DescriptionDetail', 'Description', 'description', 'desc', 'Remarks', 'Introduction',
  ]);
  const address = pick(raw, ['Address', 'address', 'Location', 'location', 'addr']);
  const city = pick(raw, ['City', 'city', 'County', 'county', 'Region', 'region']);
  const categories = categoriesFrom(raw);

  const blob = [name, description, address, city, categories.join(' '),
    pick(raw, ['Keyword', 'keyword', 'tags'])].filter(Boolean).join(' ');

  const prefix = source.replace(/[^a-z0-9]+/gi, '');
  const place = {
    id: safeId(prefix, name, srcId),
    sources: [{ source, source_id: String(srcId) }],
    name: String(name).trim(),
    type: ['scenic_spot', 'activity', 'restaurant'].includes(type) ? type : 'other',
    categories,
    tags: deriveTags(blob, categories),
    audience: deriveAudience(blob),
    region: String(city || '').trim(),
    harvested_at: harvestedAt,
  };

  const age = deriveAgeRange(blob);
  if (age) place.age_range = age;

  if (description) place.description = String(description).trim();
  if (address) place.address = String(address).trim();
  if (city) place.city = String(city).trim();

  const district = pick(raw, ['District', 'district', 'town', 'Town']);
  if (district) place.district = String(district).trim();

  const position = positionFrom(raw);
  if (position) place.position = position;

  const phone = pick(raw, ['Phone', 'phone', 'tel', 'Tel']);
  if (phone) place.phone = String(phone).trim();

  const website = pick(raw, ['WebsiteUrl', 'website', 'url', 'URL', 'Website']);
  if (website) place.website = String(website).trim();

  const mapLink = pick(raw, ['MapUrl', 'mapUrl', 'map_link', 'GoogleMap']);
  if (mapLink) place.map_link = String(mapLink).trim();

  const openTime = pick(raw, ['OpenTime', 'openTime', 'opentime']);
  if (openTime) place.open_time = String(openTime).trim();

  const ticket = pick(raw, ['TicketInfo', 'ticketInfo']);
  if (ticket) place.ticket_info = String(ticket).trim();

  const charge = pick(raw, ['Charge', 'charge', 'Fee', 'fee']);
  if (charge) place.charge = String(charge).trim();

  if (type === 'activity') {
    const start = pick(raw, ['StartTime', 'startTime', 'start']);
    const end = pick(raw, ['EndTime', 'endTime', 'end']);
    if (start) place.start_time = String(start).trim();
    if (end) place.end_time = String(end).trim();
  }

  const pics = picturesFrom(raw);
  if (pics.length) place.pictures = pics;

  const upd = pick(raw, ['SrcUpdateTime', 'UpdateTime', 'updateTime', 'updated_at']);
  if (upd) place.src_update_time = String(upd).trim();

  return place;
}

export function normalizeAll(records, harvestedAt) {
  const out = [];
  for (const rec of records) {
    try {
      const p = normalizeRecord(rec, harvestedAt);
      if (p) out.push(p);
    } catch {
      /* skip malformed record */
    }
  }
  return out;
}
