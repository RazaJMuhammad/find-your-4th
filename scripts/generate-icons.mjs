import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const bg = [0xf6, 0xf5, 0xf2];
const ink = [0x1a, 0x1a, 0x1a];
const accent = [0x0f, 0x51, 0x32];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, rgb) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(buf, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 3;
  buf[i] = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
}

function fillRoundRect(buf, size, x, y, width, height, radius, color) {
  const r = Math.min(radius, width / 2, height / 2);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + width);
  const y1 = Math.ceil(y + height);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      if (cx < x || cy < y || cx >= x + width || cy >= y + height) continue;
      let nx = cx;
      let ny = cy;
      const inCornerX = cx < x + r || cx >= x + width - r;
      const inCornerY = cy < y + r || cy >= y + height - r;
      if (inCornerX && inCornerY) {
        nx = cx < x + r ? x + r : x + width - r;
        ny = cy < y + r ? y + r : y + height - r;
        const dx = cx - nx;
        const dy = cy - ny;
        if (dx * dx + dy * dy > r * r) continue;
      }
      setPixel(buf, size, px, py, color);
    }
  }
}

function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 3);
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = bg[0];
    buf[i + 1] = bg[1];
    buf[i + 2] = bg[2];
  }
  const inset = maskable ? size * 0.12 : size * 0.04;
  const scale = (size - inset * 2) / 64;
  const squares = [
    [10, ink],
    [22, ink],
    [34, ink],
    [46, accent],
  ];
  for (const [sx, color] of squares) {
    fillRoundRect(buf, size, inset + sx * scale, inset + 28 * scale, 8 * scale, 8 * scale, 2 * scale, color);
  }
  return png(size, buf);
}

mkdirSync(root, { recursive: true });
writeFileSync(join(root, "icon-192.png"), draw(192, false));
writeFileSync(join(root, "icon-512.png"), draw(512, false));
writeFileSync(join(root, "apple-touch-icon.png"), draw(180, false));
writeFileSync(join(root, "icon-maskable-192.png"), draw(192, true));
writeFileSync(join(root, "icon-maskable-512.png"), draw(512, true));
console.log("wrote icons");
