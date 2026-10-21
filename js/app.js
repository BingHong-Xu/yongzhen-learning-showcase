/**
 * 永貞國小學習成果展 - 主互動腳本 (V2 優化改良版)
 * Yongzhen Elementary School Showcase App Logic
 * 100% PII-Free Guaranteed (No Phone, No Email)
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentCategory = 'all';
  let currentSdgFilter = null;
  let currentSearchQuery = '';
  let currentViewMode = 'cards'; // 'cards' | 'timeline' | 'gallery'
  
  // Lightbox State
  let activeActivity = null;
  let activePhotoIndex = 0;
  let isLightboxZoomed = false;

  // DOM Elements
  const activitiesContainer = document.getElementById('activitiesContainer');
  const resultsCountEl = document.getElementById('resultsCount');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const viewBtns = document.querySelectorAll('.view-btn');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  
  // Modals
  const activityModal = document.getElementById('activityModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');
  const piiModal = document.getElementById('piiModal');
  const piiModalCloseBtn = document.getElementById('piiModalCloseBtn');
  const openPiiModalBtns = document.querySelectorAll('.open-pii-modal');
  
  // Lightbox Controls
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxImgWrapper = document.getElementById('lightboxImgWrapper');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxCounter = document.getElementById('lightboxCounter');
  const lightboxPrevBtn = document.getElementById('lightboxPrevBtn');
  const lightboxNextBtn = document.getElementById('lightboxNextBtn');
  const lightboxZoomBtn = document.getElementById('lightboxZoomBtn');
  const lightboxStrip = document.getElementById('lightboxStrip');
  
  // Back to top & Nav links
  const backToTopBtn = document.getElementById('backToTopBtn');
  const navTimelineLink = document.getElementById('navTimelineLink');

  // Verify SHOWCASE_DATA
  if (typeof SHOWCASE_DATA === 'undefined' || !Array.isArray(SHOWCASE_DATA)) {
    console.error('SHOWCASE_DATA is not loaded!');
    activitiesContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #ef4444;">資料庫載入失敗，請檢查 activities-data.js 路徑。</div>';
    return;
  }

  // Initialize
  initStatsCounters();
  renderExhibition();
  setupEventListeners();

  // =========================================================================
  // Filtering & Search Engine
  // =========================================================================
  function getFilteredActivities() {
    return SHOWCASE_DATA.filter(act => {
      // Category match
      let matchCat = (currentCategory === 'all') || 
                     (act.category === currentCategory) || 
                     (act.subCategory === currentCategory);

      // SDG filter match (if clicked from matrix)
      let matchSdg = true;
      if (currentSdgFilter !== null) {
        matchSdg = act.sdgs && act.sdgs.some(s => s.num === currentSdgFilter);
      }

      // Search match
      let matchSearch = true;
      if (currentSearchQuery.trim() !== '') {
        const q = currentSearchQuery.toLowerCase().trim();
        const inTitle = act.title.toLowerCase().includes(q);
        const inSubtitle = act.subtitle.toLowerCase().includes(q);
        const inNarrative = act.narrative.toLowerCase().includes(q);
        const inTeacher = act.teacherQuote.toLowerCase().includes(q);
        const inHonors = act.honors.some(h => h.toLowerCase().includes(q));
        const inPhotos = act.photos.some(p => p.caption.toLowerCase().includes(q) || p.filename.toLowerCase().includes(q));
        matchSearch = inTitle || inSubtitle || inNarrative || inTeacher || inHonors || inPhotos;
      }

      return matchCat && matchSdg && matchSearch;
    });
  }

  function renderExhibition() {
    const filtered = getFilteredActivities();

    // Update count in header
    if (resultsCountEl) {
      const totalPhotosInFiltered = filtered.reduce((s, a) => s + a.photos.length, 0);
      let filterTag = '';
      if (currentSdgFilter) {
        filterTag = ` [SDG ${currentSdgFilter} 專題選取中 - <a href="#" id="clearSdgBtn" style="color:#0284c7;text-decoration:underline;">清除條件</a>]`;
      }
      resultsCountEl.innerHTML = `顯示 <b>${filtered.length}</b> 個精選展區 ｜ 共計 <b>${totalPhotosInFiltered}</b> 張真實活動影像${filterTag}`;
      
      const clearSdgBtn = document.getElementById('clearSdgBtn');
      if (clearSdgBtn) {
        clearSdgBtn.addEventListener('click', (e) => {
          e.preventDefault();
          currentSdgFilter = null;
          renderExhibition();
        });
      }
    }

    if (filtered.length === 0) {
      activitiesContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: #fff; border-radius: 20px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 42px; margin-bottom: 12px;">🔍</div>
          <h3 style="font-size: 1.25rem; color: #0f172a; margin-bottom: 8px; font-weight: 800;">沒有找到符合條件的展區成果</h3>
          <p style="color: #64748b; font-size: 0.92rem; margin-bottom: 20px;">請嘗試更換分類關鍵字或清除搜尋條件。</p>
          <button id="resetFilterBtn" class="btn-pill btn-pill-subtle">重設所有篩選條件</button>
        </div>
      `;
      document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
        currentCategory = 'all';
        currentSdgFilter = null;
        currentSearchQuery = '';
        if (searchInput) searchInput.value = '';
        filterBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
        renderExhibition();
      });
      return;
    }

    if (currentViewMode === 'cards') {
      renderCardsView(filtered);
    } else if (currentViewMode === 'timeline') {
      renderTimelineView(filtered);
    } else if (currentViewMode === 'gallery') {
      renderGalleryWallView(filtered);
    }
  }

  // View Mode 1: Cards Grid
  function renderCardsView(activities) {
    activitiesContainer.className = 'activities-grid';
    
    activitiesContainer.innerHTML = activities.map(act => {
      const catClass = `cat-${act.category}`;
      const isTrophy = act.honors.some(h => h.includes('冠軍') || h.includes('亞軍') || h.includes('季軍'));
      const trophyClass = isTrophy ? 'is-trophy' : '';
      const awardBadge = isTrophy ? `<span class="card-award-ribbon">⭐ 榮耀金盃</span>` : '';

      // SDG Chips with official colors
      const sdgChipsHtml = act.sdgs.map(s => `
        <span class="sdg-chip" data-sdg="${s.num}" style="background-color: ${s.color};" title="點擊依此指標篩選：SDG ${s.num} ${s.name}">
          SDG ${s.num}
        </span>
      `).join('');

      // Mini thumbnails (up to 5 thumbnails)
      const miniThumbsHtml = act.photos.slice(0, 5).map((p, idx) => `
        <img class="mini-thumb" 
             src="${p.url}" 
             alt="${escapeHtml(p.caption)}" 
             title="${escapeHtml(p.caption)}" 
             loading="lazy" 
             data-act-id="${act.id}" 
             data-photo-idx="${idx}" />
      `).join('');

      return `
        <article class="activity-card ${trophyClass}" data-id="${act.id}">
          <div class="card-media-wrapper" data-act-id="${act.id}">
            <img class="card-media-img" src="${act.coverImageUrl}" alt="${escapeHtml(act.title)}" loading="lazy" />
            <div class="card-overlay-badge">
              <span>📅 ${act.dateDisplay}</span>
            </div>
            ${awardBadge}
            <div class="card-photo-count">
              <span>📸 ${act.photos.length} 張紀實</span>
            </div>
          </div>
          
          <div class="card-body">
            <div class="card-category-date">
              <span class="category-tag ${catClass}">${act.categoryName}</span>
              <span class="date-text">${act.academicYear}</span>
            </div>

            <h3 class="card-title" data-act-id="${act.id}">${act.title}</h3>
            <p class="card-subtitle">${act.subtitle}</p>

            <div class="card-sdgs-row">
              ${sdgChipsHtml}
            </div>

            <div class="card-thumbs-strip">
              ${miniThumbsHtml}
            </div>

            <div class="card-actions">
              <span class="card-badge-highlight">${act.badge}</span>
              <button class="btn-card-explore" data-act-id="${act.id}">
                深入展區 <span>→</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach card clicks
    activitiesContainer.querySelectorAll('[data-act-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        // If clicking a mini thumbnail, open lightbox directly at that photo!
        if (el.classList.contains('mini-thumb')) {
          e.stopPropagation();
          const actId = el.dataset.actId;
          const photoIdx = parseInt(el.dataset.photoIdx, 10);
          openLightbox(actId, photoIdx);
          return;
        }

        const actId = el.dataset.actId;
        openActivityModal(actId);
      });
    });

    // Attach SDG chips clicks on cards for interactive filtering
    activitiesContainer.querySelectorAll('.sdg-chip[data-sdg]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const sdgNum = parseInt(chip.dataset.sdg, 10);
        currentSdgFilter = sdgNum;
        currentCategory = 'all';
        filterBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
        renderExhibition();
        document.getElementById('filterToolbar')?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // View Mode 2: Timeline View
  function renderTimelineView(activities) {
    activitiesContainer.className = 'timeline-view';
    
    // Sort chronological: 2020 -> 2024 -> 2025 -> 2026
    const sorted = [...activities].sort((a, b) => a.date.localeCompare(b.date));

    activitiesContainer.innerHTML = sorted.map((act, idx) => {
      const catClass = `cat-${act.category}`;
      const sdgChipsHtml = act.sdgs.map(s => `
        <span class="sdg-chip" style="background-color: ${s.color};">SDG ${s.num}</span>
      `).join('');

      return `
        <div class="timeline-item">
          <div class="timeline-marker">${idx + 1}</div>
          <div class="timeline-card">
            <div class="timeline-header">
              <span class="category-tag ${catClass}">${act.categoryName}</span>
              <span class="timeline-date">${act.dateDisplay}</span>
            </div>
            
            <h3 class="timeline-title" data-act-id="${act.id}">${act.title}</h3>
            <p style="font-size: 0.9rem; color: #334155; margin-bottom: 14px; line-height: 1.6;">${act.subtitle}</p>

            <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 14px; flex-wrap: wrap;">
              <img src="${act.coverImageUrl}" 
                   alt="${escapeHtml(act.title)}" 
                   style="width: 140px; height: 90px; object-fit: cover; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.1);" 
                   data-act-id="${act.id}" />
              <div style="flex: 1; min-width: 220px;">
                <div style="margin-bottom: 10px;">${sdgChipsHtml}</div>
                <div style="font-size: 0.84rem; color: #1e3a8a; font-weight: 700;">✨ ${act.badge}</div>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button class="btn-card-explore" data-act-id="${act.id}">
                探索本場紀實與 ${act.photos.length} 張影像 <span>→</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach clicks
    activitiesContainer.querySelectorAll('[data-act-id]').forEach(el => {
      el.addEventListener('click', () => {
        openActivityModal(el.dataset.actId);
      });
    });
  }

  // View Mode 3: Gallery Wall View (All 113 Photos)
  function renderGalleryWallView(activities) {
    activitiesContainer.className = 'gallery-wall-view';

    // Flatten all photos from current filtered activities
    let allPhotos = [];
    activities.forEach(act => {
      act.photos.forEach((photo, pIdx) => {
        allPhotos.push({
          activity: act,
          photoIndex: pIdx,
          photo: photo
        });
      });
    });

    activitiesContainer.innerHTML = allPhotos.map(item => `
      <div class="gallery-photo-item" data-act-id="${item.activity.id}" data-photo-idx="${item.photoIndex}">
        <span class="gallery-photo-tag">${item.activity.dateDisplay}</span>
        <img src="${item.photo.url}" alt="${escapeHtml(item.photo.caption)}" loading="lazy" />
        <div class="gallery-photo-caption">
          <b>${escapeHtml(item.activity.title)}</b>
          <div style="color: #64748b; font-size: 0.78rem; margin-top: 4px;">${escapeHtml(item.photo.caption)}</div>
        </div>
      </div>
    `).join('');

    // Attach click to open Lightbox
    activitiesContainer.querySelectorAll('.gallery-photo-item').forEach(el => {
      el.addEventListener('click', () => {
        const actId = el.dataset.actId;
        const pIdx = parseInt(el.dataset.photoIdx, 10);
        openLightbox(actId, pIdx);
      });
    });
  }

  // =========================================================================
  // Full Activity Detail Modal
  // =========================================================================
  function openActivityModal(activityId) {
    const act = SHOWCASE_DATA.find(a => a.id === activityId);
    if (!act) return;

    activeActivity = act;

    // Elements inside Modal
    document.getElementById('modalCoverImg').src = act.coverImageUrl;
    document.getElementById('modalCoverImg').alt = act.title;
    document.getElementById('modalDateTag').textContent = `📅 ${act.dateDisplay}（${act.academicYear}）`;
    document.getElementById('modalCategoryTag').textContent = act.categoryName;
    document.getElementById('modalTitle').textContent = act.title;
    document.getElementById('modalSubtitle').textContent = act.subtitle;
    document.getElementById('modalNarrative').textContent = act.narrative;
    document.getElementById('modalTeacherQuote').textContent = act.teacherQuote;
    document.getElementById('modalBadge').textContent = act.badge;

    // Key highlights
    const highlightsList = document.getElementById('modalHighlightsList');
    highlightsList.innerHTML = act.keyTakeaways.map(t => `
      <li><span class="bullet">✔</span> <span>${escapeHtml(t)}</span></li>
    `).join('');

    // Honors
    const honorsList = document.getElementById('modalHonorsList');
    honorsList.innerHTML = act.honors.map(h => `
      <div class="honor-badge-item">
        <span>🏅</span> <span>${escapeHtml(h)}</span>
      </div>
    `).join('');

    // SDGs
    const sdgsList = document.getElementById('modalSdgsList');
    sdgsList.innerHTML = act.sdgs.map(s => `
      <div class="sdg-row-badge" style="background-color: ${s.color};">
        <span>SDG ${s.num}</span> <span>${escapeHtml(s.name)}</span>
      </div>
    `).join('');

    // Competencies
    const compList = document.getElementById('modalCompetenciesList');
    compList.innerHTML = act.competencies.map(c => `
      <span class="btn-pill btn-pill-subtle" style="font-size: 0.78rem;"># ${escapeHtml(c)}</span>
    `).join(' ');

    // Photos Grid inside Modal
    const photosGrid = document.getElementById('modalPhotosGrid');
    document.getElementById('modalPhotoCount').textContent = `(${act.photos.length} 張完整現場相片)`;
    photosGrid.innerHTML = act.photos.map((p, idx) => `
      <div class="modal-photo-item" data-photo-idx="${idx}" title="${escapeHtml(p.caption)}">
        <img src="${p.url}" alt="${escapeHtml(p.caption)}" loading="lazy" />
      </div>
    `).join('');

    // Click on photo in modal opens Lightbox!
    photosGrid.querySelectorAll('.modal-photo-item').forEach(el => {
      el.addEventListener('click', () => {
        const pIdx = parseInt(el.dataset.photoIdx, 10);
        openLightbox(act.id, pIdx);
      });
    });

    // Show modal
    activityModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeActivityModal() {
    activityModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // =========================================================================
  // Full-Screen Lightbox View
  // =========================================================================
  function openLightbox(activityId, photoIndex = 0) {
    const act = SHOWCASE_DATA.find(a => a.id === activityId);
    if (!act || !act.photos || act.photos.length === 0) return;

    activeActivity = act;
    activePhotoIndex = photoIndex;
    isLightboxZoomed = false;
    lightboxImgWrapper.classList.remove('zoomed');

    updateLightboxContent();

    lightboxModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightboxModal.classList.remove('open');
    if (!activityModal.classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  function updateLightboxContent() {
    if (!activeActivity) return;

    const currentPhoto = activeActivity.photos[activePhotoIndex];
    if (!currentPhoto) return;

    lightboxImg.src = currentPhoto.url;
    lightboxImg.alt = currentPhoto.caption;
    lightboxCaption.innerHTML = `<b>${escapeHtml(activeActivity.title)}</b> ｜ ${escapeHtml(currentPhoto.caption)} (${activeActivity.dateDisplay})`;
    lightboxCounter.textContent = `第 ${activePhotoIndex + 1} / ${activeActivity.photos.length} 張`;

    // Render thumbnail strip
    lightboxStrip.innerHTML = activeActivity.photos.map((p, idx) => `
      <img class="lightbox-strip-thumb ${idx === activePhotoIndex ? 'active' : ''}" 
           src="${p.url}" 
           alt="縮圖" 
           data-idx="${idx}" />
    `).join('');

    lightboxStrip.querySelectorAll('.lightbox-strip-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        activePhotoIndex = parseInt(thumb.dataset.idx, 10);
        updateLightboxContent();
      });
    });
  }

  function nextPhoto() {
    if (!activeActivity) return;
    activePhotoIndex = (activePhotoIndex + 1) % activeActivity.photos.length;
    updateLightboxContent();
  }

  function prevPhoto() {
    if (!activeActivity) return;
    activePhotoIndex = (activePhotoIndex - 1 + activeActivity.photos.length) % activeActivity.photos.length;
    updateLightboxContent();
  }

  function toggleZoom() {
    isLightboxZoomed = !isLightboxZoomed;
    lightboxImgWrapper.classList.toggle('zoomed', isLightboxZoomed);
  }

  // =========================================================================
  // Event Listeners
  // =========================================================================
  function setupEventListeners() {
    // Trophy Spotlight Card clicks
    document.querySelectorAll('.trophy-card[data-act-id]').forEach(card => {
      card.addEventListener('click', () => {
        const actId = card.dataset.actId;
        openActivityModal(actId);
      });
    });

    // Nav Timeline Link
    navTimelineLink?.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('[data-view="timeline"]')?.click();
      document.getElementById('filterToolbar')?.scrollIntoView({ behavior: 'smooth' });
    });

    // Mobile Menu Toggle & Drawer
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileNavDrawer = document.getElementById('mobileNavDrawer');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    const mobileCatChips = document.querySelectorAll('.mobile-cat-chip');
    const mobileNavTimelineLink = document.getElementById('mobileNavTimelineLink');

    function toggleMobileMenu(forceState) {
      if (!mobileNavDrawer || !mobileMenuBtn) return;
      const isOpen = forceState !== undefined ? forceState : !mobileNavDrawer.classList.contains('open');
      mobileNavDrawer.classList.toggle('open', isOpen);
      mobileMenuBtn.classList.toggle('active', isOpen);
      mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
      mobileNavDrawer.setAttribute('aria-hidden', String(!isOpen));
    }

    mobileMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileMenu();
    });

    mobileNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        toggleMobileMenu(false);
      });
    });

    mobileNavTimelineLink?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleMobileMenu(false);
      document.querySelector('[data-view="timeline"]')?.click();
      document.getElementById('filterToolbar')?.scrollIntoView({ behavior: 'smooth' });
    });

    mobileCatChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.cat;
        mobileCatChips.forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
        const matchingBtn = document.querySelector(`.filter-btn[data-cat="${cat}"]`);
        if (matchingBtn) matchingBtn.click();
        toggleMobileMenu(false);
        document.getElementById('filterToolbar')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Close mobile menu if clicked outside
    document.addEventListener('click', (e) => {
      if (mobileNavDrawer && mobileNavDrawer.classList.contains('open')) {
        if (!mobileNavDrawer.contains(e.target) && !mobileMenuBtn?.contains(e.target)) {
          toggleMobileMenu(false);
        }
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900 && mobileNavDrawer?.classList.contains('open')) {
        toggleMobileMenu(false);
      }
    });

    // Category Filter Buttons
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.cat;
        currentSdgFilter = null; // reset SDG matrix filter
        renderExhibition();
      });
    });

    // View Mode Toggle
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentViewMode = btn.dataset.view;
        renderExhibition();
      });
    });

    // Search input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value;
        if (clearSearchBtn) {
          clearSearchBtn.style.display = currentSearchQuery ? 'block' : 'none';
        }
        renderExhibition();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderExhibition();
      });
    }

    // Modal Close
    modalCloseBtn?.addEventListener('click', closeActivityModal);
    activityModal?.addEventListener('click', (e) => {
      if (e.target === activityModal) closeActivityModal();
    });

    // Lightbox Controls
    lightboxCloseBtn?.addEventListener('click', closeLightbox);
    lightboxNextBtn?.addEventListener('click', nextPhoto);
    lightboxPrevBtn?.addEventListener('click', prevPhoto);
    lightboxZoomBtn?.addEventListener('click', toggleZoom);
    lightboxModal?.addEventListener('click', (e) => {
      if (e.target === lightboxModal || e.target === document.querySelector('.lightbox-main')) {
        closeLightbox();
      }
    });

    // Lightbox Touch Swipe Support for Mobile & Tablets
    let touchStartX = 0;
    let touchStartY = 0;

    lightboxModal?.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    lightboxModal?.addEventListener('touchend', (e) => {
      if (!isLightboxZoomed && e.changedTouches && e.changedTouches.length === 1) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Ensure horizontal swipe is dominant and exceeds 45px threshold
        if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
          if (diffX < 0) {
            nextPhoto();
          } else {
            prevPhoto();
          }
        }
      }
    }, { passive: true });

    // PII Modal
    openPiiModalBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        piiModal.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });
    piiModalCloseBtn?.addEventListener('click', () => {
      piiModal.classList.remove('open');
      document.body.style.overflow = '';
    });
    piiModal?.addEventListener('click', (e) => {
      if (e.target === piiModal) {
        piiModal.classList.remove('open');
        document.body.style.overflow = '';
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (lightboxModal.classList.contains('open')) {
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft') prevPhoto();
        if (e.key === 'Escape') closeLightbox();
      } else if (activityModal.classList.contains('open')) {
        if (e.key === 'Escape') closeActivityModal();
      } else if (piiModal.classList.contains('open')) {
        if (e.key === 'Escape') piiModal.classList.remove('open');
      }
    });

    // Back to top
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
        backToTopBtn?.classList.add('show');
      } else {
        backToTopBtn?.classList.remove('show');
      }
    });

    backToTopBtn?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // SDGs Matrix Card Click
    document.querySelectorAll('.sdg-matrix-card').forEach(card => {
      card.addEventListener('click', () => {
        const sdgNum = parseInt(card.dataset.sdg, 10);
        currentSdgFilter = sdgNum;
        currentCategory = 'all';
        filterBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
        renderExhibition();
        
        // Smooth scroll to exhibition
        document.getElementById('filterToolbar')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Google Sites iframe embed check & Open Fullscreen button
    const isInsideIframe = window.self !== window.top;
    const openFullscreenBtn = document.getElementById('openFullscreenBtn');
    if (isInsideIframe && openFullscreenBtn) {
      openFullscreenBtn.style.display = 'inline-flex';
      openFullscreenBtn.addEventListener('click', () => {
        window.open(window.location.href, '_blank', 'noopener,noreferrer');
      });
      document.body.classList.add('is-embedded-iframe');
    }

    // Toast Notification helper
    let toastTimeout = null;
    function showToast(msg) {
      const toast = document.getElementById('toastNotice');
      const toastText = document.getElementById('toastText');
      if (!toast || !toastText) return;
      toastText.textContent = msg;
      toast.classList.add('show');
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 2800);
    }

    // Share & Google Sites Embed Code buttons
    const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
    copyShareUrlBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('✅ 已複製本展分享連結！');
      } catch (err) {
        showToast('🔗 分享網址：' + window.location.href);
      }
    });

    const copyEmbedCodeBtn = document.getElementById('copyEmbedCodeBtn');
    copyEmbedCodeBtn?.addEventListener('click', async () => {
      const currentUrl = window.location.href.split('#')[0];
      const embedCode = `<iframe src="${currentUrl}" width="100%" height="900" style="border:none;border-radius:12px;overflow:hidden;" allow="fullscreen" loading="lazy"></iframe>`;
      try {
        await navigator.clipboard.writeText(embedCode);
        showToast('✅ 已複製 Google Sites 嵌入語法！');
      } catch (err) {
        showToast('🌐 嵌入語法已準備好！');
      }
    });
  }

  // Animated Numbers Counter
  function initStatsCounters() {
    const statElements = document.querySelectorAll('.counter-val');
    statElements.forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      let current = 0;
      const duration = 500;
      const startTime = performance.now();

      function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const easeOut = 1 - (1 - progress) * (1 - progress);
        current = Math.floor(easeOut * target);
        el.textContent = current;
        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          el.textContent = target;
        }
      }
      requestAnimationFrame(update);
    });
  }

  // Helper
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }
});
