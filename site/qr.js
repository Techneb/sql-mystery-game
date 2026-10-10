// QR code encoder (ISO/IEC 18004), byte mode, versions 1-40, levels L/M/Q/H.
// No dependency, no side effect: imported by the admin page and by test_site.mjs.

// Per level, indexed by version - 1: EC codewords per block, and number of blocks.
const EC_PER_BLOCK = {
  L: [7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  M: [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  Q: [13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  H: [17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
};
const BLOCKS = {
  L: [1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  M: [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  Q: [1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  H: [1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
};
const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 }; // the two level bits of the format information

// Modules left for codewords once the function patterns are drawn, in whole bytes.
function totalCodewords(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (ver >= 7) n -= 36;
  }
  return n >> 3;
}

const dataCodewords = (ver, ec) => totalCodewords(ver) - EC_PER_BLOCK[ec][ver - 1] * BLOCKS[ec][ver - 1];

// Centre coordinates of the alignment patterns: 6, then evenly spaced up to size - 7.
function alignmentCentres(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((size - 13) / (2 * n - 2)) * 2;
  const out = [6];
  for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
}

// GF(256) with the field polynomial x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
export const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
export const gfExp = (i) => EXP[i % 255];

// Generator (x - a^0)(x - a^1)...(x - a^(n-1)), coefficients highest power first, leading 1 dropped.
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= gfMul(c, EXP[i]); });
    g = next;
  }
  return g.slice(1);
}

// Reed-Solomon remainder of data * x^n divided by the generator: the n EC codewords.
function rsRemainder(data, n) {
  const g = rsGenerator(n), r = new Array(n).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    g.forEach((c, j) => { r[j] ^= gfMul(c, f); });
  }
  return r;
}

// BCH code of the format (5 bits, generator 0x537, mask 0x5412) and version (6 bits, generator 0x1f25).
function bch(value, dataBits, gen, genBits) {
  let r = value << (genBits - 1);
  for (let i = dataBits + genBits - 2; i >= genBits - 1; i--) if ((r >> i) & 1) r ^= gen << (i - genBits + 1);
  return (value << (genBits - 1)) | r;
}
const formatBits = (ec, mask) => bch((EC_BITS[ec] << 3) | mask, 5, 0x537, 11) ^ 0x5412;
const versionBits = (ver) => bch(ver, 6, 0x1f25, 13);

export const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// Step 1: the bit stream. Mode 0100, character count, the bytes, terminator, byte padding, 0xEC/0x11 pad.
function dataStream(bytes, ver, ec) {
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  put(4, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver, ec) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  return out;
}

// Step 2: split into blocks (the short ones first), add each block's EC, interleave data then EC.
function codewords(data, ver, ec) {
  const nb = BLOCKS[ec][ver - 1], ecn = EC_PER_BLOCK[ec][ver - 1];
  const shortLen = Math.floor(data.length / nb), longCount = data.length % nb;
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen + (i >= nb - longCount ? 1 : 0);
    blocks.push(data.slice(k, k + len));
    k += len;
  }
  const ecs = blocks.map((b) => rsRemainder(b, ecn));
  const out = [];
  for (let i = 0; i <= shortLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecn; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

// Step 3: the function patterns, with fn[r][c] marking every module data must skip.
function functionPatterns(ver) {
  const size = ver * 4 + 17;
  const m = [...Array(size)].map(() => new Array(size).fill(false));
  const fn = [...Array(size)].map(() => new Array(size).fill(false));
  const set = (r, c, dark) => { m[r][c] = dark; fn[r][c] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); } // timing
  for (const [fr, fc] of [[3, 3], [3, size - 4], [size - 4, 3]]) // finders and their separators
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
      const r = fr + dr, c = fc + dc, d = Math.max(Math.abs(dr), Math.abs(dc));
      if (r >= 0 && r < size && c >= 0 && c < size) set(r, c, d !== 2 && d !== 4);
    }
  const al = alignmentCentres(ver), last = al.length - 1;
  al.forEach((ar, i) => al.forEach((ac, j) => { // alignment, except where a finder sits
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      set(ar + dr, ac + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }));
  if (ver >= 7) { // version information, two 6x3 copies
    const v = versionBits(ver);
    for (let i = 0; i < 18; i++) {
      const dark = ((v >> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(b, a, dark); set(a, b, dark);
    }
  }
  drawFormat(m, fn, 0); // reserve the format areas; redrawn once the mask is chosen
  return { m, fn };
}

// Format information: bit i of the 15, two copies, plus the dark module.
function drawFormat(m, fn, bits) {
  const size = m.length;
  const set = (r, c, i) => { m[r][c] = ((bits >> i) & 1) === 1; fn[r][c] = true; };
  for (let i = 0; i < 6; i++) set(i, 8, i);
  set(7, 8, 6); set(8, 8, 7); set(8, 7, 8);
  for (let i = 9; i < 15; i++) set(8, 14 - i, i);
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, i);
  for (let i = 8; i < 15; i++) set(size - 15 + i, 8, i);
  m[size - 8][8] = true; fn[size - 8][8] = true;
}

// Step 4: place the codeword bits in two-column strips, right to left, zigzagging up and down,
// skipping the vertical timing column. Leftover remainder modules stay light.
// Returns the module positions in placement order (tests re-read the data through it).
export function dataPositions(ver) {
  const { fn } = functionPatterns(ver), size = fn.length, out = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((size - 1 - right) >> 1) % 2 === 0;
    for (let n = 0; n < size; n++) {
      const r = upward ? size - 1 - n : n;
      for (const c of [right, right - 1]) if (!fn[r][c]) out.push([r, c]);
    }
  }
  return out;
}

// Step 5: penalty score of a masked symbol, rules N1 to N4.
function penalty(m) {
  const size = m.length;
  let score = 0, dark = 0;
  const lines = [];
  for (let i = 0; i < size; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
  for (const line of lines) {
    for (let i = 0, run = 1; i < size; i++, run++) { // N1: runs of five or more of one colour
      if (i === size - 1 || line[i] !== line[i + 1]) { if (run >= 5) score += run - 2; run = 0; }
    }
    const s = line.map((d) => (d ? "1" : "0")).join(""); // N3: a finder-like 1:1:3:1:1 beside four light
    for (const p of ["10111010000", "00001011101"]) for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) score += 40;
  }
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (m[r][c]) dark++;
    if (r < size - 1 && c < size - 1) { // N2: 2x2 blocks of one colour
      const v = m[r][c];
      if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) score += 3;
    }
  }
  const total = size * size; // N4: 10 points per full 5% the dark share strays from half
  return score + 10 * Math.floor(Math.abs(dark * 20 - total * 10) / total);
}

