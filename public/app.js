let photos = [];
let masterTags = [];
let activeTag = null;
let modalPhotoId = null;
let modalDraft = null; // { name, tags } — cambios locales sin guardar todavía

const STOPWORDS = new Set(['con', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'al', 'un', 'una']);

// La vista de participante (sin edición) es la que ve todo el mundo por
// defecto. Solo se activa el modo admin con un token fresco obtenido al
// loguearse por el candado — nunca se guarda, así que cada visita nueva
// (sin ?t= en la URL) vuelve a la vista de participante.
const adminToken = new URLSearchParams(location.search).get('t') || '';
const isAdmin = !!adminToken;
if (isAdmin) {
  document.body.classList.add('admin-mode');
  const manageLink = document.getElementById('manage-tags-link');
  if (manageLink) manageLink.href = 'etiquetas.html?t=' + encodeURIComponent(adminToken);
}

function adminHeaders(extra) {
  return Object.assign({ 'X-Admin-Token': adminToken }, extra || {});
}

// Si el link trae ?q= o ?tag=, es una búsqueda compartida: se precarga
// el filtro y se oculta todo lo de edición/admin (vista solo para ver).
(function applySharedFilterFromUrl() {
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  const tag = params.get('tag');
  if (q !== null) document.getElementById('search').value = q;
  if (tag) activeTag = tag.toLowerCase();
  if (q !== null || tag || params.has('view')) document.body.classList.add('shared-view');
})();

