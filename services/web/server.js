const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 8080;
const CANVAS_URL = process.env.CANVAS_URL || 'http://localhost:3000';
const HISTORY_URL = process.env.HISTORY_URL || 'http://localhost:3001';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'web' }));

// the browser only talks to this service, it forwards to the two backends
async function forward(res, url, init) {
  try {
    const r = await fetch(url, init);
    const body = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);
  } catch (err) {
    res.status(502).json({ error: `backend unreachable: ${err.message}` });
  }
}

app.get('/api/canvas', (req, res) => forward(res, `${CANVAS_URL}/api/canvas`));

app.put('/api/pixel', (req, res) =>
  forward(res, `${CANVAS_URL}/api/pixel`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': req.ip },
    body: JSON.stringify(req.body)
  })
);

app.get('/api/snapshots', (req, res) => forward(res, `${HISTORY_URL}/api/snapshots`));

app.get('/api/snapshots/:bucket', (req, res) =>
  forward(res, `${HISTORY_URL}/api/snapshots/${encodeURIComponent(req.params.bucket)}`)
);

app.listen(PORT, () => console.log(`web listening on ${PORT}`));