// The module matrix (true = dark) of the smallest version fitting text at ecLevel.
// forceMask (0-7) skips the mask choice; tests use it to compare against a reference.
export function qrMatrix(text, ecLevel = "M", forceMask) {
  if (!(ecLevel in EC_BITS)) throw new Error("ecLevel must be L, M, Q or H");
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= 40 && 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver, ecLevel) * 8) ver++;
  if (ver > 40) throw new Error("text too long for a QR code");
  const { m, fn } = functionPatterns(ver), cw = codewords(dataStream(bytes, ver, ecLevel), ver, ecLevel);
  dataPositions(ver).forEach(([r, c], k) => { m[r][c] = k < cw.length * 8 && ((cw[k >> 3] >> (7 - (k & 7))) & 1) === 1; });
  const apply = (mask) => {
    const out = m.map((row, r) => row.map((d, c) => (fn[r][c] ? d : d !== MASKS[mask](r, c))));
    drawFormat(out, fn, formatBits(ecLevel, mask));
    return out;
  };
  if (forceMask !== undefined) return apply(forceMask);
  let best, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand = apply(mask), s = penalty(cand);
    if (s < bestScore) { best = cand; bestScore = s; }
  }
  return best;
}

// An SVG of the code: one path of unit squares, the quiet zone included, size px wide, scalable.
export function qrSvg(text, { ecLevel = "M", size = 256, quiet = 4, dark = "#000", light = "#fff" } = {}) {
  const m = qrMatrix(text, ecLevel), n = m.length + 2 * quiet;
  let d = "";
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="${light}"/><path fill="${dark}" d="${d}"/></svg>`;
}
