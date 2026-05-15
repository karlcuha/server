const STORAGE_KEY = 'downloadedInternetContent';

const keywordForm = document.querySelector('#keywordForm');
const keywordInput = document.querySelector('#keywordInput');
const keywordsHint = document.querySelector('#keywordsHint');
const message = document.querySelector('#message');
const urlList = document.querySelector('#urlList');
const downloadStatus = document.querySelector('#downloadStatus');
const downloadSize = document.querySelector('#downloadSize');
const downloadProgress = document.querySelector('#downloadProgress');
const savedList = document.querySelector('#savedList');
const contentViewer = document.querySelector('#contentViewer');
const clearStorageBtn = document.querySelector('#clearStorageBtn');

function showMessage(text, type = '') {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return 'неизвестно';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function getSavedItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadKeywordsHint() {
  try {
    const response = await fetch('/api/keywords');
    const data = await response.json();
    keywordsHint.textContent = `Доступные ключевые слова: ${data.keywords.join(', ')}`;
  } catch {
    keywordsHint.textContent = 'Не удалось загрузить список ключевых слов.';
  }
}

async function loadUrlsByKeyword(keyword) {
  const response = await fetch(`/api/urls?keyword=${encodeURIComponent(keyword)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Ошибка получения URL от сервера.');
  }

  return data.urls;
}

function renderUrls(urls) {
  urlList.className = 'list';
  urlList.innerHTML = '';

  urls.forEach((url) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-title">${escapeHtml(url)}</div>
      <div class="list-actions">
        <button type="button">Скачать через сервер</button>
      </div>
    `;
    item.querySelector('button').addEventListener('click', () => downloadContent(url));
    urlList.appendChild(item);
  });
}

function renderSavedList() {
  const items = getSavedItems();
  savedList.innerHTML = '';

  if (!items.length) {
    savedList.className = 'list empty';
    savedList.textContent = 'Сохранённых материалов пока нет.';
    contentViewer.textContent = 'Выберите сохранённый материал.';
    return;
  }

  savedList.className = 'list';

  items.forEach((item) => {
    const node = document.createElement('div');
    node.className = 'list-item';
    node.innerHTML = `
      <div class="list-item-title">${escapeHtml(item.url)}</div>
      <div class="list-item-meta">
        ${escapeHtml(item.savedAt)} · ${formatBytes(item.size)} · ${escapeHtml(item.contentType || 'тип неизвестен')}
      </div>
      <div class="list-actions">
        <button type="button" data-action="open">Показать</button>
        <button class="secondary" type="button" data-action="delete">Удалить</button>
      </div>
    `;

    node.querySelector('[data-action="open"]').addEventListener('click', () => {
      contentViewer.textContent = item.content;
    });

    node.querySelector('[data-action="delete"]').addEventListener('click', () => {
      const filtered = getSavedItems().filter((saved) => saved.id !== item.id);
      saveItems(filtered);
      renderSavedList();
      showMessage('Материал удалён из LocalStorage.', 'success');
    });

    savedList.appendChild(node);
  });
}

async function downloadContent(url) {
  showMessage('');
  downloadStatus.textContent = 'Загрузка началась...';
  downloadSize.textContent = '';
  downloadProgress.value = 0;
  downloadProgress.removeAttribute('max');

  try {
    const response = await fetch(`/api/download?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      let errorMessage = 'Ошибка загрузки контента.';
      try {
        const data = await response.json();
        errorMessage = data.error || errorMessage;
      } catch {
        // Response is not JSON.
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('Браузер не поддерживает потоковую загрузку через Fetch API.');
    }

    const totalSize = Number(response.headers.get('x-total-size') || response.headers.get('content-length') || 0);
    const contentType = response.headers.get('content-type') || 'text/plain';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let downloaded = 0;
    let content = '';

    if (totalSize > 0) {
      downloadProgress.max = 100;
      downloadSize.textContent = `Размер: ${formatBytes(totalSize)}`;
    } else {
      downloadSize.textContent = 'Размер: неизвестно';
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      downloaded += value.byteLength;
      content += decoder.decode(value, { stream: true });

      if (totalSize > 0) {
        const percent = Math.round((downloaded / totalSize) * 100);
        downloadProgress.value = Math.min(percent, 100);
        downloadStatus.textContent = `Загружено ${percent}% (${formatBytes(downloaded)})`;
      } else {
        downloadStatus.textContent = `Загружено ${formatBytes(downloaded)}`;
      }
    }

    content += decoder.decode();

    const savedItem = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      url,
      content,
      contentType,
      size: downloaded,
      savedAt: new Date().toLocaleString('ru-RU')
    };

    const currentItems = getSavedItems();
    currentItems.unshift(savedItem);

    try {
      saveItems(currentItems);
    } catch {
      throw new Error('Не удалось сохранить данные: превышен лимит LocalStorage. Попробуйте скачать меньший материал или очистить хранилище.');
    }

    downloadProgress.max = 100;
    downloadProgress.value = 100;
    downloadStatus.textContent = `Готово: ${formatBytes(downloaded)} сохранено оффлайн.`;
    showMessage('Контент успешно сохранён в LocalStorage.', 'success');
    renderSavedList();
    contentViewer.textContent = content;
  } catch (error) {
    downloadProgress.max = 100;
    downloadProgress.value = 0;
    downloadStatus.textContent = 'Загрузка остановлена.';
    showMessage(error.message || 'Произошла неизвестная ошибка.', 'error');
  }
}

keywordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const keyword = keywordInput.value.trim();

  if (!keyword) {
    showMessage('Введите ключевое слово.', 'error');
    return;
  }

  showMessage('Идёт запрос URL у сервера...');
  urlList.className = 'list empty';
  urlList.textContent = 'Загрузка списка URL...';

  try {
    const urls = await loadUrlsByKeyword(keyword);
    renderUrls(urls);
    showMessage(`Найдено URL: ${urls.length}`, 'success');
  } catch (error) {
    urlList.className = 'list empty';
    urlList.textContent = 'URL не найдены.';
    showMessage(error.message, 'error');
  }
});

clearStorageBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  renderSavedList();
  showMessage('LocalStorage очищен.', 'success');
});

loadKeywordsHint();
renderSavedList();
