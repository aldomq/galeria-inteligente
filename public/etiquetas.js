const adminToken = new URLSearchParams(location.search).get('t') || '';
const categoryId = new URLSearchParams(location.search).get('cat') || '';
const isAdmin = !!adminToken;

function adminHeaders(extra) {
  return Object.assign({ 'X-Admin-Token': adminToken }, extra || {});
}

let masterTags = [];

const tagManagerList = document.getElementById('tag-manager-list');
const newTagForm = document.getElementById('new-tag-form');
const newTagInput = document.getElementById('new-tag-input');
const tagManagerSection = document.getElementById('tag-manager-section');
const loginRequired = document.getElementById('login-required');
const categoryLabel = document.getElementById('category-label');
const backLink = document.getElementById('back-link');

if (!isAdmin || !categoryId) {
  tagManagerSection.hidden = true;
  loginRequired.hidden = false;
} else if (backLink) {
  backLink.href = `index.html?cat=${encodeURIComponent(categoryId)}&t=${encodeURIComponent(adminToken)}`;
}

async function loadCategoryName() {
  if (!categoryLabel || !categoryId) return;
  const res = await fetch('/api/categories');
  const categories = await res.json();
  const found = categories.find((c) => c.id === categoryId);
  categoryLabel.textContent = found ? found.name : '';
}

async function loadTags() {
  const res = await fetch(`/api/tags?cat=${encodeURIComponent(categoryId)}`);
  masterTags = await res.json();
  render();
}

function render() {
  tagManagerList.innerHTML = masterTags.length
    ? masterTags
        .map(
          (t) => `
            <span class="tag-row" style="background:${t.color}">
              <span class="tag-name">${t.name}</span>
              <input type="color" value="${t.color}" data-action="color" data-tag="${t.name}" />
              <button data-action="delete-tag" data-tag="${t.name}">✕</button>
            </span>
          `
        )
        .join('')
    : `<span class="muted">Todavía no hay etiquetas creadas.</span>`;
}

newTagForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newTagInput.value.trim();
  if (!name) return;
  const res = await fetch(`/api/tags?cat=${encodeURIComponent(categoryId)}`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  });
  masterTags = await res.json();
  newTagInput.value = '';
  render();
});

tagManagerList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete-tag"]');
  if (!btn) return;
  const res = await fetch(
    `/api/tags/${encodeURIComponent(btn.dataset.tag)}?cat=${encodeURIComponent(categoryId)}`,
    { method: 'DELETE', headers: adminHeaders() }
  );
  masterTags = await res.json();
  render();
});

tagManagerList.addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-action="color"]');
  if (!input) return;
  const res = await fetch(
    `/api/tags/${encodeURIComponent(input.dataset.tag)}/color?cat=${encodeURIComponent(categoryId)}`,
    {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ color: input.value }),
    }
  );
  masterTags = await res.json();
  render();
});

if (isAdmin && categoryId) {
  loadCategoryName();
  loadTags();
}
