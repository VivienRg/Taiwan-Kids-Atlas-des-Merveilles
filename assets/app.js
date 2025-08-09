// Kid Activities Taiwan — App (vanilla JS)
// Loads /data/activities.json and renders a filterable card list

function priceVal(p){ if(!p) return 1e9; const s = String(p).toLowerCase(); if(s.includes("free")) return 0; const m = s.match(/nt\$?\s*([\d]+)/i); return m? parseInt(m[1]) : 999999; }
function overlap(aMin,aMax,bMin,bMax){ return !(aMax<bMin || bMax<aMin); }
function byName(a,b){ return String(a.name).localeCompare(String(b.name),'en'); }
function byDrive(a,b){ return (a.drive_min||999) - (b.drive_min||999); }
function byPrice(a,b){ return priceVal(a.cost_ntd||a.price) - priceVal(b.cost_ntd||b.price); }

function pill(text){
  const s = document.createElement('span');
  s.className = 'pill';
  s.textContent = text;
  return s;
}

function renderList(list){
  const cards = document.getElementById('cards');
  const count = document.getElementById('count');
  cards.innerHTML = '';
  count.textContent = list.length + ' activities';

  if(!list.length){
    const d = document.createElement('div');
    d.style.color = 'var(--muted)';
    d.textContent = 'No results.';
    cards.appendChild(d);
    return;
  }

  list.forEach(it => {
    const card = document.createElement('article');
    card.className = 'card';

    const h = document.createElement('h3');
    h.textContent = it.name || '';
    card.appendChild(h);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.appendChild(pill(it.indoor_outdoor || it.indoorOutdoor || ''));
    meta.appendChild(pill((it.categories||[]).join(', ')));
    meta.appendChild(pill('Drive: ' + (it.drive_min!=null ? (it.drive_min + ' min') : '—')));
    const age = (it.ageRange ? (it.ageRange[0]+'–'+it.ageRange[1]) : ((it.age_min||0)+'–'+(it.age_max||12)));
    meta.appendChild(pill('Ages: ' + age));
    meta.appendChild(pill('Price: ' + (it.cost_ntd || it.price || '—')));
    meta.appendChild(pill((it.district||'') + ' ' + (it.city||'')));
    card.appendChild(meta);

    if(it.desc || it.description){
      const p = document.createElement('p');
      p.className = 'desc';
      p.textContent = it.desc || it.description;
      card.appendChild(p);
    }

    if(it.tags && it.tags.length){
      const tagMeta = document.createElement('div');
      tagMeta.className = 'meta';
      it.tags.forEach(t => tagMeta.appendChild(pill('#' + t)));
      card.appendChild(tagMeta);
    }

    const links = document.createElement('div');
    links.className = 'links';
    const m = document.createElement('a');
    m.href = it.map_link || it.gmap || ('https://www.google.com/maps?q=' + encodeURIComponent(it.name||''));
    m.textContent = '🗺️ Open in Maps';
    m.target = '_blank'; m.rel = 'noopener';
    links.appendChild(m);
    if(it.website){
      const w = document.createElement('a');
      w.href = it.website; w.textContent = '🌐 Website';
      w.target = '_blank'; w.rel = 'noopener';
      links.appendChild(w);
    }
    card.appendChild(links);

    cards.appendChild(card);
  });
}

function matchesFilters(it, state){
  const blob = [it.name, it.desc||it.description||'', (it.tags||[]).join(' '), (it.categories||[]).join(' '), it.district||'', it.city||'', it.cost_ntd||it.price||''].join(' ').toLowerCase();
  if(state.q && blob.indexOf(state.q) === -1) return false;
  const ioVal = it.indoor_outdoor || it.indoorOutdoor || '';
  if(state.io.size && !state.io.has(ioVal)) return false;
  const r = it.ageRange || [it.age_min||0, it.age_max||12];
  if(!overlap(state.minAge, state.maxAge, r[0], r[1])) return false;
  if(state.onlyFree && String(it.cost_ntd||it.price||'').toLowerCase().indexOf('free')===-1) return false;
  if(state.dogOnly && !(it.dogFriendly===true || (it.tags||[]).includes('dog friendly'))) return false;
  if(state.foodOnly && !(it.foodNearby===true || (it.tags||[]).includes('food'))) return false;
  if(state.seasonalOnly && !(it.seasonal===true || (it.tags||[]).includes('seasonal'))) return false;
  return true;
}

function applyFilters(data, state){
  const list = data.filter(it => matchesFilters(it, state));
  if(state.sort === 'name') list.sort(byName);
  else if(state.sort === 'drive') list.sort(byDrive);
  else if(state.sort === 'price') list.sort(byPrice);
  return list;
}

