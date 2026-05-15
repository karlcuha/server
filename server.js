const express = require('express');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Keyword -> URL mapping stored on the server.
// You can add your own keywords and links here.
const keywordUrlMap = {
  javascript: [
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs',
    'https://javascript.info/'
  ],
  nodejs: [
    'https://nodejs.org/en',
    'https://expressjs.com/',
    'https://nodejs.org/en/learn'
  ],
  html: [
    'https://developer.mozilla.org/en-US/docs/Web/HTML',
    'https://html.spec.whatwg.org/',
    'https://web.dev/learn/html/'
  ],
  css: [
    'https://developer.mozilla.org/en-US/docs/Web/CSS',
    'https://web.dev/learn/css/',
    'https://css-tricks.com/snippets/css/a-guide-to-flexbox/'
  ]
};

const allowedUrls = new Set(Object.values(keywordUrlMap).flat());

function normalizeKeyword(value) {
  return String(value || '').trim().toLowerCase();
}

function isAllowedHttpUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return ['http:', 'https:'].includes(parsed.protocol) && allowedUrls.has(parsed.toString());
  } catch {
    return false;
  }
}

app.get('/api/keywords', (_req, res) => {
  res.json({ keywords: Object.keys(keywordUrlMap) });
});

app.get('/api/urls', (req, res) => {
  const keyword = normalizeKeyword(req.query.keyword);

  if (!keyword) {
    return res.status(400).json({ error: 'Введите ключевое слово.' });
  }

  const urls = keywordUrlMap[keyword];
  if (!urls) {
    return res.status(404).json({ error: `По ключевому слову "${keyword}" URL не найдены.` });
  }

  res.json({ keyword, urls });
});

app.get('/api/download', async (req, res) => {
  const rawUrl = String(req.query.url || '');

  if (!isAllowedHttpUrl(rawUrl)) {
    return res.status(400).json({ error: 'URL запрещён или отсутствует в серверном списке.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const upstream = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'HTTP-Info-Student-App/1.0'
      }
    });

    clearTimeout(timeout);

    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({
        error: `Не удалось скачать ресурс. HTTP статус: ${upstream.status}`
      });
    }

    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    const totalSize = upstream.headers.get('content-length') || '0';

    // These headers allow the client to show total size and content type.
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Source-Url', rawUrl);
    res.setHeader('X-Total-Size', totalSize);
    res.setHeader('Cache-Control', 'no-store');

    if (totalSize !== '0') {
      res.setHeader('Content-Length', totalSize);
    }

    const reader = upstream.body.getReader();
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      downloaded += value.byteLength;
      // Server-side progress is calculated here and transmitted as a stream.
      // The client receives chunks and calculates visible progress.
      res.write(Buffer.from(value));
    }

    res.end();
    console.log(`Downloaded ${downloaded} bytes from ${rawUrl}`);
  } catch (error) {
    clearTimeout(timeout);

    if (!res.headersSent) {
      const message = error.name === 'AbortError'
        ? 'Превышено время ожидания загрузки.'
        : 'Ошибка при загрузке ресурса через сервер.';
      return res.status(500).json({ error: message });
    }

    res.end();
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Маршрут не найден.' });
});

app.listen(PORT, () => {
  console.log(`Server is running: http://localhost:${PORT}`);
});
