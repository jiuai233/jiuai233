import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(ROOT, "cards");
const CACHE = join(ROOT, ".cache");
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

// ── 数据 ────────────────────────────────────────────────────────────────

type Repo = {
  name: string;
  isFork: boolean;
  languages: { edges: { size: number; node: { name: string } }[] };
};

const user = JSON.parse(readFileSync(join(ROOT, "data/stats.json"), "utf8")).data.user;
const photo = readFileSync(join(ROOT, "data/cheki.jpg")).toString("base64");
const BILI: { name: string; face: string } = {
  name: JSON.parse(readFileSync(join(ROOT, "data/bili.json"), "utf8")).name,
  face: readFileSync(join(ROOT, "data/bili-face.jpg")).toString("base64"),
};

const repos: Repo[] = user.repositories.nodes;
const own = repos.filter((r) => !r.isFork && r.name !== user.login);

const langBytes = new Map<string, number>();
for (const r of own) {
  for (const e of r.languages.edges) {
    langBytes.set(e.node.name, (langBytes.get(e.node.name) ?? 0) + e.size);
  }
}
const langTotal = [...langBytes.values()].reduce((a, b) => a + b, 0);
const langSorted = [...langBytes].sort((a, b) => b[1] - a[1]);
const langs = langSorted.slice(0, 3).map(([name, size]) => ({ name, pct: (size / langTotal) * 100 }));
const otherPct = 100 - langs.reduce((a, l) => a + l.pct, 0);
if (otherPct > 0.5) langs.push({ name: "其他", pct: otherPct });

// ── 配色（Pi prism 马卡龙）──────────────────────────────────────────────

const FILL = {
  orange: "#f5a66e",
  blue: "#9fbffc",
  pink: "#e99bc5",
  yellow: "#f2d38c",
  cyan: "#64d6d0",
  violet: "#c5acfa",
  green: "#9ad9ac",
};

type Theme = {
  name: "dark" | "light";
  text: string;
  muted: string;
  faint: string;
  orange: string;
  blue: string;
  pink: string;
  yellow: string;
  // 实体硬件（LED 招牌 / 效果器板）：明暗主题都保持真实深色机身质感
  chassis: string;
  chassisEdge: string;
  board: string;
  boardRail: string;
  boardEdge: string;
  ledOff: string;
  led: [string, string, string];
  spot: number;
  glow: number;
  // 纸质物件（拍立得 / 门票 / 通行证）
  ink: string;
  paper: string;
  ticket: string;
  ticketEdge: string;
  passBg: string;
  passEdge: string;
  highlight: number;
  cable: string;
  shadow: number;
  pedalEdge: string;
};

const DARK: Theme = {
  name: "dark",
  text: "#f1edf8",
  muted: "#bdb4ca",
  faint: "#8e85a0",
  orange: FILL.orange,
  blue: FILL.blue,
  pink: FILL.pink,
  yellow: FILL.yellow,
  chassis: "#181620",
  chassisEdge: "#383247",
  board: "#191722",
  boardRail: "#242030",
  boardEdge: "#393349",
  ledOff: "#262232",
  led: [FILL.orange, FILL.pink, FILL.blue],
  spot: 0.24,
  glow: 0.7,
  ink: "#2b2635",
  paper: "#f8f4ee",
  ticket: "#221f2d",
  ticketEdge: "#403952",
  passBg: "#221f2d",
  passEdge: "#443d57",
  highlight: 0.22,
  cable: "#0c0b10",
  shadow: 0.55,
  pedalEdge: "rgba(255,255,255,0.12)",
};

const LIGHT: Theme = {
  name: "light",
  text: "#2b2635",
  muted: "#5f5870",
  faint: "#827a96",
  orange: "#c45f1c",
  blue: "#3566c9",
  pink: "#bf4883",
  yellow: "#9a6b00",
  chassis: "#23202d",
  chassisEdge: "#3e394d",
  board: "#262332",
  boardRail: "#322e42",
  boardEdge: "#464059",
  ledOff: "#332e42",
  led: [FILL.orange, FILL.pink, FILL.blue],
  spot: 0.2,
  glow: 0.55,
  ink: "#2b2635",
  paper: "#ffffff",
  ticket: "#fcf9f4",
  ticketEdge: "#ddd4c8",
  passBg: "#ffffff",
  passEdge: "#e0d7ec",
  highlight: 0.34,
  cable: "#2d2838",
  shadow: 0.22,
  pedalEdge: "rgba(43,38,53,0.16)",
};

// ── 字体：按卡片实际用到的字向 Google Fonts 要子集，内嵌成 data URI ─────

const STACK = {
  display: ["Dela Gothic One", "ZCOOL QingKe HuangYou", "Noto Sans SC"],
  zh: ["ZCOOL KuaiLe", "Noto Sans SC"],
  body: ["Noto Sans SC"],
  mono: ["JetBrains Mono", "Noto Sans SC"],
  hand: ["Yomogi", "Noto Sans SC"],
  pop: ["Fredoka", "ZCOOL KuaiLe", "Noto Sans SC"],
} as const;
type Role = keyof typeof STACK;

const SPEC: Record<string, string> = {
  "Dela Gothic One": "Dela+Gothic+One",
  "ZCOOL QingKe HuangYou": "ZCOOL+QingKe+HuangYou",
  "ZCOOL KuaiLe": "ZCOOL+KuaiLe",
  "Noto Sans SC": "Noto+Sans+SC:wght@400;500;700",
  "JetBrains Mono": "JetBrains+Mono:wght@400;700",
  Yomogi: "Yomogi",
  Fredoka: "Fredoka:wght@700",
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function cached(key: string, url: string): Promise<Buffer> {
  const file = join(CACHE, createHash("sha1").update(key).digest("hex"));
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

async function fontFaces(chars: Map<string, Set<string>>): Promise<string> {
  const out: string[] = [];
  for (const [family, set] of chars) {
    const text = [...set].filter((ch) => ch.trim()).sort().join("");
    if (!text) continue;
    const url = `https://fonts.googleapis.com/css2?family=${SPEC[family]}&text=${encodeURIComponent(text)}`;
    const css = (await cached(url, url)).toString("utf8");
    const weightsBySrc = new Map<string, number[]>();
    for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
      const src = /url\(([^)]+)\)/.exec(m[1])?.[1];
      if (!src) continue;
      const weight = Number(/font-weight:\s*(\d+)/.exec(m[1])?.[1] ?? 400);
      weightsBySrc.set(src, [...(weightsBySrc.get(src) ?? []), weight]);
    }
    for (const [src, weights] of weightsBySrc) {
      const data = (await cached(src, src)).toString("base64");
      const lo = Math.min(...weights);
      const hi = Math.max(...weights);
      out.push(`@font-face{font-family:'${family}';font-weight:${lo === hi ? lo : `${lo} ${hi}`};src:url(data:font/woff2;base64,${data}) format('woff2')}`);
    }
  }
  return out.join("");
}

