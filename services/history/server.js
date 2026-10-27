const express = require('express');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3001;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const CANVAS_URL = process.env.CANVAS_URL || 'http://localhost:3000';
const INTERVAL = parseInt(process.env.SNAPSHOT_SECONDS || '60', 10) * 1000;

const app = express();
let snapshots;

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'history' }));

app.get('/api/snapshots', async (req, res) => {
  try {
    const docs = await snapshots
      .find({}, { projection: { _id: 0, bucket: 1, takenAt: 1, count: 1 } })
      .sort({ bucket: 1 })
      .toArray();
    res.json(docs);
  } catch (err) {
    console.log('snapshot list failed:', err.message);
    res.status(503).json({ error: 'database not available' });
  }
});

app.get('/api/snapshots/:bucket', async (req, res) => {
  try {
    const doc = await snapshots.findOne({ bucket: req.params.bucket }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ error: 'no such snapshot' });
    res.json(doc);
  } catch (err) {
    console.log('snapshot read failed:', err.message);
    res.status(503).json({ error: 'database not available' });
  }
});

async function takeSnapshot() {
  const r = await fetch(`${CANVAS_URL}/api/canvas`);
  if (!r.ok) throw new Error(`canvas answered ${r.status}`);
  const canvas = await r.json();

  // the bucket is the start of the current interval, so if several replicas
  // run at once they overwrite the same document instead of piling up copies
  const bucket = new Date(Math.floor(Date.now() / INTERVAL) * INTERVAL).toISOString();
  await snapshots.updateOne(
    { bucket },
    {
      $set: {
        takenAt: new Date(),
        width: canvas.width,
        height: canvas.height,
        count: canvas.pixels.length,
        pixels: canvas.pixels
      }
    },
    { upsert: true }
  );
  console.log(`snapshot ${bucket}: ${canvas.pixels.length} pixels`);
}

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
  snapshots = client.db('pixelboard').collection('snapshots');
  await snapshots.createIndex({ bucket: 1 }, { unique: true });
  app.listen(PORT, () => console.log(`history listening on ${PORT}, snapshot every ${INTERVAL / 1000}s`));

  const tick = () => takeSnapshot().catch(err => console.log('snapshot failed:', err.message));
  tick();
  setInterval(tick, INTERVAL);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
