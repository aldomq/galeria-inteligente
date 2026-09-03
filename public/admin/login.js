const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  const submitBtn = form.querySelector('button');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Entrando…';

  try {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('login-user').value,
        password: document.getElementById('login-pass').value,
      }),
    });

    if (res.ok) {
      const { token } = await res.json();
      window.location.href = 'connect.html?t=' + encodeURIComponent(token);
    } else {
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  } catch (err) {
    errorEl.textContent = 'Error de conexión. Intenta de nuevo.';
    errorEl.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
  }
});