// ── SVG 小工具 ──────────────────────────────────────────────────────────

const n = (v: number) => String(Math.round(v * 100) / 100);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isWide = (ch: string) => /[\u2e80-\uffff]/.test(ch);

function measure(s: string, size: number, mono = false): number {
  let w = 0;
  for (const ch of s) w += isWide(ch) ? size : size * (mono ? 0.6 : 0.56);
  return w;
}

function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Seg = [string, string?, string?];
type TextOpts = {
  role?: Role;
  size?: number;
  weight?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  ls?: number;
  opacity?: number;
  attrs?: string;
};

class Card {
  chars = new Map<string, Set<string>>();
  css: string[] = [];
  defs: string[] = [];
  body: string[] = [];

  readonly t: Theme;
  readonly w: number;
  readonly h: number;

  constructor(t: Theme, w: number, h: number) {
    this.t = t;
    this.w = w;
    this.h = h;
  }

  add(...parts: string[]) {
    this.body.push(...parts);
  }

  text(x: number, y: number, content: string | Seg[], o: TextOpts = {}): string {
    const role = o.role ?? "body";
    const segs: Seg[] = typeof content === "string" ? [[content]] : content;
    for (const family of STACK[role]) {
      const set = this.chars.get(family) ?? new Set<string>();
      for (const [s] of segs) for (const ch of s) set.add(ch);
      this.chars.set(family, set);
    }
    const family = STACK[role].map((f) => `'${f}'`).join(",") + (role === "mono" ? ",monospace" : ",sans-serif");
    const attrs = [
      `x="${n(x)}"`,
      `y="${n(y)}"`,
      `font-family="${family}"`,
      `font-size="${o.size ?? 14}"`,
      o.weight ? `font-weight="${o.weight}"` : "",
      `fill="${o.fill ?? this.t.text}"`,
      o.anchor && o.anchor !== "start" ? `text-anchor="${o.anchor}"` : "",
      o.ls ? `letter-spacing="${o.ls}"` : "",
      o.opacity !== undefined ? `opacity="${o.opacity}"` : "",
      o.attrs ?? "",
    ].filter(Boolean);
    const inner = segs
      .map(([s, fill, extra]) => (fill || extra ? `<tspan${fill ? ` fill="${fill}"` : ""}${extra ? ` ${extra}` : ""}>${esc(s)}</tspan>` : esc(s)))
      .join("");
    return `<text ${attrs.join(" ")} xml:space="preserve">${inner}</text>`;
  }

  render(fonts: string, label: string): string {
    const motion = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><defs><style>${fonts}${this.css.join("")}${motion}</style>${this.defs.join("")}</defs>${this.body.join("")}</svg>\n`;
  }
}

const PICK = "M0,-7 C5.5,-7 8,-4.5 8,-1 C8,3.5 3,8 0,10 C-3,8 -8,3.5 -8,-1 C-8,-4.5 -5.5,-7 0,-7 Z";
const SPARK = (s: number) => `M0,${-s} Q0,0 ${s},0 Q0,0 0,${s} Q0,0 ${-s},0 Q0,0 0,${-s} Z`;
const HEART = "M0,4 C0,0 -6,-2 -8,2 C-10,6 -4,10 0,13 C4,10 10,6 8,2 C6,-2 0,0 0,4 Z";
const BOLT = "M2,-13 L-8,2 H-1 L-3,13 L8,-3 H1 Z";

function star(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90) * Math.PI) / 180;
    const d = i % 2 ? r * 0.48 : r;
    pts.push(`${n(Math.cos(a) * d)},${n(Math.sin(a) * d)}`);
  }
  return `M${pts.join(" L")} Z`;
}

type Decal = { cut: string; body: string };

function sticker(t: Theme, x: number, y: number, rot: number, scale: number, { cut, body }: Decal, edge = 3.5): string {
  const at = `rotate(${rot}) scale(${scale})`;
  const outline = `stroke-width="${n((edge * 2) / scale)}" stroke-linejoin="round" stroke-linecap="round"`;
  return [
    `<g transform="translate(${x} ${y})">`,
    `<g transform="translate(1.5 2.5)" opacity="${t.shadow * 0.85}"><g transform="${at}" fill="#000" stroke="#000" ${outline}>${cut}</g></g>`,
    `<g transform="${at}" fill="#fff" stroke="#fff" ${outline}>${cut}</g>`,
    `<g transform="${at}">${body}</g>`,
    `</g>`,
  ].join("");
}

const DECAL = {
  star: (fill: string): Decal => ({ cut: `<path d="${star(12)}"/>`, body: `<path d="${star(12)}" fill="${fill}"/>` }),
  heart: (fill: string): Decal => ({ cut: `<path d="${HEART}"/>`, body: `<path d="${HEART}" fill="${fill}"/>` }),
  bolt: (fill: string): Decal => ({ cut: `<path d="${BOLT}"/>`, body: `<path d="${BOLT}" fill="${fill}"/>` }),
  pick: (fill: string): Decal => ({ cut: `<path d="${PICK}"/>`, body: `<path d="${PICK}" fill="${fill}"/>` }),
  guitar: (fill: string, ink: string): Decal => {
    const shape = `<rect x="-4" y="-34" width="8" height="12" rx="2.5"/><rect x="-2.2" y="-24" width="4.4" height="27"/><circle cx="0" cy="3" r="8.5"/><circle cx="0" cy="15" r="12"/>`;
    return {
      cut: shape,
      body: [
        `<g fill="${ink}"><rect x="-4" y="-34" width="8" height="12" rx="2.5"/><rect x="-2.2" y="-24" width="4.4" height="27"/></g>`,
        `<circle cx="0" cy="3" r="8.5" fill="${fill}"/><circle cx="0" cy="15" r="12" fill="${fill}"/>`,
        `<rect x="-5" y="4" width="10" height="3.2" rx="1" fill="#fff"/><rect x="-5" y="10.5" width="10" height="3.2" rx="1" fill="#fff"/>`,
        `<rect x="-4" y="18" width="8" height="2" rx="1" fill="${ink}"/>`,
        `<circle cx="6.5" cy="21" r="1.8" fill="${ink}"/><circle cx="8.5" cy="15.5" r="1.8" fill="${ink}"/>`,
      ].join(""),
    };
  },
};

function screw(cx: number, cy: number, fill = "#353045", stroke = "#625a78"): string {
  return `<circle cx="${cx}" cy="${cy}" r="3.6" fill="${fill}" stroke="${stroke}" stroke-width="1"/><path d="M${cx - 2.2},${cy} H${cx + 2.2}" stroke="${stroke}" stroke-width="1"/>`;
}

// ── 1 · 主视觉拼贴：LED 招牌 + 拍立得 + 独白 + Demo 磁带（透明底）────

const GLYPHS: Record<string, string[]> = {
  J: ["#####", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
};

function hero(t: Theme): Card {
  const c = new Card(t, 900, 480);

  c.defs.push(
    `<filter id="sh" x="-12%" y="-12%" width="128%" height="132%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="${t.shadow}"/></filter>`,
    `<filter id="shSoft" x="-12%" y="-12%" width="128%" height="132%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="${t.shadow * 0.85}"/></filter>`,
    `<filter id="glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>`,
  );

