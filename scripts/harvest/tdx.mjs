// scripts/harvest/tdx.mjs
// TDX OAuth2 (client_credentials) + paged OData fetch of Tourism endpoints.

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let cachedToken = null;
let cachedTokenExp = 0;

async function getToken(tdx) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExp - 30_000) return cachedToken;

  if (!tdx.clientId || !tdx.clientSecret) {
    throw new Error('TDX_CLIENT_ID / TDX_CLIENT_SECRET are not set');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: tdx.clientId,
    client_secret: tdx.clientSecret,
  });

  const res = await fetch(tdx.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`TDX auth failed: HTTP ${res.status} ${await safeText(res)}`);
  }
  const json = await res.json();
  cachedToken = json.access_token;
  cachedTokenExp = now + (json.expires_in || 86400) * 1000;
  return cachedToken;
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 300); } catch { return ''; }
}

// Page one endpoint until a short page is returned or the safety cap is hit.
async function fetchEndpoint(tdx, endpoint) {
  const token = await getToken(tdx);
  const out = [];
  for (let page = 0; page < tdx.maxPagesPerEndpoint; page++) {
    const skip = page * tdx.pageSize;
    const url =
      `${tdx.baseUrl}${endpoint.path}` +
      `?$top=${tdx.pageSize}&$skip=${skip}&$format=JSON`;

    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      // rate limited — back off and retry this page
      await delay(2000);
      page--;
      continue;
    }
    if (!res.ok) {
      throw new Error(`TDX ${endpoint.path} HTTP ${res.status} ${await safeText(res)}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    process.stdout.write(`  ${endpoint.source}: ${out.length} records\r`);
    if (batch.length < tdx.pageSize) break;
    await delay(tdx.delayMs);
  }
  console.log(`  ${endpoint.source}: ${out.length} records          `);
  return out.map((raw) => ({ raw, type: endpoint.type, source: endpoint.source }));
}

export async function harvestTdx(tdx) {
  if (!tdx.enabled) {
    console.log('TDX harvest disabled.');
    return [];
  }
  console.log('Harvesting TDX Tourism endpoints...');
  const all = [];
  for (const endpoint of tdx.endpoints) {
    try {
      const recs = await fetchEndpoint(tdx, endpoint);
      all.push(...recs);
    } catch (e) {
      console.error(`  ! ${endpoint.source} failed: ${e.message}`);
    }
  }
  return all;
}
