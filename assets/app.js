// assets/app.js — Kid Activities Taiwan (Region + Category + map preview)
(function () {
  // ---- utils ----
  function priceValFromRange(r){
    if(!r) return 1e9;
    const t = String(r);
    if(t === "0") return 0;
    if(t.includes("1–200") || t.includes("1-200")) return 100;
    if(t.includes("200–600") || t.includes("200-600")) return 400;
    if(t.includes("600+")) return 800;
    return 999999;
  }
  function overlap(aMin,aMax,bMin,bMax){ return !(aMax<bMin || bMax<aMin); }
  function byName(a,b){ return String(a.name).localeCompare(String(b.name),'en'); }
  function byDrive(a,b){ return (a.drive_min??999) - (b.drive_min??999); }
  function byPrice(a,b){ return priceValFromRange(a.cost_range) - priceValFromRange(b.cost_range); }

  function pill(text){
    const s = document.createElement('span');
    s.className = 'pill';
    s.textContent = text;
    return s;
  }

  // thumbnails & embeds
  function mapsEmbedURL(q){
    const base = 'https://www.google.com/maps';
    return base + `?q=${encodeURIComponent(q)}&output=embed`;
  }
  function mapThumbURL(activity) {
    // Return path to local thumbnail if activity has an ID
    if (activity && activity.id) {
      return `./thumbnails/${activity.id}.png`;
    }
    // Fallback to the old behavior if no ID is available (for backward compatibility)
    const q = activity.address_query || [activity.name, activity.district, activity.city, activity.region, 'Taiwan'].filter(Boolean).join(', ');
    return fallbackThumb(activity.name || q);
  }
  function fallbackThumb(name){
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
         <rect width='100%' height='100%' fill='#0f172a'/>
         <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle'
               fill='#9fb1c7' font-family='Inter,Arial,sans-serif' font-size='20'>
           ${(name||'Activity')}
         </text>
       </svg>`
    );
    return `data:image/svg+xml;charset=utf-8,${svg}`;
  }

  // ---- rendering ----
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

      // Thumbnail (click -> map embed)
      const img = document.createElement('img');
      img.className = 'thumb';
      const q = it.address_query || [it.name, it.district, it.city, it.region, 'Taiwan'].filter(Boolean).join(', ');
      img.src = `./thumbnails/${it.id}.png`;
      img.alt = (it.name || '') + ' map';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.src = fallbackThumb(it.name); };
      img.style.cursor = 'pointer';
      img.title = 'Click to preview map';
      img.addEventListener('click', () => {
        const wrap = document.createElement('div');
        wrap.style.width = '100%'; wrap.style.height = '180px'; wrap.style.background = '#0f172a';
        const iframe = document.createElement('iframe');
        iframe.src = mapsEmbedURL(q);
        iframe.width = '100%'; iframe.height = '180'; iframe.style.border = '0';
        iframe.loading = 'lazy'; iframe.referrerPolicy = 'no-referrer';
        wrap.appendChild(iframe);
        card.replaceChild(wrap, img);
      });
      card.appendChild(img);

      const body = document.createElement('div');
      body.className = 'card-body';

      const h = document.createElement('h3');
      h.textContent = it.name || '';
      body.appendChild(h);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.appendChild(pill(it.indoor_outdoor || ''));
      meta.appendChild(pill((it.categories||[]).join(', ')));
      meta.appendChild(pill('Drive: ' + (it.drive_min!=null ? (it.drive_min + ' min') : '—')));
      const age = (it.age_range ? (it.age_range[0]+'–'+it.age_range[1]) : '0–18');
      meta.appendChild(pill('Ages: ' + age));
      meta.appendChild(pill('Price: ' + (it.cost_range || '—')));
      meta.appendChild(pill([it.district, it.city].filter(Boolean).join(' • ')));
      body.appendChild(meta);

      if(it.desc){
        const p = document.createElement('p');
        p.className = 'desc';
        p.textContent = it.desc;
        body.appendChild(p);
      }

      if(it.tags && it.tags.length){
        const tagMeta = document.createElement('div');
        tagMeta.className = 'meta';
        it.tags.forEach(t => tagMeta.appendChild(pill('#' + t)));
        body.appendChild(tagMeta);
      }

      if(it.address_en){
        const addr = document.createElement('div');
        addr.className = 'address';
        addr.textContent = it.address_en;
        body.appendChild(addr);
      }

      const links = document.createElement('div');
      links.className = 'links';
      const m = document.createElement('a');
      m.href = it.map_link || ('https://www.google.com/maps?q=' + encodeURIComponent(it.address_query || it.name || ''));
      m.textContent = '🗺️ Open in Maps';
      m.target = '_blank'; m.rel = 'noopener';
      links.appendChild(m);
      if(it.website){
        const w = document.createElement('a');
        w.href = it.website; w.textContent = '🌐 Website';
        w.target = '_blank'; w.rel = 'noopener';
        links.appendChild(w);
      }
      body.appendChild(links);

      card.appendChild(body);
      cards.appendChild(card);
    });
  }

  // ---- filtering ----
  function uniqueRegions(data){
    const set = new Set();
    data.forEach(it => it.region && set.add(it.region));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'en'));
  }
  function uniqueCategories(data){
    const set = new Set();
    data.forEach(it => (it.categories||[]).forEach(c => set.add(c)));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'en'));
  }

  function matchesFilters(it, state){
    const blob = [it.name, it.desc||'', (it.tags||[]).join(' '), (it.categories||[]).join(' '), it.district||'', it.city||'', it.region||'', it.cost_range||''].join(' ').toLowerCase();
    if(state.q && !blob.includes(state.q)) return false;
    if(state.category && !(it.categories||[]).includes(state.category)) return false;
    if(state.region && String(it.region||'') !== state.region) return false;
    const ioVal = it.indoor_outdoor || '';
    if(state.io.size && !state.io.has(ioVal)) return false;
    const r = it.age_range || [0,18];
    if(!overlap(state.minAge, state.maxAge, r[0], r[1])) return false;
    if(state.onlyFree && (it.cost_range !== '0')) return false;
    if(state.dogOnly && !(it.tags||[]).includes('dog friendly')) return false;
    if(state.foodOnly && !(it.tags||[]).includes('food')) return false;
    if(state.seasonalOnly && !(it.tags||[]).includes('seasonal')) return false;
    return true;
  }

  function applyFilters(data, state){
    const list = data.filter(it => matchesFilters(it, state));
    if(state.sort === 'name') list.sort(byName);
    else if(state.sort === 'drive') list.sort(byDrive);
    else if(state.sort === 'price') list.sort(byPrice);
    return list;
  }

  // ---- main ----
  async function main(){
    let data = [];
    try {
      const resp = await fetch('./data/activities.json', {cache:'no-store'});
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      data = await resp.json();
    } catch (e) {
      console.error('Failed to load /data/activities.json', e);
      document.getElementById('count').textContent = "Couldn't load data. Ensure /data/activities.json exists (case-sensitive).";
      return;
    }

    // add address_en if missing
    data.forEach(it => {
      if(!it.address_en){
        const parts = [it.district, it.city, it.region].filter(Boolean);
        it.address_en = parts.join(', ');
      }
    });

    // Elements
    const elQ = document.getElementById('q');
    const elCategory = document.getElementById('category');
    const elRegion = document.getElementById('region');
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

    // Populate selects
    uniqueCategories(data).forEach(c => {
      const opt = document.createElement('option'); opt.value=c; opt.textContent=c; elCategory.appendChild(opt);
    });
    uniqueRegions(data).forEach(r => {
      const opt = document.createElement('option'); opt.value=r; opt.textContent=r; elRegion.appendChild(opt);
    });

    // Default state — show ALL; age = 0–18
    const state = {
      q: '',
      category: '',
      region: '',
      io: new Set(),      // none checked == all
      minAge: 0, maxAge: 18,
      sort: 'name',
      onlyFree: false, dogOnly: false, foodOnly: false, seasonalOnly: false
    };

    function highlight(){
      const setActive = (el, on)=>{ if(!el) return; el.classList.toggle('active', !!on); };
      const chipIndoor = document.querySelector('label.chip [id="indoor"]')?.parentElement;
      const chipOutdoor = document.querySelector('label.chip [id="outdoor"]')?.parentElement;
      const chipMixed = document.querySelector('label.chip [id="mixed"]')?.parentElement;
      setActive(chipIndoor, elIndoor.checked);
      setActive(chipOutdoor, elOutdoor.checked);
      setActive(chipMixed, elMixed.checked);
      const fSearch = elQ.closest('.field'); setActive(fSearch, elQ.value.trim() !== '' || elCategory.value !== '' || elRegion.value !== '');
      const fAgeMin = elAgeMin.closest('.field'); setActive(fAgeMin, (parseInt(elAgeMin.value)||0) !== 0);
      const fAgeMax = elAgeMax.closest('.field'); setActive(fAgeMax, (parseInt(elAgeMax.value)||18) !== 18);
      const fSort = elSort.closest('.field'); setActive(fSort, elSort.value !== 'name');
      const quickField = elSeasonalOnly.closest('.field'); const anyQuick = elOnlyFree.checked || elDogOnly.checked || elFoodOnly.checked || elSeasonalOnly.checked;
      setActive(quickField, anyQuick);
    }

    function syncAndRender(){
      highlight();
      renderList(applyFilters(data, state));
    }

    // listeners
    elQ.addEventListener('input', () => { state.q = elQ.value.trim().toLowerCase(); syncAndRender(); });
    elCategory.addEventListener('change', () => { state.category = elCategory.value || ''; syncAndRender(); });
    elRegion.addEventListener('change', () => { state.region = elRegion.value || ''; syncAndRender(); });
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
      state.q=''; state.category=''; state.region=''; state.io=new Set(); state.minAge=0; state.maxAge=18;
      state.sort='name'; state.onlyFree=false; state.dogOnly=false; state.foodOnly=false; state.seasonalOnly=false;
      elQ.value=''; elCategory.value=''; elRegion.value=''; elIndoor.checked=false; elOutdoor.checked=false; elMixed.checked=false;
      elAgeMin.value=0; elAgeMax.value=18; elSort.value='name';
      elOnlyFree.checked=false; elDogOnly.checked=false; elFoodOnly.checked=false; elSeasonalOnly.checked=false;
      syncAndRender();
    });

    // initial render
    syncAndRender();
  }

  window.addEventListener('DOMContentLoaded', main);
})();
