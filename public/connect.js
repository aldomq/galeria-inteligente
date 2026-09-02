let apiKey = '';
let clientId = '';
let accessToken = '';
let pickerLoaded = false;

const statusEl = document.getElementById('status');
const btn = document.getElementById('connect-btn');

function setStatus(text) {
  statusEl.textContent = text;
}

async function loadConfig() {
  const res = await fetch('/api/web-config');
  const config = await res.json();
  apiKey = config.apiKey;
  clientId = config.clientId;
}

function ensurePicker() {
  return new Promise((resolve) => {
    if (pickerLoaded) return resolve();
    gapi.load('picker', () => {
      pickerLoaded = true;
      resolve();
    });
  });
}

function openPicker() {
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setIncludeFolders(true);

  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .setCallback(onPicked)
    .build();

  picker.setVisible(true);
}

function onPicked(data) {
  if (data.action !== google.picker.Action.PICKED) return;
  const folder = data.docs[0];
  setStatus(`Carpeta elegida: "${folder.name}". Confirmando acceso permanente…`);
  requestPermanentAccess(folder.id, folder.name);
}

function requestPermanentAccess(folderId, folderName) {
  const codeClient = google.accounts.oauth2.initCodeClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    ux_mode: 'popup',
    callback: async (resp) => {
      if (!resp.code) {
        setStatus('No se pudo completar la autorización. Intenta de nuevo.');
        return;
      }
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: resp.code, folder_id: folderId, folder_name: folderName }),
      });
      if (res.ok) {
        setStatus(`Listo. La galería ahora usa la carpeta "${folderName}" de forma permanente.`);
      } else {
        const err = await res.json();
        setStatus('Error guardando la conexión: ' + (err.error || 'desconocido'));
      }
    },
  });
  codeClient.requestCode();
}

btn.addEventListener('click', async () => {
  setStatus('Abriendo selector de Google Drive…');
  await ensurePicker();

  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (resp) => {
      if (resp.error) {
        setStatus('No se pudo autorizar: ' + resp.error);
        return;
      }
      accessToken = resp.access_token;
      openPicker();
    },
  });
  tokenClient.requestAccessToken();
});

loadConfig();