  // ── 顶部：Live House LED 招牌灯箱 ──
  const mx = 34;
  const my = 16;
  const mw = 832;
  const mh = 164;
  c.defs.push(
    `<clipPath id="mqClip"><rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="18"/></clipPath>`,
    `<linearGradient id="spA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FILL.orange}" stop-opacity="${t.spot}"/><stop offset="1" stop-color="${FILL.orange}" stop-opacity="0"/></linearGradient>`,
    `<linearGradient id="spB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FILL.blue}" stop-opacity="${t.spot}"/><stop offset="1" stop-color="${FILL.blue}" stop-opacity="0"/></linearGradient>`,
  );
  c.css.push(
    ".spot{transform-box:view-box}",
    ".spa{transform-origin:170px 0px;animation:spa 7s ease-in-out infinite alternate}",
    ".spb{transform-origin:730px 0px;animation:spb 8s ease-in-out infinite alternate}",
    "@keyframes spa{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}",
    "@keyframes spb{from{transform:rotate(16deg)}to{transform:rotate(-16deg)}}",
    ".sweep{animation:sweep 5.5s ease-in-out infinite}",
    "@keyframes sweep{0%{transform:translateX(0)}55%,100%{transform:translateX(1060px)}}",
    ".tw{transform-box:fill-box;transform-origin:center;animation:tw 2.8s ease-in-out infinite}",
    "@keyframes tw{0%,100%{opacity:.25;transform:scale(.55)}50%{opacity:1;transform:scale(1)}}",
    ".reel{transform-box:fill-box;transform-origin:center;animation:reel 2.6s linear infinite}",
    "@keyframes reel{to{transform:rotate(360deg)}}",
  );

  // 灯箱外壳
  c.add(
    `<g filter="url(#sh)">`,
    `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="18" fill="${t.chassis}" stroke="${t.chassisEdge}" stroke-width="1.5"/>`,
    `</g>`,
    `<g clip-path="url(#mqClip)">`,
    `<polygon class="spot spa" points="170,0 30,200 310,200" fill="url(#spA)"/>`,
    `<polygon class="spot spb" points="730,0 590,200 870,200" fill="url(#spB)"/>`,
    `</g>`,
  );

  // 灯箱顶部极细刻字（替代大标题栏，不做面板头）
  c.add(
    `<circle cx="${mx + 22}" cy="${my + 18}" r="3" fill="${FILL.orange}"/>`,
    c.text(mx + 33, my + 22, "ONE-MAN LIVE · ワンマンライブ", { role: "mono", size: 10, fill: "#b6aec9", ls: 1.8 }),
    c.text(mx + mw - 22, my + 22, "LIVE HOUSE · GITHUB", { role: "mono", size: 10, fill: "#8e85a6", anchor: "end", ls: 1.6 }),
  );

  // LED 点阵
  const word = "JIUAI233";
  const gridC = word.length * 6 - 1 + 4; // 51
  const gridR = 9;
  const bx = mx + 20;
  const bw = mw - 40; // 792
  const p = bw / gridC;
  const bh = gridR * p; // ~139.7 -> 稍微压缩高度用 792 宽会偏高，改 720 宽更修长利落
  const ledW = 736;
  const ledX = mx + (mw - ledW) / 2;
  const lp = ledW / gridC;
  const ledH = gridR * lp; // ~129.9
  const ledY = my + 32;
  const s = lp * 0.8;
  const g = (lp - s) / 2;
  const rx = s * 0.25;
  void bx;
  void bw;
  void p;
  void bh;

