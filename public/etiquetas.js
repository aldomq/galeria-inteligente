let masterTags = [];

const tagManagerList = document.getElementById('tag-manager-list');
const newTagForm = document.getElementById('new-tag-form');
const newTagInput = document.getElementById('new-tag-input');

async function loadTags() {
  const res = await fetch('/api/tags');
  masterTags = await res.json();
  render();
}

function render() {
  tagManagerList.innerHTML = masterTags.length
    ? masterTags
        .map(
          (t) =>
            `<span class="tag">${t}<button data-action="delete-tag" data-tag="${t}">✕</button></span>`
        )
        .join('')
    : `<span class="muted">Todavía no hay etiquetas creadas.</span>`;
}

newTagForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newTagInput.value.trim();
  if (!name) return;
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  masterTags = await res.json();
  newTagInput.value = '';
  render();
});

tagManagerList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete-tag"]');
  if (!btn) return;
  const res = await fetch(`/api/tags/${encodeURIComponent(btn.dataset.tag)}`, {
    method: 'DELETE',
  });
  masterTags = await res.json();
  render();
});

loadTags();