const gallery = document.getElementById('gallery');
const tagCloud = document.getElementById('tag-cloud');
const search = document.getElementById('search');
const modal = document.getElementById('photo-modal');
const modalImage = document.getElementById('modal-image');
const modalNameInput = document.getElementById('modal-name-input');
const modalTags = document.getElementById('modal-tags');
const modalTagSelect = document.getElementById('modal-tag-select');
const modalAddTagBtn = document.getElementById('modal-add-tag-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const searchWrap = document.querySelector('.search-wrap');
const sharedTitleWrap = document.getElementById('shared-title-wrap');
const sharedTitle = document.getElementById('shared-title');

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

if (document.body.classList.contains('shared-view')) {
  sharedTitle.textContent = capitalize(describeFilters(currentFilters()));
  sharedTitleWrap.hidden = false;
  searchWrap.hidden = true;
}

// La barra muestra cuántas fotos ya cargaron, pero SIN bloquear la
// galería — con muchas fotos y un servidor que atiende de a una,
// esperar a que todas terminen podía sentirse "trabado". La grilla
// se muestra de una vez y cada foto aparece cuando esté lista.
function trackLoadingProgress(list) {
  const wrap = document.getElementById('loading-indicator');
  if (!list.length || !wrap) {
    if (wrap) wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  let done = 0;
  const finish = () => {
    done += 1;
    setLoadingProgress(done, list.length);
    if (done >= list.length) wrap.hidden = true;
  };
  list.forEach((p) => {
    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = `/api/photos/${p.id}/image`;
  });
}

function setLoadingProgress(done, total) {
  const bar = document.getElementById('loading-bar-fill');
  if (bar) bar.style.width = total ? `${(done / total) * 100}%` : '0%';
}

async function loadPhotos() {
  const res = await fetch('/api/photos');
  if (!res.ok) {
    gallery.innerHTML = `<p class="empty">Todavía no hay una carpeta de Drive conectada. <a class="nav-link" href="connect.html">Conectar ahora →</a></p>`;
    return;
  }
  photos = await res.json();
  render();
  trackLoadingProgress(photos);
}

async function loadTags() {
  const res = await fetch('/api/tags');
  masterTags = await res.json();
  render();
}

function tagColor(name) {
  const found = masterTags.find((t) => t.name === name);
  return found ? found.color : '#6366f1';
}

function allTagNames() {
  const set = new Set();
  photos.forEach((p) => p.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}

function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function tokenize(query) {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function tokenMatchesTag(token, tag) {
  const normTag = normalize(tag);
  if (normTag.includes(token) || token.includes(normTag)) return true;
  return levenshtein(token, normTag) <= 1;
}

// Cuántos tokens de la búsqueda coinciden con alguna tag de la foto.
// No exige que coincidan todos — una foto con más coincidencias sale
// primero, pero una con solo alguna palabra parecida igual aparece.
function matchScore(photo, tokens) {
  if (activeTag && !photo.tags.includes(activeTag)) return -1;
  if (!tokens.length) return 0;
  return tokens.filter((token) => photo.tags.some((t) => tokenMatchesTag(token, t))).length;
}

function isPending(photo) {
  return photo.tags.length === 0 || photo.name === photo.filename;
}

// Une una lista de palabras en una frase en español ("a, b y c").
function joinSpanish(words) {
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  return words.slice(0, -1).join(', ') + ' y ' + words[words.length - 1];
}

function currentFilters() {
  const filters = [...tokenize(search.value)];
  if (activeTag && !filters.includes(activeTag)) filters.push(activeTag);
  return filters;
}

function describeFilters(filters) {
  return filters.length ? joinSpanish(filters) : 'todas las fotos';
}

function render() {
  const query = search.value.trim().toLowerCase();
  const isPendingCommand = query === '#pendientes';
  const tags = allTagNames();

  if (activeTag && !tags.includes(activeTag)) activeTag = null;

  tagCloud.innerHTML = tags
    .map(
      (t) =>
        `<span class="tag-pill ${t === activeTag ? 'active' : ''}" style="background:${tagColor(t)}" data-tag="${t}">${t}</span>`
    )
    .join('');

  let visible;
  if (isPendingCommand) {
    visible = photos.filter(isPending);
  } else {
    const tokens = tokenize(search.value);
    visible = photos
      .map((p) => ({ photo: p, score: matchScore(p, tokens) }))
      .filter((r) => r.score >= 0 && (!tokens.length || r.score > 0))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.photo);
  }

  gallery.innerHTML = visible.length
    ? visible.map(cardHtml).join('')
    : isPendingCommand
      ? `<p class="empty">Todas las fotos tienen nombre y etiquetas. 🎉</p>`
      : `<p class="empty">No hay fotos con esos tags todavía.</p>`;

  if (modalPhotoId) renderModal();
}

function tagDotsHtml(tags) {
  return tags.map((t) => `<span class="tag-dot" style="background:${tagColor(t)}" title="${t}"></span>`).join('');
}

function cardHtml(photo) {
  const isShared = document.body.classList.contains('shared-view');
  const hasCustomName = photo.name !== photo.filename;
  const nameHtml =
    isShared && !hasCustomName ? '' : `<p class="photo-name" title="${photo.name}">${photo.name}</p>`;

  return `
    <div class="card">
      <img src="/api/photos/${photo.id}/image" alt="${photo.name}" loading="lazy" data-action="open-modal" data-id="${photo.id}" onload="this.classList.add('loaded')" />
      <div class="card-body">
        <div class="tag-dots">${tagDotsHtml(photo.tags)}</div>
        ${nameHtml}
        <button class="share-btn" data-action="share" data-id="${photo.id}" data-filename="${photo.filename}">
          Compartir
        </button>
      </div>
    </div>
  `;
}

function openModal(id) {
  const photo = photos.find((p) => p.id === id);
  if (!photo) return;
  modalPhotoId = id;
  modalDraft = { name: photo.name, tags: [...photo.tags] };
  renderModal();
  modal.hidden = false;
}

function closeModal() {
  modalPhotoId = null;
  modalDraft = null;
  modal.hidden = true;
}

function renderModal() {
  if (!modalDraft) return;
  const photo = photos.find((p) => p.id === modalPhotoId);
  if (!photo) return closeModal();

  modalImage.classList.remove('loaded');
  modalImage.src = `/api/photos/${photo.id}/image`;
  modalImage.alt = modalDraft.name;
  modalNameInput.value = modalDraft.name;

  modalTags.innerHTML = modalDraft.tags
    .map(
      (t) =>
        `<span class="tag" style="background:${tagColor(t)}">${t}<button type="button" data-action="modal-remove-tag" data-tag="${t}">✕</button></span>`
    )
    .join('');

  const available = masterTags.filter((t) => !modalDraft.tags.includes(t.name));
  const addRow = document.getElementById('modal-add-tag-row');
  if (available.length) {
    addRow.hidden = false;
    modalTagSelect.innerHTML = available.map((t) => `<option value="${t.name}">${t.name}</option>`).join('');
  } else {
    addRow.hidden = true;
  }
}

async function shareImage(id, filename, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparando…';
  try {
    const res = await fetch(`/api/photos/${id}/image`);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (err) {
        if (err.name !== 'AbortError') alert('No se pudo compartir: ' + err.message);
      }
    } else {
      alert('Tu navegador no soporta compartir archivos directamente. Probá desde el celular.');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

tagCloud.addEventListener('click', (e) => {
  const pill = e.target.closest('.tag-pill');
  if (!pill) return;
  const tag = pill.dataset.tag;
  activeTag = activeTag === tag ? null : tag;
  render();
});

search.addEventListener('input', render);

async function copyShareLink(btn) {
  const url = new URL(location.origin + location.pathname);
  if (search.value.trim()) url.searchParams.set('q', search.value.trim());
  if (activeTag) url.searchParams.set('tag', activeTag);

  const message = `Resultados de ${describeFilters(currentFilters())}.\nVer resultados en: ${url.toString()}`;

  try {
    await navigator.clipboard.writeText(message);
    const original = btn.textContent;
    btn.textContent = '✅';
    setTimeout(() => (btn.textContent = original), 1500);
  } catch (err) {
    prompt('Copia este mensaje:', message);
  }
}

document.getElementById('share-search-btn').addEventListener('click', (e) => copyShareLink(e.currentTarget));
document.getElementById('share-view-btn').addEventListener('click', (e) => copyShareLink(e.currentTarget));

document.getElementById('logo-btn').addEventListener('click', () => {
  window.location.href = location.pathname;
});

const infoToggle = document.getElementById('info-toggle');
const infoPopover = document.getElementById('info-popover');
if (infoToggle) {
  infoToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    infoPopover.hidden = !infoPopover.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!infoPopover.hidden && !infoPopover.contains(e.target)) infoPopover.hidden = true;
  });
}

gallery.addEventListener('click', async (e) => {
  const img = e.target.closest('img[data-action="open-modal"]');
  if (img) {
    openModal(img.dataset.id);
    return;
  }

  const shareBtn = e.target.closest('button[data-action="share"]');
  if (shareBtn) {
    shareImage(shareBtn.dataset.id, shareBtn.dataset.filename, shareBtn);
  }
});

modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-action="close-modal"]')) closeModal();
});