async function main(){
  let data = [];
  try {
    const resp = await fetch('../data/activities.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    data = await resp.json();
  } catch (e) {
    console.error('Failed to load activities.json', e);
    const count = document.getElementById('count');
    count.textContent = "Couldn't load data. Check that /data/activities.json exists at this URL.";
    return;
  }

  const state = {
    q: '',
    io: new Set(),    // SHOW ALL by default
    minAge: 0, maxAge: 12,
    sort: 'name',
    onlyFree: false, dogOnly: false, foodOnly: false, seasonalOnly: false
  };

  // Elements
  const elQ = document.getElementById('q');
  const elIndoor = document.getElementById('indoor');
  const elOutdoor = document.getElementById('outdoor');
  const elMixed = document.getElementById('mixed');
  const elAgeMin = document.getElementById('ageMin');
  const elAgeMax = document.getElementById('ageMax');
  const elSort = document.getElementById('sort');
  const elOnlyFree = document.getElementById('onlyFree');
  const elDogOnly = document.getElementById('dogOnly');
  const elFoodOnly = document.getElementById('foodOnly');
  const elSeasonalOnly = document.getElementById('seasonalOnly');
  const elApply = document.getElementById('applyBtn');
  const elReset = document.getElementById('resetBtn');

  function highlight(){
    const setActive = (el, on)=>{ if(!el) return; if(on) el.classList.add('active'); else el.classList.remove('active'); };
    const chipIndoor = document.querySelector('label.chip [id="indoor"]')?.parentElement;
    const chipOutdoor = document.querySelector('label.chip [id="outdoor"]')?.parentElement;
    const chipMixed = document.querySelector('label.chip [id="mixed"]')?.parentElement;
    setActive(chipIndoor, elIndoor.checked);
    setActive(chipOutdoor, elOutdoor.checked);
    setActive(chipMixed, elMixed.checked);
    const fSearch = document.getElementById('q').closest('.field');
    const fAgeMin = document.getElementById('ageMin').closest('.field');
    const fAgeMax = document.getElementById('ageMax').closest('.field');
    const fSort = document.getElementById('sort').closest('.field');
    setActive(fSearch, elQ.value.trim() !== '');
    setActive(fAgeMin, (parseInt(elAgeMin.value)||0) !== 0);
    setActive(fAgeMax, (parseInt(elAgeMax.value)||18) !== 12);
    setActive(fSort, elSort.value !== 'name');
    const quickField = document.getElementById('seasonalOnly').closest('.field');
    const anyQuick = elOnlyFree.checked || elDogOnly.checked || elFoodOnly.checked || elSeasonalOnly.checked;
    setActive(quickField, anyQuick);
  }

  function syncAndRender(){
    highlight();
    const list = applyFilters(data, state);
    renderList(list);
  }

  // Listeners
  elQ.addEventListener('input', () => { state.q = elQ.value.trim().toLowerCase(); syncAndRender(); });
  elIndoor.addEventListener('change', () => { elIndoor.checked ? state.io.add('Indoor') : state.io.delete('Indoor'); syncAndRender(); });
  elOutdoor.addEventListener('change', () => { elOutdoor.checked ? state.io.add('Outdoor') : state.io.delete('Outdoor'); syncAndRender(); });
  elMixed.addEventListener('change', () => { elMixed.checked ? state.io.add('Mixed') : state.io.delete('Mixed'); syncAndRender(); });
  elAgeMin.addEventListener('change', () => { state.minAge = parseInt(elAgeMin.value)||0; syncAndRender(); });
  elAgeMax.addEventListener('change', () => { state.maxAge = parseInt(elAgeMax.value)||18; syncAndRender(); });
  elSort.addEventListener('change', () => { state.sort = elSort.value; syncAndRender(); });
  elOnlyFree.addEventListener('change', () => { state.onlyFree = elOnlyFree.checked; syncAndRender(); });
  elDogOnly.addEventListener('change', () => { state.dogOnly = elDogOnly.checked; syncAndRender(); });
  elFoodOnly.addEventListener('change', () => { state.foodOnly = elFoodOnly.checked; syncAndRender(); });
  elSeasonalOnly.addEventListener('change', () => { state.seasonalOnly = elSeasonalOnly.checked; syncAndRender(); });

  if(elApply) elApply.addEventListener('click', syncAndRender);
  if(elReset) elReset.addEventListener('click', () => {
    state.q=''; state.io=new Set(); state.minAge=0; state.maxAge=12;
    state.sort='name'; state.onlyFree=false; state.dogOnly=false; state.foodOnly=false; state.seasonalOnly=false;
    elQ.value=''; elIndoor.checked=false; elOutdoor.checked=false; elMixed.checked=false;
    elAgeMin.value=0; elAgeMax.value=12; elSort.value='name';
    elOnlyFree.checked=false; elDogOnly.checked=false; elFoodOnly.checked=false; elSeasonalOnly.checked=false;
    syncAndRender();
  });

  // First render (show all)
  syncAndRender();
}

window.addEventListener('DOMContentLoaded', main);
