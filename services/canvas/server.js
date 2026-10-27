const express = require('express');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const WIDTH = parseInt(process.env.CANVAS_WIDTH || '64', 10);
const HEIGHT = parseInt(process.env.CANVAS_HEIGHT || '64', 10);
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10);

const app = express();
app.set('trust proxy', true); // the web service forwards the real client address
app.use(express.json());

let pixels;

// small per-replica limiter, enough to stop one script from flooding an instance
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60000) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count++;
  hits.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'canvas' }));

app.get('/api/canvas', async (req, res) => {
  try {
    const docs = await pixels.find({}, { projection: { _id: 0, x: 1, y: 1, color: 1 } }).toArray();
    res.json({ width: WIDTH, height: HEIGHT, pixels: docs.map(p => [p.x, p.y, p.color]) });
  } catch (err) {
    console.log('canvas read failed:', err.message);
    res.status(503).json({ error: 'database not available' });
  }
});

app.put('/api/pixel', async (req, res) => {
  if (!allowed(req.ip)) return res.status(429).json({ error: 'slow down' });

  const { x, y, color } = req.body || {};
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return res.status(400).json({ error: 'x and y must be integers inside the canvas' });
  }
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'color must look like #rrggbb' });
  }

  const value = color.toLowerCase();
  try {
    await pixels.updateOne({ x, y }, { $set: { color: value, updatedAt: new Date() } }, { upsert: true });
    res.json({ x, y, color: value });
  } catch (err) {
    console.log('pixel write failed:', err.message);
    res.status(503).json({ error: 'database not available' });
  }
});

async function connectWithRetry() {
  for (;;) {
    try {
      const client = new MongoClient(MONGO_URL);
      await client.connect();
      return client;
    } catch (err) {
      console.log('mongo not ready yet, retrying in 5s');
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function main() {
  const client = await connectWithRetry();
  pixels = client.db('pixelboard').collection('pixels');
  await pixels.createIndex({ x: 1, y: 1 }, { unique: true });
  app.listen(PORT, () => console.log(`canvas listening on ${PORT}, grid ${WIDTH}x${HEIGHT}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