modalAddTagBtn.addEventListener('click', () => {
  const tag = modalTagSelect.value;
  if (!tag || !modalDraft || modalDraft.tags.includes(tag)) return;
  modalDraft.tags.push(tag);
  renderModal();
});

modalTags.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="modal-remove-tag"]');
  if (!btn || !modalDraft) return;
  modalDraft.tags = modalDraft.tags.filter((t) => t !== btn.dataset.tag);
  renderModal();
});

modalSaveBtn.addEventListener('click', async () => {
  if (!modalPhotoId || !modalDraft) return;
  const photo = photos.find((p) => p.id === modalPhotoId);
  if (!photo) return;

  const newName = modalNameInput.value.trim() || photo.name;
  const toAdd = modalDraft.tags.filter((t) => !photo.tags.includes(t));
  const toRemove = photo.tags.filter((t) => !modalDraft.tags.includes(t));

  const original = modalSaveBtn.textContent;
  modalSaveBtn.disabled = true;
  modalSaveBtn.textContent = 'Guardando…';

  try {
    if (newName !== photo.name) {
      await fetch(`/api/photos/${modalPhotoId}/name`, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: newName }),
      });
    }
    // Secuencial: el servidor lee-modifica-escribe las tags de la foto,
    // en paralelo una llamada podría pisar a la otra.
    for (const tag of toAdd) {
      await fetch(`/api/photos/${modalPhotoId}/tags`, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tag }),
      });
    }
    for (const tag of toRemove) {
      await fetch(`/api/photos/${modalPhotoId}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
    }

    photos = photos.map((p) =>
      p.id === modalPhotoId ? { ...p, name: newName, tags: [...modalDraft.tags] } : p
    );
    closeModal();
    render();
  } catch (err) {
    alert('No se pudo guardar: ' + err.message);
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = original;
  }
});

loadPhotos();
loadTags();
