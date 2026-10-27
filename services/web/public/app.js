const board = document.getElementById('board');
const ctx = board.getContext('2d');
const colorInput = document.getElementById('color');
const status = document.getElementById('status');

const SCALE = 10;
let width = 64;
let height = 64;
let replaying = false;

function resize() {
  board.width = width;
  board.height = height;
  board.style.width = width * SCALE + 'px';
  board.style.height = height * SCALE + 'px';
}

function draw(pixels) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  for (const [x, y, color] of pixels) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }
}

async function refresh() {
  if (replaying) return;
  const r = await fetch('/api/canvas');
  if (!r.ok) {
    status.textContent = 'canvas service not answering';
    return;
  }
  const data = await r.json();
  if (data.width !== width || data.height !== height) {
    width = data.width;
    height = data.height;
    resize();
  }
  draw(data.pixels);
  status.textContent = `${data.pixels.length} pixels painted`;
}

board.addEventListener('click', async ev => {
  const rect = board.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / rect.width * width);
  const y = Math.floor((ev.clientY - rect.top) / rect.height * height);
  const color = colorInput.value;

  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);

  const r = await fetch('/api/pixel', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ x, y, color })
  });
  if (r.status === 429) status.textContent = 'too fast, wait a bit';
  else if (!r.ok) status.textContent = 'pixel rejected';
});

document.getElementById('replay').addEventListener('click', async () => {
  const list = await (await fetch('/api/snapshots')).json();
  if (!list.length) {
    status.textContent = 'no snapshots yet';
    return;
  }
  replaying = true;
  for (const s of list) {
    const snap = await (await fetch('/api/snapshots/' + encodeURIComponent(s.bucket))).json();
    draw(snap.pixels);
    status.textContent = `replay ${new Date(s.bucket).toLocaleTimeString()} (${snap.count} pixels)`;
    await new Promise(r => setTimeout(r, 400));
  }
  replaying = false;
  refresh();
});

resize();
refresh();
setInterval(refresh, 2000);