  c.defs.push(
    `<pattern id="led" x="${n(ledX)}" y="${n(ledY)}" width="${n(lp)}" height="${n(lp)}" patternUnits="userSpaceOnUse"><rect x="${n(g)}" y="${n(g)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="${t.ledOff}"/></pattern>`,
    `<linearGradient id="ledGrad" gradientUnits="userSpaceOnUse" x1="${n(ledX + 2 * lp)}" y1="0" x2="${n(ledX + ledW - 2 * lp)}" y2="0"><stop offset="0" stop-color="${t.led[0]}"/><stop offset="0.5" stop-color="${t.led[1]}"/><stop offset="1" stop-color="${t.led[2]}"/></linearGradient>`,
    `<linearGradient id="sweepGrad" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
  );

  const lit: string[] = [];
  [...word].forEach((ch, i) => {
    const rows = GLYPHS[ch];
    rows.forEach((row, r) =>
      [...row].forEach((cell, col) => {
        if (cell !== "#") return;
        const x = ledX + (2 + i * 6 + col) * lp + g;
        const y = ledY + (1 + r) * lp + g;
        lit.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}"/>`);
      }),
    );
  });
  c.defs.push(`<g id="lit">${lit.join("")}</g>`, `<clipPath id="litClip">${lit.join("")}</clipPath>`);

  c.add(
    `<rect x="${n(ledX - 8)}" y="${n(ledY - 2)}" width="${n(ledW + 16)}" height="${n(ledH + 4)}" rx="10" fill="#12101a"/>`,
    `<rect x="${n(ledX)}" y="${n(ledY)}" width="${n(ledW)}" height="${n(ledH)}" rx="8" fill="url(#led)"/>`,
    `<use href="#lit" fill="url(#ledGrad)" filter="url(#glow)" opacity="${t.glow}"/>`,
    `<use href="#lit" fill="url(#ledGrad)"/>`,
    `<g clip-path="url(#litClip)"><g class="sweep"><rect x="-140" y="${n(ledY)}" width="110" height="${n(ledH)}" fill="url(#sweepGrad)" transform="skewX(-18)"/></g></g>`,
  );

  // 灯箱角落螺丝 + 破框贴纸（放在右下边框，不挡顶部文字）
  for (const [sx, sy] of [[mx + 14, my + mh - 14], [mx + mw - 14, my + mh - 14]]) {
    c.add(screw(sx, sy));
  }
  c.add(
    sticker(t, mx + mw - 6, my + mh - 18, 18, 0.9, DECAL.bolt(FILL.orange)),
    sticker(t, mx + mw - 38, my + mh - 4, -14, 0.82, DECAL.star(FILL.yellow)),
  );

  // ── 右中：独白手写条 + 柔和荧光笔底纹 ──
  const qx = 648;
  const qy = 228;
  c.add(
    `<rect x="444" y="${qy - 11}" width="408" height="14" rx="7" fill="${FILL.yellow}" opacity="${t.highlight}" transform="rotate(-0.6 648 ${qy - 4})"/>`,
    c.text(qx, qy, [["「", t.orange], ["自己一个人也没关系，声音总会被听见"], ["」", t.orange]], { role: "zh", size: 22.5, anchor: "middle" }),
  );
  for (const [x, y, r, fill, delay] of [
    [438, 210, 5, FILL.yellow, 0],
    [860, 218, 5.5, FILL.pink, -1.2],
    [838, 244, 3.8, FILL.blue, -0.6],
  ] as [number, number, number, string, number][]) {
    c.add(`<g transform="translate(${x} ${y})"><path class="tw" d="${SPARK(r)}" fill="${fill}" style="animation-delay:${delay}s"/></g>`);
  }

  // ── 左下（和纸胶带粘住灯箱下沿，不挡灯珠）：宽幅拍立得 ──
  const fw = 368;
  const fh = 290;
  const fx = 42;
  const fy = 174;
  c.defs.push(`<clipPath id="ph"><rect x="16" y="20" width="336" height="209" rx="2"/></clipPath>`);
  c.add(
    `<g transform="translate(${fx} ${fy}) rotate(-2.8 ${fw / 2} ${fh / 2})">`,
    `<rect width="${fw}" height="${fh}" rx="5" fill="${t.paper}" stroke="#000" stroke-opacity="${t.name === "light" ? 0.08 : 0.14}" filter="url(#sh)"/>`,
    `<image href="data:image/jpeg;base64,${photo}" x="16" y="20" width="336" height="209" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>`,
    `<rect x="16.5" y="20.5" width="335" height="208" rx="2" fill="none" stroke="#000" stroke-opacity="0.08"/>`,
    c.text(46, 270, "Jiuai233", { role: "hand", size: 28, fill: "#e57a35" }),
    `<path d="${HEART}" transform="translate(170 252) rotate(12) scale(0.92)" fill="#e66aa5"/>`,
    c.text(fw - 26, 269, "starry live ♫", { role: "hand", size: 17, fill: "#5380dc", anchor: "end" }),
    // 顶部和纸胶带，把拍立得粘在灯箱下沿
    `<rect x="${fw / 2 - 54}" y="-14" width="108" height="26" fill="${FILL.blue}" opacity="0.68" transform="rotate(4 ${fw / 2} 0)"/>`,
    `</g>`,
    // 拍立得左下角贴一枚小电吉他贴纸（避开文字）
    sticker(t, 44, 424, -24, 0.76, DECAL.guitar(FILL.pink, "#2b2635")),
  );

  // ── 右下：Demo 磁带（把语言占比直接做成磁带标签上的彩条 + 规格字）──
  const cx0 = 456;
  const cy0 = 262;
  const W = 402;
  const H = 198;
  const mid = W / 2;
  const hole = "#1b1922";
  c.defs.push(
    `<clipPath id="shell"><rect width="${W}" height="${H}" rx="14"/></clipPath>`,
    `<clipPath id="win"><rect x="${mid - 92}" y="53" width="184" height="44" rx="22"/></clipPath>`,
    `<clipPath id="langBar"><rect x="30" y="108" width="${W - 60}" height="8" rx="4"/></clipPath>`,
  );
  const reel = (cx: number, spool: number, delay: number) =>
    [
      `<circle cx="${cx}" cy="75" r="${spool}" fill="#5b4a3f"/>`,
      `<g class="reel" style="animation-delay:${delay}s">`,
      `<circle cx="${cx}" cy="75" r="9.5" fill="#f4f2f7"/>`,
      `<circle cx="${cx}" cy="75" r="4.2" fill="${hole}"/>`,
      ...[0, 60, 120, 180, 240, 300].map((a) => `<rect x="${cx - 1.1}" y="67.5" width="2.2" height="3.4" fill="${hole}" transform="rotate(${a} ${cx} 75)"/>`),
      `</g>`,
    ].join("");

  const barColors = [FILL.orange, "#6b99f0", FILL.pink, FILL.violet];
  const barW = W - 60;
  let lbx = 30;
  const barRects: string[] = [];
  langs.forEach((l, i) => {
    const w = (l.pct / 100) * barW;
    barRects.push(`<rect x="${n(lbx)}" y="108" width="${n(w)}" height="8" fill="${barColors[i]}"/>`);
    lbx += w;
  });

  // 磁带标签上的语言图例：超出宽度自动缩写 TypeScript→TS / JavaScript→JS
  const shortName = (s: string) => (s === "TypeScript" ? "TS" : s === "JavaScript" ? "JS" : s);
  const useShort =
    langs.reduce((sum, l) => sum + 12 + measure(`${l.name} ${l.pct.toFixed(0)}%`, 10, true) + 12, 0) > barW;
  const legendItems: string[] = [];
  let lx = 32;
  langs.forEach((l, i) => {
    const nm = useShort ? shortName(l.name) : l.name;
    const pct = `${l.pct.toFixed(0)}%`;
    legendItems.push(
      `<circle cx="${n(lx + 3.5)}" cy="128.5" r="3.2" fill="${barColors[i]}"/>`,
      c.text(lx + 10, 132, [[`${nm} `, "#3c354c"], [pct, "#736b87"]], { role: "mono", size: 10 }),
    );
    lx += 10 + measure(`${nm} ${pct}`, 10, true) + 13;
  });

  c.add(
    `<g transform="translate(${cx0} ${cy0}) rotate(1.8 ${mid} ${H / 2})">`,
    `<rect width="${W}" height="${H}" rx="14" fill="${FILL.blue}" stroke="#7898db" stroke-width="1.5" filter="url(#sh)"/>`,
    `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="10" fill="none" stroke="#fff" stroke-opacity="0.32"/>`,
    `<path d="M${mid - 116},${H} L${mid - 100},${H - 40} H${mid + 100} L${mid + 116},${H} Z" fill="#82a3e8" clip-path="url(#shell)"/>`,
    `<circle cx="${mid - 68}" cy="${H - 19}" r="4.8" fill="${hole}"/><circle cx="${mid + 68}" cy="${H - 19}" r="4.8" fill="${hole}"/>`,
    `<rect x="${mid - 28}" y="${H - 24}" width="7.5" height="7.5" rx="1" fill="${hole}"/><rect x="${mid + 20.5}" y="${H - 24}" width="7.5" height="7.5" rx="1" fill="${hole}"/>`,
    ...[[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]].map(
      ([sx, sy]) => `<circle cx="${sx}" cy="${sy}" r="4.2" fill="#e8eefc" stroke="#7898db"/><path d="M${sx - 2.3},${sy} H${sx + 2.3}" stroke="#7898db"/>`,
    ),
    // 磁带纸质标签
    `<rect x="18" y="14" width="${W - 36}" height="130" rx="8" fill="${t.paper}"/>`,
    `<rect x="30" y="23" width="22" height="22" rx="4" fill="${t.ink}"/>`,
    c.text(41, 39.5, "A", { role: "display", size: 13.5, fill: t.paper, anchor: "middle" }),
    c.text(62, 41, "1st demo · code mix", { role: "hand", size: 19, fill: t.ink }),
    c.text(W - 30, 34, "C-60", { role: "mono", size: 11.5, weight: 700, fill: t.ink, anchor: "end" }),
    c.text(W - 30, 45.5, "TYPE II", { role: "mono", size: 8, fill: t.ink, anchor: "end", ls: 1.4, opacity: 0.55 }),
    // 磁带窗口 + 转动卷轴
    `<rect x="${mid - 92}" y="53" width="184" height="44" rx="22" fill="${hole}"/>`,
    `<g clip-path="url(#win)">${reel(mid - 48, 20, 0)}${reel(mid + 48, 13.5, -0.7)}</g>`,
    `<rect x="${mid - 74}" y="57" width="148" height="3.5" rx="2" fill="#fff" opacity="0.1"/>`,
    // 语言占比条直接作为磁带标签配色条
    `<g clip-path="url(#langBar)">${barRects.join("")}</g>`,
    ...legendItems,
    `</g>`,
    sticker(t, 854, 444, 18, 0.9, DECAL.pick(FILL.orange)),
  );

  return c;
}

