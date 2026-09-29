// app.js
// Main SPA logic: rendering, admin, routing, forms

// =====================================================
//  Google Sheets Sync Config
//  Paste your Apps Script Web App URL here after deploying it.
//  Leave empty ('') to disable Sheets sync.
// =====================================================
const SHEETS_WEBHOOK_URL = '';   // ← Paste your Apps Script URL here

// =====================================================
//  State
// =====================================================
let currentUser    = null;          // null | 'a1' | 'a2'
let currentClubId  = null;          // ID of the club detail panel currently open
let editingClubId  = null;          // ID of club being edited (null = adding new)
let allClubs       = [];            // Live-synced array of club objects
let achRows        = [];            // Achievement form rows: { id, existingUrl, file, caption, previewUrl }
let clubHeadRows   = [];            // Club heads list: { id, name }
let activeCategory = 'all';         // Currently selected category filter
let lbImages       = [];            // Lightbox: filtered images array
let lbIndex        = 0;             // Lightbox: current index
let unsubscribe    = null;          // Listener cleanup

// =====================================================
//  Boot
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  // Start Firestore real-time listener
  unsubscribe = listenToClubs(clubs => {
    allClubs = clubs;
    document.getElementById('club-count').textContent = clubs.length;
    renderGrid();

    // If detail panel is open, refresh its content in real time
    if (currentClubId && !document.getElementById('club-detail-overlay').classList.contains('hidden')) {
      const updated = allClubs.find(c => c.id === currentClubId);
      if (updated) renderDetailContent(updated);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeClubDetail();
      closeLoginModal();
      closeClubFormModal();
    }
    if (document.getElementById('lightbox') && !document.getElementById('lightbox').classList.contains('hidden')) {
      if (e.key === 'ArrowRight') lightboxNav(1);
      if (e.key === 'ArrowLeft')  lightboxNav(-1);
    }
  });
});

// =====================================================
//  Category Filter
// =====================================================
const CATEGORY_ICONS = {
  'Technical':      'fas fa-microchip',
  'Cultural':       'fas fa-music',
  'Sports':         'fas fa-futbol',
  'Social Service': 'fas fa-hands-helping',
  'Literary':       'fas fa-book-open',
  'Arts & Media':   'fas fa-palette',
  'Academic':       'fas fa-graduation-cap',
  'Other':          'fas fa-ellipsis-h'
};

function renderCategoryTabs() {
  const tabsEl = document.getElementById('category-tabs');
  if (!tabsEl) return;

  // Collect unique categories from data
  const cats = [...new Set(allClubs.map(c => c.category || 'Other').filter(Boolean))].sort();

  let html = `<button class="cat-tab ${activeCategory === 'all' ? 'active' : ''}" data-cat="all" onclick="filterByCategory('all')">
    <i class="fas fa-th"></i> All (${allClubs.length})
  </button>`;

  cats.forEach(cat => {
    const count = allClubs.filter(c => (c.category || 'Other') === cat).length;
    const icon  = CATEGORY_ICONS[cat] || 'fas fa-folder';
    html += `<button class="cat-tab ${activeCategory === cat ? 'active' : ''}" data-cat="${esc(cat)}" onclick="filterByCategory('${esc(cat)}')">
      <i class="${icon}"></i> ${esc(cat)} (${count})
    </button>`;
  });

  tabsEl.innerHTML = html;
}

function filterByCategory(cat) {
  activeCategory = cat;
  renderCategoryTabs();
  renderGrid();
}

