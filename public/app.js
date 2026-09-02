let photos = [];
let masterTags = [];
let activeTag = null;

const gallery = document.getElementById('gallery');
const tagCloud = document.getElementById('tag-cloud');
const search = document.getElementById('search');

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

function allTags() {
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
  const tags = allTags();

  if (activeTag && !tags.includes(activeTag)) activeTag = null;

  tagCloud.innerHTML = tags
    .map(
      (t) =>
        `<span class="tag-pill ${t === activeTag ? 'active' : ''}" data-tag="${t}">${t}</span>`
    )
    .join('');

  const visible = photos.filter((p) => matchesQuery(p, tokens));

  gallery.innerHTML = visible.length
    ? visible.map(cardHtml).join('')
    : `<p class="empty">No hay fotos con esos tags todavía.</p>`;
}

function cardHtml(photo) {
  const tags = photo.tags
    .map(
      (t) =>
        `<span class="tag">${t}<button data-action="remove" data-id="${photo.id}" data-tag="${t}">✕</button></span>`
    )
    .join('');

  const available = masterTags.filter((t) => !photo.tags.includes(t));
  const assignForm = available.length
    ? `
        <form class="add-tag" data-id="${photo.id}">
          <select>${available.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
          <button type="submit">+</button>
        </form>
      `
    : `<p class="muted small">Crea o libera una etiqueta para poder asignarla.</p>`;

  return `
    <div class="card">
      <img src="/api/photos/${photo.id}/image" alt="${photo.filename}" loading="lazy" />
      <div class="card-body">
        <div class="tags">${tags}</div>
        ${assignForm}
        <button class="share-btn" data-action="share" data-id="${photo.id}" data-filename="${photo.filename}">
          Compartir
        </button>
      </div>
    </div>
  `;
}

async function shareImage(id, filename) {
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
}

tagCloud.addEventListener('click', (e) => {
  const pill = e.target.closest('.tag-pill');
  if (!pill) return;
  const tag = pill.dataset.tag;
  activeTag = activeTag === tag ? null : tag;
  render();
});

search.addEventListener('input', render);

gallery.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.closest('.add-tag');
  if (!form) return;
  const id = form.dataset.id;
  const select = form.querySelector('select');
  const tag = select.value;
  if (!tag) return;
  const res = await fetch(`/api/photos/${id}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  });
  const updated = await res.json();
  photos = photos.map((p) => (p.id === id ? updated : p));
  render();
});

gallery.addEventListener('click', async (e) => {
  const removeBtn = e.target.closest('button[data-action="remove"]');
  if (removeBtn) {
    const { id, tag } = removeBtn.dataset;
    const res = await fetch(`/api/photos/${id}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    });
    const updated = await res.json();
    photos = photos.map((p) => (p.id === id ? updated : p));
    render();
    return;
  }

  const shareBtn = e.target.closest('button[data-action="share"]');
  if (shareBtn) {
    shareImage(shareBtn.dataset.id, shareBtn.dataset.filename);
  }
});

loadPhotos();
loadTags();