// ── 2 · 实体效果器板（无外框，透明底）──────────────────────────────────

const PEDALS: [string, string, string, number][] = [
  ["TS", "TypeScript", FILL.blue, 0.7],
  ["RE", "React", FILL.cyan, -0.5],
  ["NX", "Next.js", FILL.violet, 0.8],
  ["ND", "Node.js", FILL.orange, -0.7],
];

function gear(t: Theme): Card {
  const c = new Card(t, 900, 238);

  c.defs.push(
    `<filter id="boardSh" x="-8%" y="-12%" width="116%" height="132%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity="${t.shadow}"/></filter>`,
    `<radialGradient id="metal" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#f4f2f7"/><stop offset="0.6" stop-color="#b9b3c4"/><stop offset="1" stop-color="#7d768a"/></radialGradient>`,
    `<filter id="ledGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.5"/></filter>`,
    `<pattern id="velcro" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,3 H6" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/></pattern>`,
  );

  const board = { x: 42, y: 18, w: 816, h: 196 };

  // 实体铝合金效果器板 + 横梁导轨 + 魔术贴底纹
  c.add(
    `<g filter="url(#boardSh)">`,
    `<rect x="${board.x}" y="${board.y}" width="${board.w}" height="${board.h}" rx="16" fill="${t.board}" stroke="${t.boardEdge}" stroke-width="1.5"/>`,
    `</g>`,
    `<rect x="${board.x + 12}" y="${board.y + 18}" width="${board.w - 24}" height="44" rx="6" fill="${t.boardRail}"/>`,
    `<rect x="${board.x + 12}" y="${board.y + 76}" width="${board.w - 24}" height="44" rx="6" fill="${t.boardRail}"/>`,
    `<rect x="${board.x + 12}" y="${board.y + 134}" width="${board.w - 24}" height="44" rx="6" fill="${t.boardRail}"/>`,
    `<rect x="${board.x + 12}" y="${board.y + 14}" width="${board.w - 24}" height="${board.h - 28}" rx="8" fill="url(#velcro)"/>`,
  );
  for (const [sx, sy] of [
    [board.x + 14, board.y + 12],
    [board.x + board.w - 14, board.y + 12],
    [board.x + 14, board.y + board.h - 12],
    [board.x + board.w - 14, board.y + board.h - 12],
  ]) {
    c.add(screw(sx, sy));
  }

  // 两侧实体音频接口（IN / AMP）
  c.add(
    `<rect x="${board.x - 6}" y="${board.y + 114}" width="8" height="22" rx="2" fill="#5e5770" stroke="#23202d"/>`,
    `<rect x="${board.x + board.w - 2}" y="${board.y + 114}" width="8" height="22" rx="2" fill="#5e5770" stroke="#23202d"/>`,
    c.text(board.x + 32, board.y + 13.5, "GEAR · IN ▸ AMP", { role: "mono", size: 9, fill: "#8e85a6", ls: 1.8 }),
  );

  c.css.push(
    ".tap{animation:tap .8s steps(1,end) infinite}",
    "@keyframes tap{0%{opacity:1}50%{opacity:.15}}",
    ".cent{animation:cent 3.2s ease-in-out infinite}",
    "@keyframes cent{0%{transform:translateX(-26px)}25%{transform:translateX(12px)}42%{transform:translateX(-6px)}56%,100%{transform:translateX(0)}}",
    ".tuned{animation:tuned 3.2s steps(1,end) infinite}",
    "@keyframes tuned{0%{opacity:.18}56%{opacity:1}}",
  );

  const pw = 122;
  const ph = 144;
  const gap = 28;
  const slots = PEDALS.length + 1;
  const x0 = (900 - (slots * pw + (slots - 1) * gap)) / 2;
  const py = 46;
  const jack = py + 24;
  const rand = rng("jiuai233-pedals");
  const metal = (cx: number) =>
    `<circle cx="${cx}" cy="${py + 126}" r="11" fill="url(#metal)" stroke="${t.ink}" stroke-width="1.5"/><circle cx="${cx}" cy="${py + 126}" r="6" fill="none" stroke="${t.ink}" stroke-opacity="0.35"/>`;
  const cable = (d: string) => `<path d="${d}" fill="none" stroke="${t.cable}" stroke-width="4.2" stroke-linecap="round"/>`;

  // 调音表（微倾 -0.8deg，模拟真实魔术贴手贴质感）
  const tx = x0;
  const tc = tx + pw / 2;
  const lcd = "#2b2635";
  const ticks: string[] = [];
  for (let k = -4; k <= 4; k++) {
    const tall = k === 0 ? 5 : 2.5;
    ticks.push(`<rect x="${n(tc + k * 9 - 0.75)}" y="${py + 75 - tall}" width="1.5" height="${tall * 2}" fill="${lcd}" opacity="${k === 0 ? 0.9 : 0.5}"/>`);
  }
  c.add(
    `<g transform="rotate(-0.8 ${tc} ${py + ph / 2})">`,
    `<rect x="${tx}" y="${py + 6}" width="${pw}" height="${ph}" rx="12" fill="#000" opacity="0.45"/>`,
    `<rect x="${tx}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="#353142" stroke="rgba(255,255,255,0.12)"/>`,
    `<circle cx="${tc - 16}" cy="${py + 15}" r="2.6" fill="#ff7d94" opacity="0.35"/>`,
    `<circle cx="${tc + 16}" cy="${py + 15}" r="2.6" fill="#ff7d94" opacity="0.35"/>`,
    `<g class="tuned"><circle cx="${tc}" cy="${py + 15}" r="5" fill="${FILL.green}" filter="url(#ledGlow)" opacity="0.9"/><circle cx="${tc}" cy="${py + 15}" r="3" fill="#c9f2d4"/></g>`,
    `<rect x="${tx + 12}" y="${py + 28}" width="${pw - 24}" height="57" rx="6" fill="${FILL.yellow}"/>`,
    c.text(tc, py + 60, "A", { role: "display", size: 26, fill: lcd, anchor: "middle" }),
    c.text(tx + pw - 18, py + 41, "440", { role: "mono", size: 8, fill: lcd, anchor: "end", opacity: 0.6 }),
    ...ticks,
    `<path class="cent" d="M${tc - 4},${py + 65} L${tc + 4},${py + 65} L${tc},${py + 70} Z" fill="${lcd}"/>`,
    c.text(tc, py + 107, "TUNER", { role: "mono", size: 10.5, weight: 700, fill: "#f7f4f0", anchor: "middle", ls: 2, opacity: 0.85 }),
    metal(tc),
    `</g>`,
  );

  const last = x0 + (slots - 1) * (pw + gap) + pw;
  const cables: string[] = [
    cable(`M${board.x - 6},${board.y + 125} C${board.x + 14},${board.y + 125} ${x0 - 22},${jack - 12} ${x0 + 6},${jack}`),
    cable(`M${last - 6},${jack} C${last + 22},${jack - 12} ${board.x + board.w - 14},${board.y + 125} ${board.x + board.w + 6},${board.y + 125}`),
  ];

  PEDALS.forEach(([abbr, name, color, rot], i) => {
    const px = x0 + (i + 1) * (pw + gap);
    const cx = px + pw / 2;
    const blink = abbr === "ND" ? ' class="tap"' : "";
    const bodyParts: string[] = [
      `<g transform="rotate(${rot} ${cx} ${py + ph / 2})">`,
      `<rect x="${px}" y="${py + 6}" width="${pw}" height="${ph}" rx="12" fill="#000" opacity="0.42"/>`,
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="${color}" stroke="${t.pedalEdge}"/>`,
      `<rect x="${px + 2}" y="${py + 1.5}" width="${pw - 4}" height="3" rx="1.5" fill="#fff" opacity="0.28"/>`,
      `<g${blink}><circle cx="${cx}" cy="${py + 15}" r="5" fill="#ff5c7a" filter="url(#ledGlow)" opacity="0.9"/><circle cx="${cx}" cy="${py + 15}" r="3" fill="#ff7d94"/></g>`,
    ];
    for (const kx of [px + 28, px + pw - 28]) {
      const a = (-135 + rand() * 270) * (Math.PI / 180);
      const ky = py + 41;
      bodyParts.push(
        `<circle cx="${kx}" cy="${ky}" r="11" fill="${t.ink}"/>`,
        `<line x1="${kx}" y1="${ky}" x2="${n(kx + Math.sin(a) * 8)}" y2="${n(ky - Math.cos(a) * 8)}" stroke="${t.paper}" stroke-width="2" stroke-linecap="round"/>`,
      );
    }
    bodyParts.push(
      c.text(cx, py + 89, abbr, { role: "display", size: 28, fill: t.ink, anchor: "middle" }),
      c.text(cx, py + 106, name, { role: "mono", size: 10.5, fill: t.ink, anchor: "middle", opacity: 0.76 }),
      metal(cx),
      `</g>`,
    );
    c.add(...bodyParts);

    const a = px - gap - 6;
    const b = px + 6;
    cables.push(cable(`M${a},${jack} C${a + 8},${jack - 34} ${b - 8},${jack - 34} ${b},${jack}`));
  });
  c.add(...cables);

  // 踏板上随手贴的贴纸
  const at = (i: number) => x0 + (i + 1) * (pw + gap);
  c.add(
    sticker(t, at(0) + 16, py + 130, -14, 0.74, DECAL.star(FILL.yellow)),
    sticker(t, at(2) + pw - 10, py + 8, 16, 0.78, DECAL.heart(FILL.pink)),
  );
  return c;
}

// ── 3A · 终演 7 寸黑胶单曲（暖纸封套 + 半露旋转黑胶，无照片）────────────

function finale(t: Theme): Card {
  const c = new Card(t, 488, 240);
  const sx = 18;
  const sy = 22;
  const sw = 314;
  const sh = 196;
  const vx = sx + sw + 34; // 366，圆盘露出约 68%，中心标贴完整可见
  const vy = sy + sh / 2; // 120
  const vr = 90;

  c.css.push(
    ".vinyl{transform-box:fill-box;transform-origin:center;animation:vinyl 14s linear infinite}",
    "@keyframes vinyl{to{transform:rotate(360deg)}}",
  );
  c.defs.push(
    `<filter id="slSh" x="-10%" y="-14%" width="124%" height="134%"><feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#000" flood-opacity="${t.shadow}"/></filter>`,
    `<filter id="vnSh" x="-14%" y="-14%" width="132%" height="132%"><feDropShadow dx="2" dy="6" stdDeviation="7" flood-color="#000" flood-opacity="${t.shadow * 0.9}"/></filter>`,
    `<filter id="softBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20"/></filter>`,
    `<clipPath id="slClip"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="8"/></clipPath>`,
    `<clipPath id="vnClip"><circle cx="${vx}" cy="${vy}" r="${vr}"/></clipPath>`,
    `<linearGradient id="obiGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FILL.orange}"/><stop offset="0.52" stop-color="${FILL.pink}"/><stop offset="1" stop-color="${FILL.blue}"/></linearGradient>`,
    `<linearGradient id="vinylSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.32" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.68" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.13"/></linearGradient>`,
  );

  // 黑胶沟槽
  const grooves = [82, 74, 66, 58, 50, 42]
    .map((r) => `<circle cx="${vx}" cy="${vy}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="${r === 42 ? 0.14 : 0.065}" stroke-width="${r === 42 ? 1.2 : 0.8}"/>`)
    .join("");

  // 天气小云朵与太阳手绘线稿（呼应“把错归结于天气吧”）
  const weatherDoodle = [
    `<g transform="translate(${sx + sw - 54} ${sy + 38})" fill="none" stroke-linecap="round" stroke-linejoin="round">`,
    // 小太阳
    `<circle cx="14" cy="-6" r="7" fill="${FILL.yellow}" fill-opacity="0.55" stroke="${FILL.orange}" stroke-width="1.6"/>`,
    `<path d="M14,-17 V-19 M23,-14 L25,-16 M25,-6 H27 M22,2 L24,4" stroke="${FILL.orange}" stroke-width="1.4"/>`,
    // 小云朵
    `<path d="M-8,8 H14 C18,8 20,5 19,2 C18,-1 15,-2 12,-1 C11,-6 6,-9 1,-8 C-4,-7 -7,-3 -7,1 C-11,1 -13,4 -12,6.5 C-11.3,7.8 -9.8,8 -8,8 Z" fill="${t.paper}" stroke="#7f9de0" stroke-width="1.6"/>`,
    `</g>`,
  ].join("");

  c.add(
    `<g transform="rotate(-1.4 244 120)">`,
    // ── 右侧：半露出的 7 寸黑胶唱片 ──
    `<g filter="url(#vnSh)">`,
    `<circle cx="${vx}" cy="${vy}" r="${vr}" fill="#171520" stroke="#342e42" stroke-width="1.2"/>`,
    `</g>`,
    // 静态唱片反光（高光不随碟片转，符合真实物理）
    `<g clip-path="url(#vnClip)">`,
    grooves,
    `<path d="M${vx},${vy} L${vx - 70},${vy - 88} L${vx + 10},${vy - 96} Z" fill="#ffffff" opacity="0.06"/>`,
    `<path d="M${vx},${vy} L${vx + 72},${vy + 86} L${vx - 12},${vy + 96} Z" fill="#ffffff" opacity="0.055"/>`,
    `<circle cx="${vx}" cy="${vy}" r="${vr}" fill="url(#vinylSheen)"/>`,
    `</g>`,
    // 缓缓旋转的中心单曲标贴
    `<g class="vinyl">`,
    `<circle cx="${vx}" cy="${vy}" r="34" fill="${FILL.orange}"/>`,
    `<circle cx="${vx}" cy="${vy}" r="31" fill="none" stroke="#fff7ef" stroke-width="1.2" stroke-opacity="0.7"/>`,
    `<path d="M${vx - 34},${vy} A34,34 0 0 0 ${vx + 34},${vy} Z" fill="${FILL.pink}" opacity="0.55"/>`,
    c.text(vx, vy - 15, "SIDE B", { role: "mono", size: 7.5, weight: 700, fill: "#2b2635", anchor: "middle", ls: 1.4 }),
    c.text(vx, vy + 21, "No.233", { role: "mono", size: 8.5, weight: 700, fill: "#2b2635", anchor: "middle", ls: 0.8 }),
    `<circle cx="${vx}" cy="${vy}" r="7.5" fill="#171520" stroke="#fff7ef" stroke-width="1.2" stroke-opacity="0.6"/>`,
    `</g>`,
    // ── 左侧：暖纸厚卡封套（压在黑胶上方）──
    `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="8" fill="${t.paper}" stroke="#000" stroke-opacity="${t.name === "light" ? 0.09 : 0.16}" filter="url(#slSh)"/>`,
    `<g clip-path="url(#slClip)">`,
    // 封套底面极淡的水彩氛围光晕（马卡龙橙粉蓝）
    `<circle cx="${sx + 108}" cy="${sy + 54}" r="66" fill="${FILL.orange}" opacity="0.16" filter="url(#softBlur)"/>`,
    `<circle cx="${sx + 258}" cy="${sy + 148}" r="74" fill="${FILL.blue}" opacity="0.2" filter="url(#softBlur)"/>`,
    `<circle cx="${sx + 206}" cy="${sy + 48}" r="50" fill="${FILL.pink}" opacity="0.14" filter="url(#softBlur)"/>`,
    // 日系唱片 OBI 侧标腰封
    `<rect x="${sx}" y="${sy}" width="22" height="${sh}" fill="url(#obiGrad)"/>`,
    `<line x1="${sx + 22}" y1="${sy}" x2="${sx + 22}" y2="${sy + sh}" stroke="#2b2635" stroke-opacity="0.12"/>`,
    c.text(sx + 14.5, sy + sh / 2, "ENCORE · 45 RPM", {
      role: "mono",
      size: 8.5,
      weight: 700,
      fill: "#2b2635",
      anchor: "middle",
      ls: 2,
      attrs: `transform="rotate(-90 ${sx + 14.5} ${sy + sh / 2})"`,
    }),
    // 右侧封套开口弧形小缺口（真实黑胶套抽口）
    `<circle cx="${sx + sw + 2}" cy="${vy}" r="11" fill="#171520" opacity="0.14"/>`,
    `</g>`,
    // 封套正面排版
    weatherDoodle,
    c.text(sx + 38, sy + 36, "7\" SINGLE · 終演", { role: "mono", size: 9.5, fill: "#7d7491", ls: 1.6 }),
    c.text(sx + 30, sy + 94, [["「", "#d66c26"], ["把错归结于天气吧", "#2b2635"], ["」", "#d66c26"]], { role: "zh", size: 24.5 }),
    `<path d="M${sx + 44},${sy + 104} Q${sx + 84},${sy + 100} ${sx + 124},${sy + 105} T${sx + 204},${sy + 104} T${sx + 260},${sy + 105}" fill="none" stroke="${FILL.pink}" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>`,
    c.text(sx + 40, sy + 132, "ぜんぶ天気のせいでいいよ", { role: "hand", size: 15.5, fill: "#59506b" }),
    `<line x1="${sx + 38}" y1="${sy + 156}" x2="${sx + sw - 22}" y2="${sy + 156}" stroke="#2b2635" stroke-opacity="0.1" stroke-dasharray="3 4"/>`,
    c.text(sx + 38, sy + 178, "結束バンド「忘れてやらない」", { size: 11.5, fill: "#6e6582" }),
    c.text(sx + sw - 22, sy + 178, "No.233", { role: "hand", size: 15, fill: "#d66c26", anchor: "end" }),
    `</g>`,
    // 封套左下角贴一枚小拨片贴纸
    sticker(t, sx + 12, sy + sh - 6, -18, 0.85, DECAL.pick(FILL.yellow)),
  );

  return c;
}

// ── 3B · B 站 Live House 通行证（可点击，与拍立得并排居中对齐）──────────

function linkBili(t: Theme): Card {
  const c = new Card(t, 272, 240);
  const ink = "#2b2635";
  const px = 22;
  const py = 52;
  const pw = 228;
  const ph = 142;
  const ax = px + 44;
  const ay = py + 90;

  c.defs.push(
    `<filter id="psSh" x="-12%" y="-14%" width="128%" height="136%"><feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#000" flood-opacity="${t.shadow}"/></filter>`,
    `<clipPath id="passClip"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="16"/></clipPath>`,
    `<clipPath id="face"><circle cx="${ax}" cy="${ay}" r="26"/></clipPath>`,
  );

  const tv = [
    `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="M-4.5,-10 L-1.5,-6 M4.5,-10 L1.5,-6" stroke-width="2"/>`,
    `<rect x="-10" y="-6" width="20" height="15" rx="4" stroke-width="2.1"/>`,
    `<path d="M-5.5,-1 L-2.5,0.6 M5.5,-1 L2.5,0.6" stroke-width="1.8"/>`,
    `</g>`,
  ].join("");

  c.add(
    `<g transform="rotate(2.2 136 122)">`,
    // 顶部挂绳金属夹
    `<rect x="120" y="${py - 14}" width="32" height="14" rx="4" fill="#8b839e" stroke="${ink}" stroke-width="1.2"/>`,
    `<rect x="127" y="${py - 10}" width="18" height="4" rx="2" fill="${t.chassis}"/>`,
    // 卡片本体
    `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="16" fill="${t.passBg}" stroke="${t.passEdge}" stroke-width="1.4" filter="url(#psSh)"/>`,
    // 顶部粉色 PASS 色带
    `<g clip-path="url(#passClip)">`,
    `<rect x="${px}" y="${py}" width="${pw}" height="43" fill="${FILL.pink}"/>`,
    `<rect x="${px}" y="${py + 43}" width="${pw}" height="4" fill="${FILL.orange}"/>`,
    `</g>`,
    // 挂绳孔
    `<rect x="118" y="${py + 7}" width="36" height="6" rx="3" fill="${t.chassis}" opacity="0.45"/>`,
    // 色带内标识
    `<g transform="translate(${px + 24} ${py + 28}) scale(0.84)">${tv}</g>`,
    c.text(px + 42, py + 33, "BACKSTAGE · bilibili", { role: "mono", size: 10.2, weight: 700, fill: ink, ls: 0.7 }),
    // 下半区：头像 + B 站昵称 + 明确可点击提示按钮
    `<circle cx="${ax}" cy="${ay}" r="29" fill="${FILL.pink}"/>`,
    `<image href="data:image/jpeg;base64,${BILI.face}" x="${ax - 26}" y="${ay - 26}" width="52" height="52" clip-path="url(#face)"/>`,
    `<circle cx="${ax}" cy="${ay}" r="26" fill="none" stroke="#fff" stroke-width="2"/>`,
    c.text(ax + 40, ay - 6, BILI.name, { role: "pop", size: 22, fill: t.text }),
    // 播放 / 主页小胶囊按钮
    `<rect x="${ax + 40}" y="${ay + 6}" width="112" height="24" rx="12" fill="${FILL.pink}" opacity="${t.name === "dark" ? 0.92 : 1}"/>`,
    `<path d="M${ax + 52},${ay + 13} L${ax + 60},${ay + 18} L${ax + 52},${ay + 23} Z" fill="${ink}"/>`,
    c.text(ax + 66, ay + 22, "去 B 站看看", { role: "body", size: 11.5, weight: 700, fill: ink }),
    `</g>`,
    sticker(t, px + pw - 6, py + 14, 16, 0.76, DECAL.star(FILL.yellow)),
  );

  return c;
}

// ── 输出 ────────────────────────────────────────────────────────────────

const CARDS: [string, (t: Theme) => Card, string][] = [
  ["hero", hero, "Jiuai233 · ONE-MAN LIVE 招牌、拍立得与 Demo 磁带"],
  ["gear", gear, "机材表：调音表与 TypeScript、React、Next.js、Node.js 效果器板"],
  ["finale", finale, "终演 7 寸黑胶单曲：「把错归结于天气吧」ぜんぶ天気のせいでいいよ"],
  ["link-bilibili", linkBili, `bilibili 通行证：${BILI.name}`],
];

for (const t of [DARK, LIGHT]) {
  for (const [name, build, label] of CARDS) {
    const card = build(t);
    const svg = card.render(await fontFaces(card.chars), label);
    writeFileSync(join(OUT, `${name}-${t.name}.svg`), svg);
    console.log(`${name}-${t.name}.svg  ${(svg.length / 1024).toFixed(0)} KB`);
  }
}