// =====================================================
//  Club Grid
// =====================================================
function renderGrid() {
  const grid  = document.getElementById('clubs-grid');
  const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

  let filtered = query
    ? allClubs.filter(c => (c.name || '').toLowerCase().includes(query))
    : [...allClubs];

  // Apply category filter
  if (activeCategory !== 'all') {
    filtered = filtered.filter(c => (c.category || 'Other') === activeCategory);
  }

  // Update category tabs (always)
  renderCategoryTabs();

  if (filtered.length === 0) {
    const msg = allClubs.length === 0
      ? 'No clubs yet. An admin can add clubs using the <strong>+ Add Club</strong> button.'
      : 'No clubs match your search / filter.';
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-${allClubs.length === 0 ? 'users' : 'search'}"></i>
        <p>${msg}</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(club => `
    <div class="club-card" onclick="openClubDetail('${club.id}')" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' ') openClubDetail('${club.id}')">
      <div class="club-card-logo-wrap">
        ${club.logoUrl
          ? `<img class="club-card-logo" src="${esc(club.logoUrl)}" alt="${esc(club.name)} logo" loading="lazy">`
          : `<div class="club-logo-placeholder"><i class="fas fa-users"></i></div>`
        }
      </div>
      <div class="club-card-info">
        <div class="club-card-name">${esc(club.name || 'Unnamed Club')}</div>
        ${club.category ? `<span class="club-card-category"><i class="${CATEGORY_ICONS[club.category] || 'fas fa-folder'}" style="margin-right:4px"></i>${esc(club.category)}</span>` : ''}
        ${club.clubHead ? `<div class="club-card-head"><i class="fas fa-user-tie" style="font-size:.7rem;margin-right:4px"></i>${esc(club.clubHead)}</div>` : ''}
        ${(club.achievements || []).filter(a => a.imageUrl).length
          ? `<span class="club-card-tag"><i class="fas fa-trophy"></i>${(club.achievements || []).filter(a => a.imageUrl).length} Achievement${(club.achievements || []).filter(a => a.imageUrl).length > 1 ? 's' : ''}</span>`
          : ''
        }
      </div>
    </div>
  `).join('');
}

function filterClubs() { renderGrid(); }

// =====================================================
//  Club Detail Panel
// =====================================================
function openClubDetail(clubId) {
  const club = allClubs.find(c => c.id === clubId);
  if (!club) return;

  currentClubId = clubId;
  const overlay = document.getElementById('club-detail-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Admin action visibility
  const actionsEl  = document.getElementById('detail-admin-actions');
  const deleteBtn  = document.getElementById('detail-delete-btn');

  if (currentUser === 'a1' || currentUser === 'a2') {
    actionsEl.classList.remove('hidden');
    // A1 can delete; A2 cannot
    deleteBtn.classList.toggle('hidden', currentUser !== 'a1');
  } else {
    actionsEl.classList.add('hidden');
  }

  renderDetailContent(club);
}

function renderDetailContent(club) {
  const achList = (club.achievements || []).filter(a => a.imageUrl);

  document.getElementById('club-detail-content').innerHTML = `
    <div class="detail-hero">
      ${club.logoUrl
        ? `<img class="detail-logo" src="${esc(club.logoUrl)}" alt="${esc(club.name)} logo">`
        : `<div class="detail-logo-placeholder"><i class="fas fa-users"></i></div>`
      }
      <div class="detail-club-name">${esc(club.name || 'Unnamed Club')}</div>
      ${club.category ? `
        <div class="detail-category-badge">
          <i class="${CATEGORY_ICONS[club.category] || 'fas fa-folder'}"></i>
          <span>${esc(club.category)}</span>
        </div>` : ''}
      ${getClubHeadsArray(club.clubHead).length > 0 ? `
        <div class="detail-club-head">
          <i class="fas fa-user-tie" style="margin-right:6px"></i>Club Heads:
          ${getClubHeadsArray(club.clubHead).map(h =>
            `<span style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:100px;padding:2px 12px;margin:3px 4px;font-size:0.88rem">${esc(h.trim())}</span>`
          ).join('')}
        </div>` : ''}
    </div>

    <div class="detail-body">

      ${club.mission ? `
        <div class="detail-section">
          <div class="detail-section-label">
            <i class="fas fa-bullseye"></i> Mission
          </div>
          <p>${nl2br(esc(club.mission))}</p>
        </div>` : ''}

      ${club.aboutClub ? `
        <div class="detail-section">
          <div class="detail-section-label">
            <i class="fas fa-info-circle"></i> About Club
          </div>
          <p>${nl2br(esc(club.aboutClub))}</p>
        </div>` : ''}

      ${achList.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-label">
            <i class="fas fa-trophy"></i> Achievements (${achList.length})
          </div>
          <div class="ach-gallery">
            ${achList.map((a, i) => `
              <div class="ach-item" onclick="openLightbox(${i})" role="button" tabindex="0"
                   onkeydown="if(event.key==='Enter') openLightbox(${i})">
                <img src="${esc(a.imageUrl)}" alt="${esc(a.caption || 'Achievement')}" loading="lazy">
                ${a.caption ? `<div class="ach-caption">${esc(a.caption)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>` : ''}

      ${club.joiningProcedure ? `
        <div class="detail-section">
          <div class="detail-section-label">
            <i class="fas fa-door-open"></i> How to Join
          </div>
          <p>${nl2br(esc(club.joiningProcedure))}</p>
        </div>` : ''}

      ${club.contact ? `
        <div class="detail-section">
          <div class="detail-section-label">
            <i class="fas fa-address-book"></i> Contact
          </div>
          <p>${nl2br(esc(club.contact))}</p>
        </div>` : ''}

    </div>
  `;
}

function closeClubDetail() {
  const panel = document.getElementById('club-detail-panel');
  if (!panel) return;
  panel.classList.add('closing');
  setTimeout(() => {
    document.getElementById('club-detail-overlay').classList.add('hidden');
    panel.classList.remove('closing');
    document.body.style.overflow = '';
    currentClubId = null;
  }, 350);
}

function handleDetailOverlayClick(e) {
  if (e.target === document.getElementById('club-detail-overlay')) {
    closeClubDetail();
  }
}

// =====================================================
//  Lightbox
// =====================================================
function openLightbox(startIdx) {
  const club = allClubs.find(c => c.id === currentClubId);
  if (!club) return;

  lbImages = (club.achievements || []).filter(a => a.imageUrl);
  lbIndex  = startIdx;

  const lb    = document.getElementById('lightbox');
  const img   = document.getElementById('lb-img');
  const cap   = document.getElementById('lb-caption');
  const ctr   = document.getElementById('lb-counter');
  const prev  = document.getElementById('lb-prev');
  const next  = document.getElementById('lb-next');

  img.src          = lbImages[lbIndex].imageUrl;
  cap.textContent  = lbImages[lbIndex].caption || '';
  ctr.textContent  = `${lbIndex + 1} / ${lbImages.length}`;
  cap.classList.toggle('hidden', !lbImages[lbIndex].caption);

  // Show/hide navigation buttons
  const showNav = lbImages.length > 1;
  prev.classList.toggle('hidden', !showNav);
  next.classList.toggle('hidden', !showNav);

  lb.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Close on backdrop
  lb.onclick = e => { if (e.target === lb) closeLightbox(); };
}

function lightboxNav(dir) {
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
  const img  = document.getElementById('lb-img');
  const cap  = document.getElementById('lb-caption');
  const ctr  = document.getElementById('lb-counter');

  img.src          = lbImages[lbIndex].imageUrl;
  cap.textContent  = lbImages[lbIndex].caption || '';
  ctr.textContent  = `${lbIndex + 1} / ${lbImages.length}`;
  cap.classList.toggle('hidden', !lbImages[lbIndex].caption);
}

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  // Restore scroll — keep body locked if detail panel is open
  if (document.getElementById('club-detail-overlay').classList.contains('hidden')) {
    document.body.style.overflow = '';
  }
}

// =====================================================
//  Admin Login
// =====================================================
function openLoginModal() {
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('login-password').focus(), 120);
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
  if (document.getElementById('club-detail-overlay').classList.contains('hidden')) {
    document.body.style.overflow = '';
  }
}

async function doLogin() {
  const pwd = document.getElementById('login-password').value;
  if (!pwd) return;

  const btn = document.getElementById('login-btn');
  setBusy(btn, true);

  const role = await verifyPassword(pwd);
  setBusy(btn, false);

  if (!role) {
    document.getElementById('login-error').classList.remove('hidden');
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
    return;
  }

  currentUser = role;
  closeLoginModal();

  // Update navbar
  const adminBtn    = document.getElementById('admin-btn');
  const adminStatus = document.getElementById('admin-status');
  const fab         = document.getElementById('admin-fab');

  adminStatus.innerHTML = role === 'a1'
    ? '🔑&nbsp;Full Admin'
    : '✏️&nbsp;Editor';
  adminStatus.classList.remove('hidden');

  adminBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i><span>Logout</span>';
  adminBtn.classList.replace('btn-outline', 'btn-secondary');
  adminBtn.onclick = doLogout;

  fab.classList.remove('hidden');

  showToast(role === 'a1' ? 'Logged in as Full Admin (A1)' : 'Logged in as Editor (A2)', 'success');

  // Refresh detail admin controls if panel is open
  if (currentClubId) {
    const club = allClubs.find(c => c.id === currentClubId);
    if (club) openClubDetail(currentClubId);
  }
}

function doLogout() {
  currentUser = null;
  if (typeof verifyPassword === 'function') verifyPassword('logout');

  const adminBtn    = document.getElementById('admin-btn');
  const adminStatus = document.getElementById('admin-status');
  const fab         = document.getElementById('admin-fab');
  const actionsEl   = document.getElementById('detail-admin-actions');

  adminStatus.classList.add('hidden');
  fab.classList.add('hidden');
  actionsEl.classList.add('hidden');

  adminBtn.innerHTML = '<i class="fas fa-lock"></i><span>Admin Login</span>';
  adminBtn.classList.replace('btn-secondary', 'btn-outline');
  adminBtn.onclick = openLoginModal;

  showToast('Logged out successfully', 'info');
}

// =====================================================
//  Add / Edit Modal
// =====================================================
function openAddModal() {
  editingClubId = null;
  achRows       = [];
  clubHeadRows  = [];

  document.getElementById('form-modal-title').innerHTML =
    '<i class="fas fa-plus-circle"></i> Add New Club';
  document.getElementById('club-form').reset();

  // Reset logo preview
  document.getElementById('logo-preview').classList.add('hidden');
  document.getElementById('logo-placeholder').style.display = '';
  document.getElementById('f-logo').value = '';

  renderClubHeadRows();
  renderAchRows();
  updateAchCounter();

  document.getElementById('club-form-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function openEditModal() {
  if (!currentClubId) return;
  const club = allClubs.find(c => c.id === currentClubId);
  if (!club) return;

  editingClubId = currentClubId;

  document.getElementById('form-modal-title').innerHTML =
    '<i class="fas fa-edit"></i> Edit Club';

  // Populate text fields
  document.getElementById('f-name').value             = club.name             || '';
  document.getElementById('f-category').value         = club.category         || '';
  document.getElementById('f-mission').value          = club.mission          || '';
  document.getElementById('f-aboutClub').value        = club.aboutClub        || '';
  document.getElementById('f-joiningProcedure').value = club.joiningProcedure || '';
  document.getElementById('f-contact').value          = club.contact          || '';

  // Load existing club heads into rows
  clubHeadRows = getClubHeadsArray(club.clubHead).map((name, i) => ({
    id: Date.now() + i,
    name: name.trim()
  }));
  renderClubHeadRows();

  // Logo preview
  if (club.logoUrl) {
    const prev = document.getElementById('logo-preview');
    prev.src = club.logoUrl;
    prev.classList.remove('hidden');
    document.getElementById('logo-placeholder').style.display = 'none';
  } else {
    document.getElementById('logo-preview').classList.add('hidden');
    document.getElementById('logo-placeholder').style.display = '';
  }
  document.getElementById('f-logo').value = '';

  // Load existing achievements into rows
  achRows = (club.achievements || []).map((a, i) => ({
    id:          Date.now() + i + 1000,
    existingUrl: a.imageUrl || '',
    file:        null,
    caption:     a.caption  || '',
    previewUrl:  a.imageUrl || ''
  }));

  renderAchRows();
  updateAchCounter();

  document.getElementById('club-form-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeClubFormModal() {
  document.getElementById('club-form-modal').classList.add('hidden');
  // Restore scroll only if no panel is underneath
  if (document.getElementById('club-detail-overlay').classList.contains('hidden')) {
    document.body.style.overflow = '';
  }
  achRows       = [];
  clubHeadRows  = [];
  editingClubId = null;
}

// =====================================================
//  Club Heads List
// =====================================================

/** Parse clubHead string (comma-separated) OR array into a clean array */
function getClubHeadsArray(clubHead) {
  if (!clubHead) return [];
  if (Array.isArray(clubHead)) return clubHead.filter(h => h.trim());
  return clubHead.split(',').map(h => h.trim()).filter(h => h);
}

function addClubHeadRow() {
  clubHeadRows.push({ id: Date.now(), name: '' });
  renderClubHeadRows();
}

function removeClubHeadRow(rowId) {
  clubHeadRows = clubHeadRows.filter(r => r.id !== rowId);
  renderClubHeadRows();
}

function updateClubHeadName(rowId, value) {
  const row = clubHeadRows.find(r => r.id === rowId);
  if (row) row.name = value;
}

function renderClubHeadRows() {
  const list = document.getElementById('club-heads-list');
  if (!list) return;

  if (clubHeadRows.length === 0) {
    list.innerHTML = `<p style="font-size:0.83rem;color:var(--text-light);margin-bottom:0.5rem">No club heads added yet.</p>`;
    return;
  }

  list.innerHTML = clubHeadRows.map((row, idx) => `
    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.6rem;">
      <span style="background:var(--primary);color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0">${idx + 1}</span>
      <input type="text"
             value="${esc(row.name)}"
             placeholder="Full name (e.g. Dr. Anita Sharma)"
             oninput="updateClubHeadName(${row.id}, this.value)"
             style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:0.9rem;font-family:'Inter Tight',sans-serif;outline:none;transition:border-color 0.2s"
             onfocus="this.style.borderColor='var(--primary)'"
             onblur="this.style.borderColor='var(--border)'">
      <button type="button" class="btn btn-sm btn-danger" onclick="removeClubHeadRow(${row.id})" title="Remove">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

// =====================================================
//  Achievement Rows
// =====================================================
function addAchievementRow() {
  if (achRows.length >= 15) {
    showToast('Maximum 15 achievement images allowed', 'error');
    return;
  }
  achRows.push({ id: Date.now(), existingUrl: '', file: null, caption: '', previewUrl: '' });
  renderAchRows();
  updateAchCounter();
}

function removeAchievementRow(rowId) {
  achRows = achRows.filter(r => r.id !== rowId);
  renderAchRows();
  updateAchCounter();
}

function updateAchCaption(rowId, value) {
  const row = achRows.find(r => r.id === rowId);
  if (row) row.caption = value;
}

function onAchFileSelect(rowId, input) {
  const file = input.files[0];
  if (!file) return;
  const row = achRows.find(r => r.id === rowId);
  if (!row) return;
  row.file       = file;
  row.previewUrl = URL.createObjectURL(file);

  // Update only the thumbnail for that row (avoids re-render / losing focus)
  const thumb = document.querySelector(`#arow-${rowId} .ach-thumb`);
  if (thumb) {
    thumb.innerHTML = `<img src="${row.previewUrl}" alt="Achievement preview">`;
    thumb.classList.remove('no-img');
  }
}

function renderAchRows() {
  const list = document.getElementById('achievements-list');
  if (!list) return;

  list.innerHTML = achRows.map(row => `
    <div class="ach-row" id="arow-${row.id}">
      <div class="ach-thumb ${row.previewUrl ? '' : 'no-img'}"
           onclick="document.getElementById('af-${row.id}').click()"
           title="Click to upload image">
        ${row.previewUrl
          ? `<img src="${esc(row.previewUrl)}" alt="Achievement preview">`
          : `<i class="fas fa-image"></i><span>Upload</span>`
        }
      </div>
      <div class="ach-row-inputs">
        <input type="text"
               value="${esc(row.caption)}"
               placeholder="Caption (optional)"
               oninput="updateAchCaption(${row.id}, this.value)">
        <span class="ach-row-hint">Click the thumbnail to choose an image</span>
        <input type="file" id="af-${row.id}" accept="image/*" class="hidden"
               onchange="onAchFileSelect(${row.id}, this)">
      </div>
      <div>
        <button type="button" class="btn btn-sm btn-danger"
                onclick="removeAchievementRow(${row.id})"
                title="Remove this achievement">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  // Disable add button at limit
  const addBtn = document.getElementById('add-ach-btn');
  if (addBtn) addBtn.disabled = achRows.length >= 15;
}

function updateAchCounter() {
  const el = document.getElementById('ach-counter');
  if (el) el.textContent = `${achRows.length} / 15`;
}

// =====================================================
//  Logo File Handling
// =====================================================
function previewLogo(input) {
  const file = input.files[0];
  if (!file) return;
  const prev = document.getElementById('logo-preview');
  prev.src = URL.createObjectURL(file);
  prev.classList.remove('hidden');
  document.getElementById('logo-placeholder').style.display = 'none';
}

function handleLogoDrop(e) {
  e.preventDefault();
  document.getElementById('logo-drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;

  // Inject into the file input and trigger preview
  const input    = document.getElementById('f-logo');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  previewLogo(input);
}

// =====================================================
//  Form Submit
// =====================================================
async function submitClubForm(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  const statusEl  = document.getElementById('upload-status');
  const statusTxt = document.getElementById('upload-status-text');
  const progressBar = document.getElementById('upload-progress-bar');

  setBusy(submitBtn, true);
  statusEl.classList.remove('hidden');
  progressBar.style.width = '0%';

  const fields = {
    name:              document.getElementById('f-name').value.trim(),
    category:          document.getElementById('f-category').value,
    clubHead:          clubHeadRows.map(r => r.name).filter(n => n.trim()).join(', '),
    mission:           document.getElementById('f-mission').value.trim(),
    aboutClub:         document.getElementById('f-aboutClub').value.trim(),
    joiningProcedure:  document.getElementById('f-joiningProcedure').value.trim(),
    contact:           document.getElementById('f-contact').value.trim()
  };

  const logoFile = document.getElementById('f-logo').files[0] || null;

  // Validation
  if (!editingClubId && !logoFile) {
    showToast('Please upload a club logo', 'error');
    setBusy(submitBtn, false);
    statusEl.classList.add('hidden');
    return;
  }

  const onProg = pct => {
    progressBar.style.width = pct + '%';
    statusTxt.textContent   = `Uploading… ${pct}%`;
  };

  try {
    if (editingClubId) {
      // Attach existing logoUrl so updateClub can fall back to it
      const existingClub = allClubs.find(c => c.id === editingClubId) || {};
      fields.logoUrl     = existingClub.logoUrl || '';

      statusTxt.textContent = 'Saving changes…';
      await updateClub(editingClubId, fields, logoFile, achRows, onProg);

      // Sync updated club to Google Sheets
      const updatedClub = { id: editingClubId, ...fields, achievements: achRows };
      syncToSheets('update', updatedClub);

      // Update local state so UI updates instantly
      const idx = allClubs.findIndex(c => c.id === editingClubId);
      if (idx !== -1) allClubs[idx] = updatedClub;
      renderGrid();
      if (currentClubId === editingClubId) renderDetailContent(updatedClub);

      showToast('Club updated successfully!', 'success');

    } else {
      statusTxt.textContent = 'Creating club…';
      const newId = await addClub(fields, logoFile, achRows, onProg);

      // Sync new club to Google Sheets
      const newClub = { id: newId, ...fields, achievements: achRows };
      syncToSheets('add', newClub);

      // Update local state so UI updates instantly
      allClubs.unshift(newClub);
      renderGrid();

      showToast('Club added successfully!', 'success');
    }

    closeClubFormModal();

  } catch (err) {
    console.error('[submitClubForm]', err);
    showToast(`Save failed: ${err.message || err.code || 'Check permissions'}`, 'error');
  }

  setBusy(submitBtn, false);
  statusEl.classList.add('hidden');
}

// =====================================================
//  Delete Club
// =====================================================
async function deleteCurrentClub() {
  if (currentUser !== 'a1') {
    showToast('Permission denied — only Full Admins can delete clubs', 'error');
    return;
  }
  if (!currentClubId) return;

  const club = allClubs.find(c => c.id === currentClubId);
  const name = club?.name || 'this club';

  if (!confirm(`⚠️ Delete "${name}"?\n\nThis will permanently remove the club and all its images. This cannot be undone.`)) return;

  try {
    await deleteClub(currentClubId);
    syncToSheets('delete', { id: currentClubId });   // Sync deletion to Google Sheets
    closeClubDetail();
    showToast(`"${name}" deleted successfully`, 'success');
  } catch (err) {
    console.error('[deleteCurrentClub]', err);
    showToast('Error deleting club — check console for details.', 'error');
  }
}

// =====================================================
//  Modal overlay click-outside to close
// =====================================================
function handleOverlayClick(e, modalId) {
  if (e.target.id === modalId) {
    if (modalId === 'login-modal')     closeLoginModal();
    if (modalId === 'club-form-modal') closeClubFormModal();
  }
}

// =====================================================
//  Toast Notifications
// =====================================================
let toastTimer = null;

function showToast(message, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className   = `toast ${type} show`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// =====================================================
//  Button Busy State
// =====================================================
function setBusy(btn, busy) {
  if (!btn) return;
  if (busy) {
    btn.classList.add('btn-busy');
    const i = btn.querySelector('i');
    if (i) { i.dataset.cls = i.className; i.className = 'fas fa-circle-notch fa-spin'; }
  } else {
    btn.classList.remove('btn-busy');
    const i = btn.querySelector('i');
    if (i && i.dataset.cls) { i.className = i.dataset.cls; delete i.dataset.cls; }
  }
}

// =====================================================
//  Utilities
// =====================================================

/** HTML-escape a string */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert newlines to <br> (call AFTER esc) */
function nl2br(str) {
  return str.replace(/\n/g, '<br>');
}

// =====================================================
//  Google Sheets Sync
// =====================================================

/**
 * Fire-and-forget sync of club data to Google Sheets via Apps Script Web App.
 * Uses text/plain POST (simple CORS request — no preflight needed).
 *
 * @param {'add'|'update'|'delete'} action
 * @param {Object} club  Club object (for 'delete', only needs { id })
 */
function syncToSheets(action, club) {
  if (!SHEETS_WEBHOOK_URL) return;   // Not configured — skip silently

  const payload = {
    action,
    club: {
      id:               club.id               || '',
      name:             club.name             || '',
      clubHead:         club.clubHead         || '',
      mission:          club.mission          || '',
      aboutClub:        club.aboutClub        || '',
      joiningProcedure: club.joiningProcedure || '',
      contact:          club.contact          || '',
      logoUrl:          club.logoUrl          || '',
      achievementCount: (club.achievements || []).filter(a => a.imageUrl || a.existingUrl).length,
      syncedAt:         new Date().toISOString()
    }
  };

  // text/plain avoids CORS preflight — Apps Script receives it fine
  fetch(SHEETS_WEBHOOK_URL, {
    method:  'POST',
    mode:    'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify(payload)
  }).catch(err => {
    console.warn('[Sheets sync] Non-critical error:', err.message);
  });
}
