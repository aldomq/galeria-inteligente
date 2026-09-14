const adminToken = new URLSearchParams(location.search).get('t') || '';
const isAdmin = !!adminToken;

function adminHeaders(extra) {
  return Object.assign({ 'X-Admin-Token': adminToken }, extra || {});
}

let categories = [];

const categoryManagerList = document.getElementById('category-manager-list');
const newCategoryForm = document.getElementById('new-category-form');
const newCategoryInput = document.getElementById('new-category-input');
const categoryManagerSection = document.getElementById('category-manager-section');
const loginRequired = document.getElementById('login-required');

if (!isAdmin) {
  categoryManagerSection.hidden = true;
  loginRequired.hidden = false;
} else {
  const backLink = document.getElementById('back-link');
  if (backLink) backLink.href = 'index.html?t=' + encodeURIComponent(adminToken);
}

async function loadCategories() {
  const res = await fetch('/api/categories');
  categories = await res.json();
  render();
}

function render() {
  categoryManagerList.innerHTML = categories.length
    ? categories
        .map(
          (c) => `
            <span class="tag-row" style="background:var(--accent)">
              <span class="tag-name">${c.name}</span>
              <button data-action="delete-category" data-id="${c.id}">✕</button>
            </span>
          `
        )
        .join('')
    : `<span class="muted">Todavía no hay categorías creadas.</span>`;
}

newCategoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newCategoryInput.value.trim();
  if (!name) return;
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json();
    alert('No se pudo crear: ' + (err.error || 'error desconocido'));
    return;
  }
  categories = await res.json();
  newCategoryInput.value = '';
  render();
});

categoryManagerList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete-category"]');
  if (!btn) return;
  const ok = confirm(
    'Se va a quitar del menú, pero la carpeta y las fotos en Drive NO se borran. ¿Continuar?'
  );
  if (!ok) return;
  const res = await fetch(`/api/categories/${encodeURIComponent(btn.dataset.id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  categories = await res.json();
  render();
});

if (isAdmin) loadCategories();
