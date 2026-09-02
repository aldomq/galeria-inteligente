let photos = [];
let masterTags = [];
let activeTag = null;
let modalPhotoId = null;

const gallery = document.getElementById('gallery');
const tagCloud = document.getElementById('tag-cloud');
const search = document.getElementById('search');
const modal = document.getElementById('photo-modal');
const modalImage = document.getElementById('modal-image');
const modalNameInput = document.getElementById('modal-name-input');
const modalTags = document.getElementById('modal-tags');
const modalAddTagForm = document.getElementById('modal-add-tag-form');
const modalTagSelect = document.getElementById('modal-tag-select');

async function loadPhotos() {
  const res = await fetch('/api/photos');
  if (!res.ok) {
    gallery.innerHTML = `<p class="empty">Todavía no hay una carpeta de Drive conectada. <a class="nav-link" href="connect.html">Conectar ahora →</a></p>`;
    return;
  }
  photos = await res.json();
  render();
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

const STOPWORDS = new Set(['con', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'al', 'un', 'una']);

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

function matchesQuery(photo, tokens) {
  if (activeTag && !photo.tags.includes(activeTag)) return false;
  if (!tokens.length) return true;
  return tokens.every((token) => photo.tags.some((t) => tokenMatchesTag(token, t)));
}

function render() {
  const tokens = tokenize(search.value);
  const tags = allTagNames();

  if (activeTag && !tags.includes(activeTag)) activeTag = null;

  tagCloud.innerHTML = tags
    .map(
      (t) =>
        `<span class="tag-pill ${t === activeTag ? 'active' : ''}" style="background:${tagColor(t)}" data-tag="${t}">${t}</span>`
    )
    .join('');

  const visible = photos.filter((p) => matchesQuery(p, tokens));

  gallery.innerHTML = visible.length
    ? visible.map(cardHtml).join('')
    : `<p class="empty">No hay fotos con esos tags todavía.</p>`;

  if (modalPhotoId) renderModal();
}

function tagChipsHtml(tags) {
  return tags
    .map((t) => `<span class="tag" style="background:${tagColor(t)}">${t}</span>`)
    .join('');
}

function cardHtml(photo) {
  return `
    <div class="card">
      <p class="photo-name" title="${photo.name}">${photo.name}</p>
      <img src="/api/photos/${photo.id}/image" alt="${photo.name}" loading="lazy" data-action="open-modal" data-id="${photo.id}" />
      <div class="card-body">
        <div class="tags">${tagChipsHtml(photo.tags)}</div>
        <button class="share-btn" data-action="share" data-id="${photo.id}" data-filename="${photo.filename}">
          Compartir
        </button>
      </div>
    </div>
  `;
}

function openModal(id) {
  modalPhotoId = id;
  renderModal();
  modal.hidden = false;
}

function closeModal() {
  modalPhotoId = null;
  modal.hidden = true;
}

function renderModal() {
  const photo = photos.find((p) => p.id === modalPhotoId);
  if (!photo) return closeModal();

  modalImage.src = `/api/photos/${photo.id}/image`;
  modalImage.alt = photo.name;
  modalNameInput.value = photo.name;

  modalTags.innerHTML = photo.tags
    .map(
      (t) =>
        `<span class="tag" style="background:${tagColor(t)}">${t}<button type="button" data-action="modal-remove-tag" data-tag="${t}">✕</button></span>`
    )
    .join('');

  const available = masterTags.filter((t) => !photo.tags.includes(t.name));
  if (available.length) {
    modalAddTagForm.hidden = false;
    modalTagSelect.innerHTML = available.map((t) => `<option value="${t.name}">${t.name}</option>`).join('');
  } else {
    modalAddTagForm.hidden = true;
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

modalNameInput.addEventListener('change', async () => {
  const name = modalNameInput.value.trim();
  if (!name || !modalPhotoId) return;
  modalNameInput.disabled = true;
  try {
    await fetch(`/api/photos/${modalPhotoId}/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    photos = photos.map((p) => (p.id === modalPhotoId ? { ...p, name } : p));
    render();
  } finally {
    modalNameInput.disabled = false;
  }
});

modalAddTagForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tag = modalTagSelect.value;
  if (!tag || !modalPhotoId) return;
  const submitBtn = modalAddTagForm.querySelector('button');
  modalTagSelect.disabled = true;
  submitBtn.disabled = true;
  try {
    const res = await fetch(`/api/photos/${modalPhotoId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    });
    const updated = await res.json();
    photos = photos.map((p) => (p.id === modalPhotoId ? { ...p, tags: updated.tags } : p));
    render();
  } finally {
    modalTagSelect.disabled = false;
    submitBtn.disabled = false;
  }
});

modalTags.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="modal-remove-tag"]');
  if (!btn || !modalPhotoId) return;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const res = await fetch(`/api/photos/${modalPhotoId}/tags/${encodeURIComponent(btn.dataset.tag)}`, {
      method: 'DELETE',
    });
    const updated = await res.json();
    photos = photos.map((p) => (p.id === modalPhotoId ? { ...p, tags: updated.tags } : p));
    render();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '✕';
  }
});

loadPhotos();
loadTags();
