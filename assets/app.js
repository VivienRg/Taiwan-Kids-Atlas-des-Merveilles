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
    const activityGrid = document.getElementById('activityGrid');
    if (!activityGrid) return;
    
    // Clear existing cards but keep the skeleton loader
    const skeleton = activityGrid.querySelector('.skeleton-card');
    activityGrid.innerHTML = '';
    if (skeleton) activityGrid.appendChild(skeleton);
    
    if (!list.length) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3m3-2h6v4H8V5Zm6 5h6m-6 4h6m-6 4h6"/>
        </svg>
        <p>No activities found matching your filters.</p>
        <button class="btn btn-text" id="reset-filters">Reset all filters</button>
      `;
      activityGrid.appendChild(noResults);
      return;
    }

    list.forEach(activity => {
      const card = document.createElement('article');
      card.className = 'activity-card';
      
      // Create card image with badge
      const cardImage = document.createElement('div');
      cardImage.className = 'card-image';
      cardImage.style.backgroundImage = `url('${mapThumbURL(activity)}')`;
      
      // Add category badge
      const categoryBadge = document.createElement('span');
      categoryBadge.className = 'card-badge';
      categoryBadge.textContent = activity.categories?.[0] || 'Activity';
      cardImage.appendChild(categoryBadge);
      
      // Add indoor/outdoor indicator
      if (activity.indoor_outdoor) {
        const ioBadge = document.createElement('span');
        ioBadge.className = 'card-io-badge';
        ioBadge.textContent = activity.indoor_outdoor;
        cardImage.appendChild(ioBadge);
      }
      
      // Create card content
      const cardContent = document.createElement('div');
      cardContent.className = 'card-content';
      
      // Title
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = activity.name || 'Unnamed Activity';
      cardContent.appendChild(title);
      
      // Location
      const location = document.createElement('div');
      location.className = 'card-location';
      location.innerHTML = `
        <svg class="location-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor"/>
        </svg>
        <span>${[activity.district, activity.city].filter(Boolean).join(', ')}</span>
      `;
      cardContent.appendChild(location);
      
      // Meta info (age, price, etc.)
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      
      // Age range
      if (activity.age_range) {
        const ageItem = document.createElement('div');
        ageItem.className = 'meta-item';
        ageItem.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM13 7H11V13H17V11H13V7Z" fill="currentColor"/>
          </svg>
          <span>${activity.age_range[0]}-${activity.age_range[1]} yrs</span>
        `;
        meta.appendChild(ageItem);
      }
      
      // Price
      if (activity.cost_range) {
        const priceItem = document.createElement('div');
        priceItem.className = 'meta-item';
        priceItem.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.8 10.9C9.53 10.31 8.8 9.7 8.8 8.75C8.8 7.66 9.81 6.9 11.5 6.9C13.28 6.9 13.94 7.75 14 9H16.21C16.14 7.28 15.09 5.7 13 5.19V3H10V5.16C8.06 5.58 6.5 6.84 6.5 8.77C6.5 11.08 8.41 12.23 11.2 12.9C13.7 13.5 14.2 14.38 14.2 15.31C14.2 16 13.71 17.1 11.5 17.1C9.45 17.1 8.7 16.2 8.5 15H6.32C6.5 17.19 8.17 18.42 10 18.83V21H13V18.85C14.95 18.48 16.5 17.35 16.5 15.3C16.5 12.46 14.07 11.5 11.8 10.9Z" fill="currentColor"/>
          </svg>
          <span>${activity.cost_range === '0' ? 'Free' : 'NT$' + activity.cost_range}</span>
        `;
        meta.appendChild(priceItem);
      }
      
      // Drive time
      if (activity.drive_min != null) {
        const driveItem = document.createElement('div');
        driveItem.className = 'meta-item';
        driveItem.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H15V3H9V5H6.5C5.84 5 5.29 5.42 5.08 6.01L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6.01ZM6.85 7H17.14L18.22 10H5.77L6.85 7ZM19 17H5V12H19V17Z" fill="currentColor"/>
            <path d="M7.5 16C8.32843 16 9 15.3284 9 14.5C9 13.6716 8.32843 13 7.5 13C6.67157 13 6 13.6716 6 14.5C6 15.3284 6.67157 16 7.5 16Z" fill="currentColor"/>
            <path d="M16.5 16C17.3284 16 18 15.3284 18 14.5C18 13.6716 17.3284 13 16.5 13C15.6716 13 15 13.6716 15 14.5C15 15.3284 15.6716 16 16.5 16Z" fill="currentColor"/>
          </svg>
          <span>${activity.drive_min} min drive</span>
        `;
        meta.appendChild(driveItem);
      }
      
      cardContent.appendChild(meta);
      
      // Description (truncated)
      if (activity.desc) {
        const desc = document.createElement('p');
        desc.className = 'card-desc';
        desc.textContent = activity.desc.length > 100 ? activity.desc.substring(0, 100) + '...' : activity.desc;
        cardContent.appendChild(desc);
      }
      
      // Tags
      if (activity.tags && activity.tags.length) {
        const tags = document.createElement('div');
        tags.className = 'card-tags';
        activity.tags.slice(0, 3).forEach(tag => {
          const tagEl = document.createElement('span');
          tagEl.className = 'tag';
          tagEl.textContent = tag;
          tags.appendChild(tagEl);
        });
        if (activity.tags.length > 3) {
          const moreTag = document.createElement('span');
          moreTag.className = 'tag';
          moreTag.textContent = `+${activity.tags.length - 3} more`;
          tags.appendChild(moreTag);
        }
        cardContent.appendChild(tags);
      }
      
      // Action buttons
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      
      // Map link
      const mapLink = document.createElement('a');
      mapLink.href = activity.map_link || `https://www.google.com/maps?q=${encodeURIComponent(activity.address_query || activity.name || '')}`;
      mapLink.className = 'btn btn-outline';
      mapLink.target = '_blank';
      mapLink.rel = 'noopener';
      mapLink.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor"/>
        </svg>
        View on Map
      `;
      actions.appendChild(mapLink);
      
      // Website link (if available)
      if (activity.website) {
        const websiteLink = document.createElement('a');
        websiteLink.href = activity.website;
        websiteLink.className = 'btn btn-text';
        websiteLink.target = '_blank';
        websiteLink.rel = 'noopener';
        websiteLink.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.9 12C3.9 10.29 5.29 8.9 7 8.9H11V7H7C4.24 7 2 9.24 2 12C2 14.76 4.24 17 7 17H11V15.1H7C5.29 15.1 3.9 13.71 3.9 12ZM8 13H16V11H8V13ZM17 7H13V8.9H17C18.71 8.9 20.1 10.29 20.1 12C20.1 13.71 18.71 15.1 17 15.1H13V17H17C19.76 17 22 14.76 22 12C22 9.24 19.76 7 17 7Z" fill="currentColor"/>
          </svg>
          Website
        `;
        actions.appendChild(websiteLink);
      }
      
      cardContent.appendChild(actions);
      
      // Assemble the card
      card.appendChild(cardImage);
      card.appendChild(cardContent);
      
      // Add to grid
      activityGrid.appendChild(card);
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

  function matchesFilters(it, state) {
    // Search in relevant text fields
    const searchText = [
      it.name, 
      it.desc || '', 
      (it.tags || []).join(' '), 
      (it.categories || []).join(' '), 
      it.district || '', 
      it.city || '', 
      it.region || '', 
      it.cost_range || ''
    ].join(' ').toLowerCase();
    
    // Text search
    if (state.q && !searchText.includes(state.q)) return false;
    
    // Category filter
    if (state.category && !(it.categories || []).includes(state.category)) return false;
    
    // Region filter
    if (state.region && String(it.region || '') !== state.region) return false;
    
    // Age range filter
    const ageRange = it.age_range || [0, 18];
    if (!overlap(state.minAge, state.maxAge, ageRange[0], ageRange[1])) return false;
    
    // Price range filter
    if (state.priceRange.size > 0) {
      const price = priceValFromRange(it.cost_range);
      let priceMatch = false;
      
      state.priceRange.forEach(range => {
        if (range === 'free' && it.cost_range === '0') priceMatch = true;
        if (range === 'low' && price > 0 && price <= 200) priceMatch = true;
        if (range === 'medium' && price > 200 && price <= 600) priceMatch = true;
        if (range === 'high' && price > 600) priceMatch = true;
      });
      
      if (!priceMatch) return false;
    }
    
    // Feature filters
    if (state.features.size > 0) {
      const tags = new Set(it.tags || []);
      for (const feature of state.features) {
        if (feature === 'dog' && !tags.has('dog friendly')) return false;
        if (feature === 'food' && !tags.has('food')) return false;
        if (feature === 'stroller' && !tags.has('stroller friendly')) return false;
        if (feature === 'indoor' && it.indoor_outdoor !== 'Indoor') return false;
        if (feature === 'seasonal' && !tags.has('seasonal')) return false;
      }
    }
    
    return true;
  }

  function applyFilters(data, state){
    const list = data.filter(it => matchesFilters(it, state));
    if (state.sort === 'name-asc') list.sort(byName);
    else if (state.sort === 'name-desc') list.sort((a,b)=>byName(b,a));
    else if (state.sort === 'drive') list.sort(byDrive);
    else if (state.sort === 'price') list.sort(byPrice);
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
      document.getElementById('resultCount').textContent = "Couldn't load activities. Please try again later.";
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
    const elQ = document.getElementById('search-input');
    const elCategory = document.getElementById('category');
    const elRegion = document.getElementById('region');
    const elAgeMin = document.getElementById('age-min');
    const elAgeMax = document.getElementById('age-max');
    const elSort = document.getElementById('sort-select');
    const elPriceFree = document.getElementById('price-free');
    const elPriceLow = document.getElementById('price-low');
    const elPriceMedium = document.getElementById('price-medium');
    const elPriceHigh = document.getElementById('price-high');
    const elDogFriendly = document.getElementById('feature-dog-friendly');
    const elFoodNearby = document.getElementById('feature-food');
    const elStrollerFriendly = document.getElementById('feature-stroller');
    const elIndoor = document.getElementById('feature-indoor');
    const elSeasonal = document.getElementById('feature-seasonal');
    const elApply = document.getElementById('apply-filters');
    const elReset = document.getElementById('reset-filters');
    const elFilterToggle = document.getElementById('mobile-filter-toggle');
    const elFilterClose = document.querySelector('.filter-close');
    const elFiltersSidebar = document.querySelector('.filters-sidebar');

    // Populate selects
    // Clear existing dynamic options (keep the first placeholder option)
    if (elCategory) {
      while (elCategory.options && elCategory.options.length > 1) {
        elCategory.remove(elCategory.options.length - 1);
      }
    }
    if (elRegion) {
      while (elRegion.options && elRegion.options.length > 1) {
        elRegion.remove(elRegion.options.length - 1);
      }
    }
    const categories = uniqueCategories(data);
    categories.forEach(c => {
      const opt = document.createElement('option'); 
      opt.value = c; 
      opt.textContent = c; 
      elCategory.appendChild(opt);
    });
    
    const regions = uniqueRegions(data);
    regions.forEach(r => {
      const opt = document.createElement('option'); 
      opt.value = r; 
      opt.textContent = r; 
      elRegion.appendChild(opt);
    });

    // Default state - all filters off
    const state = {
      q: '',
      category: '',
      region: '',
      minAge: 0, 
      maxAge: 18,
      sort: 'relevance',
      priceRange: new Set(),
      features: new Set()
    };

    // Ensure UI controls reflect default (all filters off) on first load
    if (elQ) elQ.value = '';
    if (elCategory) elCategory.value = '';
    if (elRegion) elRegion.value = '';
    if (elAgeMin) elAgeMin.value = 0;
    if (elAgeMax) elAgeMax.value = 18;
    if (elSort) elSort.value = 'relevance';
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });

    function updateFilterUI() {
      // Update active state of filter sections
      const setSectionActive = (section, isActive) => {
        const sectionEl = document.querySelector(`.filter-section[data-section="${section}"]`);
        if (sectionEl) {
          sectionEl.classList.toggle('has-active-filters', isActive);
        }
      };

      // Check if any filters are active
      const hasActiveFilters = 
        state.q || 
        state.category || 
        state.region || 
        state.minAge > 0 || 
        state.maxAge < 18 || 
        state.priceRange.size > 0 || 
        state.features.size > 0;

      // Update filter toggle badge
      const filterBadge = document.querySelector('.filter-toggle-badge');
      if (filterBadge) {
        filterBadge.style.display = hasActiveFilters ? 'flex' : 'none';
      }
    }

    function syncAndRender() {
      updateFilterUI();
      renderList(applyFilters(data, state));
      
      // Update results count
      const count = document.querySelectorAll('.activity-card').length;
      document.getElementById('resultCount').textContent = count;
    }

    // Toggle mobile filters
    if (elFilterToggle) {
      elFilterToggle.addEventListener('click', () => {
        document.body.classList.add('filters-visible');
      });
    }

    if (elFilterClose) {
      elFilterClose.addEventListener('click', () => {
        document.body.classList.remove('filters-visible');
      });
    }

    // Event listeners for filters
    if (elQ) elQ.addEventListener('input', debounce(() => { 
      state.q = elQ.value.trim().toLowerCase();
      syncAndRender();
    }, 300));

    if (elCategory) elCategory.addEventListener('change', () => { 
      state.category = elCategory.value || ''; 
      syncAndRender(); 
    });

    if (elRegion) elRegion.addEventListener('change', () => { 
      state.region = elRegion.value || ''; 
      syncAndRender(); 
    });

    // Price range filters
    [elPriceFree, elPriceLow, elPriceMedium, elPriceHigh].forEach((el, index) => {
      if (!el) return;
      const priceRanges = ['free', 'low', 'medium', 'high'];
      el.addEventListener('change', () => {
        if (el.checked) {
          state.priceRange.add(priceRanges[index]);
        } else {
          state.priceRange.delete(priceRanges[index]);
        }
        syncAndRender();
      });
    });

    // Feature filters
    const featureMap = {
      'dog': elDogFriendly,
      'food': elFoodNearby,
      'stroller': elStrollerFriendly,
      'indoor': elIndoor,
      'seasonal': elSeasonal
    };

    Object.entries(featureMap).forEach(([feature, el]) => {
      if (!el) return;
      el.addEventListener('change', () => {
        if (el.checked) {
          state.features.add(feature);
        } else {
          state.features.delete(feature);
        }
        syncAndRender();
      });
    });

    // Age range filters
    if (elAgeMin) elAgeMin.addEventListener('change', () => { 
      state.minAge = parseInt(elAgeMin.value) || 0; 
      syncAndRender(); 
    });

    if (elAgeMax) elAgeMax.addEventListener('change', () => { 
      state.maxAge = parseInt(elAgeMax.value) || 18; 
      syncAndRender(); 
    });

    if (elSort) elSort.addEventListener('change', () => { 
      // Map UI values to internal sort keys
      const v = elSort.value;
      if (v === 'name-asc' || v === 'name-desc') state.sort = v; 
      else if (v === 'distance') state.sort = 'drive';
      else if (v === 'price') state.sort = 'price';
      else state.sort = 'relevance';
      syncAndRender(); 
    });

    // Reset filters
    if (elReset) elReset.addEventListener('click', () => {
      // Reset state
      state.q = '';
      state.category = '';
      state.region = '';
      state.minAge = 0;
      state.maxAge = 18;
      state.sort = 'relevance';
      state.priceRange = new Set();
      state.features = new Set();

      // Reset form elements
      if (elQ) elQ.value = '';
      if (elCategory) elCategory.value = '';
      if (elRegion) elRegion.value = '';
      if (elAgeMin) elAgeMin.value = 0;
      if (elAgeMax) elAgeMax.value = 18;
      if (elSort) elSort.value = 'relevance';
      
      // Uncheck all checkboxes
      document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
      });
      
      syncAndRender();
    });

    // Apply filters (for mobile)
    if (elApply) elApply.addEventListener('click', () => {
      document.body.classList.remove('filters-visible');
      syncAndRender();
    });
    
    // Debounce helper function
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // initial render
    syncAndRender();
  }

  window.addEventListener('DOMContentLoaded', main);
})();
