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

type Day = { date: string; contributionCount: number; contributionLevel: string; weekday: number };
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

const TZ = "Asia/Shanghai";
const now = new Date();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now).toUpperCase();
const dotted = (ymd: string) => ymd.replaceAll("-", ".");

const repos: Repo[] = user.repositories.nodes;
const own = repos.filter((r) => !r.isFork && r.name !== user.login);
const cc = user.contributionsCollection;
const weeks: { contributionDays: Day[] }[] = cc.contributionCalendar.weeks;
const days = weeks.flatMap((w) => w.contributionDays);

let bestStreak = 0;
for (let run = 0, i = 0; i < days.length; i++) {
  run = days[i].contributionCount > 0 ? run + 1 : 0;
  bestStreak = Math.max(bestStreak, run);
}
const hottest = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
const contributions: number = cc.contributionCalendar.totalContributions;

const langBytes = new Map<string, number>();
for (const r of own) for (const e of r.languages.edges) langBytes.set(e.node.name, (langBytes.get(e.node.name) ?? 0) + e.size);
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
  card: string; surface: string; line: string; strong: string;
  text: string; muted: string; faint: string;
  orange: string; blue: string; pink: string; yellow: string;
  board: string; ledOff: string; led: [string, string, string];
  spot: number; glow: number; levels: string[]; grip: string;
  ink: string; paper: string; cable: string; shadow: number; pedalEdge: string;
  amp: string; ampEdge: string; grille: string;
};

const DARK: Theme = {
  name: "dark",
  card: "#201e28", surface: "#292632", line: "#3a3446", strong: "#837b93",
  text: "#eeeaf4", muted: "#bbb3c7", faint: "#8d859d",
  orange: FILL.orange, blue: FILL.blue, pink: FILL.pink, yellow: FILL.yellow,
  board: "#17151d", ledOff: "#272330", led: [FILL.orange, FILL.pink, FILL.blue],
  spot: 0.2, glow: 0.65, levels: ["", "#56668f", FILL.blue, FILL.pink, FILL.orange], grip: "#4a4458",
  ink: "#2b2635", paper: "#f7f4f0", cable: "#0f0e13", shadow: 0.5, pedalEdge: "none",
  amp: "#141219", ampEdge: "#3a3446", grille: "#2c2836",
};

const LIGHT: Theme = {
  name: "light",
  card: "#fcfbfe", surface: "#f4f1f8", line: "#e3ddec", strong: "#b6aec5",
  text: "#2b2635", muted: "#5d566b", faint: "#736c86",
  orange: "#b95a1d", blue: "#3566c9", pink: "#b8487f", yellow: "#9a6b00",
  board: "#f1edf6", ledOff: "#e7e1ef", led: ["#ee8c4a", "#e06fa8", "#5f8ff0"],
  spot: 0.16, glow: 0.4, levels: ["", "#c3d4fa", "#7ea4f0", "#df7bb0", "#ec8a47"], grip: "#b6aec5",
  ink: "#2b2635", paper: "#ffffff", cable: "#3a3346", shadow: 0.2, pedalEdge: "rgba(43,38,53,0.18)",
  amp: "#2b2635", ampEdge: "none", grille: "#463f53",
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
    // 可变字体的几个字重会指向同一个文件，合并成一条字重区间
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
const isWide = (ch: string) => /[⺀-￿]/.test(ch);

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

// [文字, 填充色, 额外的 tspan 属性]
type Seg = [string, string?, string?];
type TextOpts = {
  role?: Role; size?: number; weight?: number; fill?: string;
  anchor?: "start" | "middle" | "end"; ls?: number; opacity?: number; attrs?: string;
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
      `x="${n(x)}"`, `y="${n(y)}"`, `font-family="${family}"`, `font-size="${o.size ?? 14}"`,
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

// 拨片形状，当作每张卡片的标题符号
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

// 模切贴纸：错位的阴影垫底，再垫一圈白边，最后画本体。cut 是不带颜色的轮廓图形
type Decal = { cut: string; body: string };

function sticker(t: Theme, x: number, y: number, rot: number, scale: number, { cut, body }: Decal, edge = 3.5): string {
  const at = `rotate(${rot}) scale(${scale})`;
  const outline = `stroke-width="${n((edge * 2) / scale)}" stroke-linejoin="round" stroke-linecap="round"`;
  return [
    `<g transform="translate(${x} ${y})">`,
    `<g transform="translate(1.5 2.5)" opacity="${t.shadow}"><g transform="${at}" fill="#000" stroke="#000" ${outline}>${cut}</g></g>`,
    `<g transform="${at}" fill="#fff" stroke="#fff" ${outline}>${cut}</g>`,
    `<g transform="${at}">${body}</g>`,
    `</g>`,
  ].join("");
}

const DECAL = {
  star: (fill: string): Decal => ({ cut: `<path d="${star(12)}"/>`, body: `<path d="${star(12)}" fill="${fill}"/>` }),
  heart: (fill: string): Decal => ({ cut: `<path d="${HEART}"/>`, body: `<path d="${HEART}" fill="${fill}"/>` }),
  bolt: (fill: string): Decal => ({ cut: `<path d="${BOLT}"/>`, body: `<path d="${BOLT}" fill="${fill}"/>` }),
  // 竖放的电吉他，琴头朝上，长约 66
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

function cardFrame(c: Card) {
  c.add(`<rect x="0.5" y="0.5" width="${c.w - 1}" height="${c.h - 1}" rx="20" fill="${c.t.card}" stroke="${c.t.line}"/>`);
}

function titleRow(c: Card, label: string, sub: string, right: Seg[], y = 42) {
  const t = c.t;
  c.add(`<path d="${PICK}" transform="translate(38 ${y - 5}) rotate(-14)" fill="${t.orange}"/>`);
  c.add(c.text(54, y, label, { role: "mono", size: 13, weight: 700, fill: t.text, ls: 2.5 }));
  const subX = 54 + label.length * (13 * 0.6 + 2.5) + 10;
  c.add(c.text(subX, y, sub, { size: 12.5, fill: t.muted }));
  c.add(c.text(c.w - 36, y, right, { role: "mono", size: 12, fill: t.faint, anchor: "end" }));
}

// ── 1 · 演出传单 ────────────────────────────────────────────────────────

const GLYPHS: Record<string, string[]> = {
  J: ["#####", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
};

function header(t: Theme): Card {
  const c = new Card(t, 900, 360);
  cardFrame(c);

  c.defs.push(
    `<clipPath id="cardClip"><rect width="900" height="360" rx="20"/></clipPath>`,
    `<linearGradient id="spA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FILL.orange}" stop-opacity="${t.spot}"/><stop offset="1" stop-color="${FILL.orange}" stop-opacity="0"/></linearGradient>`,
    `<linearGradient id="spB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FILL.blue}" stop-opacity="${t.spot}"/><stop offset="1" stop-color="${FILL.blue}" stop-opacity="0"/></linearGradient>`,
  );
  c.css.push(
    ".spot{transform-box:view-box}",
    ".spa{transform-origin:150px -30px;animation:spa 7s ease-in-out infinite alternate}",
    ".spb{transform-origin:750px -30px;animation:spb 8s ease-in-out infinite alternate}",
    "@keyframes spa{from{transform:rotate(-14deg)}to{transform:rotate(18deg)}}",
    "@keyframes spb{from{transform:rotate(14deg)}to{transform:rotate(-18deg)}}",
  );
  c.add(
    `<g clip-path="url(#cardClip)">`,
    `<polygon class="spot spa" points="150,-30 0,360 300,360" fill="url(#spA)"/>`,
    `<polygon class="spot spb" points="750,-30 600,360 900,360" fill="url(#spB)"/>`,
    `</g>`,
  );

  c.add(`<path d="${PICK}" transform="translate(38 37) rotate(-14)" fill="${t.orange}"/>`);
  c.add(c.text(54, 42, "ONE-MAN LIVE", { role: "mono", size: 13, weight: 700, ls: 2.5 }));
  c.add(c.text(54 + 12 * 10.3 + 10, 42, "ワンマンライブ", { size: 12.5, fill: t.muted }));
  c.add(c.text(864, 42, [[`${dotted(today)} ${weekday}`, t.orange], [" @ GITHUB", t.faint]], { role: "mono", size: 12, anchor: "end" }));

  // LED 招牌：底板 + 未点亮的灯珠 + 点亮的字
  const word = "JIUAI233";
  const gridC = word.length * 6 - 1 + 4;
  const gridR = 9;
  const bx = 32;
  const bw = 836;
  const p = bw / gridC;
  const by = 60;
  const bh = gridR * p;
  const s = p * 0.82;
  const g = (p - s) / 2;
  const rx = s * 0.24;
  c.defs.push(
    `<pattern id="led" x="${n(bx)}" y="${n(by)}" width="${n(p)}" height="${n(p)}" patternUnits="userSpaceOnUse"><rect x="${n(g)}" y="${n(g)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="${t.ledOff}"/></pattern>`,
    `<linearGradient id="ledGrad" gradientUnits="userSpaceOnUse" x1="${bx + 2 * p}" y1="0" x2="${bx + bw - 2 * p}" y2="0"><stop offset="0" stop-color="${t.led[0]}"/><stop offset="0.5" stop-color="${t.led[1]}"/><stop offset="1" stop-color="${t.led[2]}"/></linearGradient>`,
    `<linearGradient id="sweepGrad" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="${t.name === "dark" ? 0.55 : 0.6}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
    `<filter id="glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>`,
  );
  const lit: string[] = [];
  [...word].forEach((ch, i) => {
    const rows = GLYPHS[ch];
    rows.forEach((row, r) =>
      [...row].forEach((cell, col) => {
        if (cell !== "#") return;
        const x = bx + (2 + i * 6 + col) * p + g;
        const y = by + (1 + r) * p + g;
        lit.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}"/>`);
      }),
    );
  });
  c.defs.push(`<g id="lit">${lit.join("")}</g>`, `<clipPath id="litClip">${lit.join("")}</clipPath>`);
  c.css.push(".sweep{animation:sweep 5.5s ease-in-out infinite}", "@keyframes sweep{0%{transform:translateX(0)}55%,100%{transform:translateX(1100px)}}");
  c.add(
    `<rect x="${bx}" y="${by}" width="${bw}" height="${n(bh)}" rx="12" fill="${t.board}"/>`,
    `<rect x="${bx}" y="${by}" width="${bw}" height="${n(bh)}" rx="12" fill="url(#led)"/>`,
    `<use href="#lit" fill="url(#ledGrad)" filter="url(#glow)" opacity="${t.glow}"/>`,
    `<use href="#lit" fill="url(#ledGrad)"/>`,
    `<g clip-path="url(#litClip)"><g class="sweep"><rect x="-150" y="${by}" width="110" height="${n(bh)}" fill="url(#sweepGrad)" transform="skewX(-18)"/></g></g>`,
  );

  c.css.push(
    ".tw{transform-box:fill-box;transform-origin:center;animation:tw 2.8s ease-in-out infinite}",
    "@keyframes tw{0%,100%{opacity:.25;transform:scale(.55)}50%{opacity:1;transform:scale(1)}}",
  );
  const sparks: [number, number, number, string, number][] = [
    [176, 236, 5, FILL.yellow, 0],
    [724, 240, 6, FILL.pink, -1.1],
    [330, 290, 4, FILL.blue, -0.6],
    [574, 286, 4.5, FILL.yellow, -1.7],
  ];
  for (const [x, y, r, fill, delay] of sparks) {
    // 动画的 transform 会覆盖元素自己的 transform，定位放在外层
    c.add(`<g transform="translate(${x} ${y})"><path class="tw" d="${SPARK(r)}" fill="${fill}" style="animation-delay:${delay}s"/></g>`);
  }

  c.add(c.text(450, 256, [["「", t.orange], ["自己一个人也没关系，声音总会被听见"], ["」", t.orange]], { role: "zh", size: 28, anchor: "middle" }));

  // 舞台：两侧音箱贴满贴纸，舞台前沿写主页地址
  const floor = 314;
  c.defs.push(`<pattern id="grille" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0,5 L5,0 M-1,1 L1,-1 M4,6 L6,4" stroke="${t.grille}" stroke-width="1.2"/></pattern>`);
  for (const ax of [48, 900 - 48 - 96]) {
    const aw = 96;
    c.add(
      `<rect x="${ax}" y="${floor - 74}" width="${aw}" height="20" rx="3" fill="${t.amp}" stroke="${t.ampEdge}"/>`,
      `<rect x="${ax + 5}" y="${floor - 70}" width="${aw - 10}" height="12" rx="2" fill="${FILL.yellow}" opacity="0.85"/>`,
      `<circle cx="${ax + 12}" cy="${floor - 64}" r="2.2" fill="#ff5c7a"/>`,
      `<circle cx="${ax + 12}" cy="${floor - 64}" r="4.5" fill="#ff5c7a" opacity="0.35" filter="url(#glow)"/>`,
    );
    for (let k = 0; k < 6; k++) c.add(`<circle cx="${ax + 30 + k * 11}" cy="${floor - 64}" r="2.6" fill="${t.amp}"/>`);
    c.add(
      `<rect x="${ax}" y="${floor - 52}" width="${aw}" height="52" rx="4" fill="${t.amp}" stroke="${t.ampEdge}"/>`,
      `<rect x="${ax + 6}" y="${floor - 46}" width="${aw - 12}" height="40" rx="2" fill="url(#grille)"/>`,
      `<rect x="${ax + 10}" y="${floor - 42}" width="22" height="5" rx="2.5" fill="${t.paper}" opacity="0.85"/>`,
    );
  }
  c.add(
    sticker(t, 116, floor - 24, 32, 0.72, DECAL.guitar(FILL.pink, "#2b2635")),
    sticker(t, 790, floor - 22, -14, 0.95, DECAL.star(FILL.yellow)),
    sticker(t, 828, floor - 30, 16, 0.9, DECAL.bolt(FILL.orange)),
  );
  c.add(`<rect x="${bx}" y="${floor}" width="${bw}" height="28" rx="8" fill="${t.surface}" stroke="${t.line}"/>`);
  c.add(c.text(450, floor + 18.5, [["github.com/", t.faint], ["jiuai233", t.blue]], { role: "mono", size: 12, anchor: "middle" }));
  return c;
}

// ── 2 · 成员档案 ────────────────────────────────────────────────────────

function profile(t: Theme): Card {
  const c = new Card(t, 900, 444);
  cardFrame(c);
  titleRow(c, "MEMBER PROFILE", "メンバープロフィール", [["No.", t.faint], ["233", t.orange]]);

  // 宽幅拍立得（Instax Wide 108×86mm，画面 99×62mm）
  const fw = 378;
  const fh = 301;
  const fx = 50;
  const fy = 92;
  c.defs.push(
    `<filter id="sh" x="-10%" y="-10%" width="125%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="${t.shadow}"/></filter>`,
    `<clipPath id="ph"><rect x="16" y="22" width="346" height="217" rx="2"/></clipPath>`,
  );
  c.add(
    `<g transform="translate(${fx} ${fy}) rotate(-3 ${fw / 2} ${fh / 2})">`,
    `<rect width="${fw}" height="${fh}" rx="5" fill="${t.paper}" filter="url(#sh)"/>`,
    `<image href="data:image/jpeg;base64,${photo}" x="16" y="22" width="346" height="217" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>`,
    `<rect x="16.5" y="22.5" width="345" height="216" rx="2" fill="none" stroke="#000" stroke-opacity="0.08"/>`,
    c.text(34, 281, "Jiuai233", { role: "hand", size: 30, fill: "#e57a35" }),
    `<path d="${HEART}" transform="translate(168 262) rotate(12)" fill="#e66aa5"/>`,
    c.text(fw - 28, 282, "26.10.26", { role: "hand", size: 18, fill: "#4f7fe0", anchor: "end" }),
    `<rect x="${fw / 2 - 56}" y="-13" width="112" height="28" fill="${FILL.blue}" opacity="0.62" transform="rotate(5 ${fw / 2} 1)"/>`,
    `</g>`,
  );

  const x0 = 478;
  const right = 864;
  // 名字做成贴纸字：阴影、白边、本体三层
  const nameAt = { role: "pop" as const, size: 50 };
  // 白边是一整块：先膨胀再腐蚀，把 a 的字怀填上，外轮廓不变
  c.defs.push(`<filter id="solid" x="-0.1" y="-0.6" width="1.2" height="2.2"><feMorphology operator="dilate" radius="5"/><feMorphology operator="erode" radius="5"/></filter>`);
  const cutEdge = `stroke-width="12" stroke-linejoin="round" filter="url(#solid)"`;
  c.add(
    c.text(x0 + 2, 128 + 3, "Jiuai233", { ...nameAt, fill: "#000", opacity: t.shadow, attrs: `stroke="#000" ${cutEdge}` }),
    c.text(x0, 128, "Jiuai233", { ...nameAt, fill: "#fff", attrs: `stroke="#fff" ${cutEdge}` }),
    c.text(x0, 128, [["Jiuai", FILL.orange, `stroke="#d27a3e"`], ["233", FILL.blue, `stroke="#6d8fd6"`]], {
      ...nameAt,
      attrs: `stroke-width="2.5" stroke-linejoin="round" paint-order="stroke"`,
    }),
    sticker(t, 700, 88, 14, 0.8, DECAL.star(FILL.yellow)),
  );

  // Demo 磁带：外壳粉蓝，标签上的橙蓝色条就是推し色
  const W = right - x0;
  const H = 212;
  const mid = W / 2;
  const hole = "#1b1922";
  c.css.push(
    ".reel{transform-box:fill-box;transform-origin:center;animation:reel 2.4s linear infinite}",
    "@keyframes reel{to{transform:rotate(360deg)}}",
  );
  c.defs.push(
    `<clipPath id="shell"><rect width="${W}" height="${H}" rx="14"/></clipPath>`,
    `<clipPath id="win"><rect x="${mid - 96}" y="66" width="192" height="50" rx="25"/></clipPath>`,
  );
  const reel = (cx: number, spool: number, delay: number) =>
    [
      `<circle cx="${cx}" cy="91" r="${spool}" fill="#5b4a3f"/>`,
      `<g class="reel" style="animation-delay:${delay}s">`,
      `<circle cx="${cx}" cy="91" r="10" fill="#f4f2f7"/>`,
      `<circle cx="${cx}" cy="91" r="4.5" fill="${hole}"/>`,
      ...[0, 60, 120, 180, 240, 300].map((a) => `<rect x="${cx - 1.2}" y="83" width="2.4" height="3.6" fill="${hole}" transform="rotate(${a} ${cx} 91)"/>`),
      `</g>`,
    ].join("");
  c.add(
    `<g transform="translate(${x0} 152) rotate(1.5 ${mid} ${H / 2})">`,
    `<rect width="${W}" height="${H}" rx="14" fill="${FILL.blue}" stroke="#7f9fe0" stroke-width="1.5" filter="url(#sh)"/>`,
    `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="10" fill="none" stroke="#fff" stroke-opacity="0.3"/>`,
    `<path d="M${mid - 120},${H} L${mid - 104},${H - 46} H${mid + 104} L${mid + 120},${H} Z" fill="#86a6ea" clip-path="url(#shell)"/>`,
    `<circle cx="${mid - 70}" cy="${H - 22}" r="5" fill="${hole}"/><circle cx="${mid + 70}" cy="${H - 22}" r="5" fill="${hole}"/>`,
    `<rect x="${mid - 30}" y="${H - 27}" width="8" height="8" rx="1" fill="${hole}"/><rect x="${mid + 22}" y="${H - 27}" width="8" height="8" rx="1" fill="${hole}"/>`,
    ...[[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]].map(
      ([sx, sy]) => `<circle cx="${sx}" cy="${sy}" r="4.5" fill="#e8eefc" stroke="#7f9fe0"/><path d="M${sx - 2.5},${sy} H${sx + 2.5}" stroke="#7f9fe0"/>`,
    ),
    `<rect x="20" y="18" width="${W - 40}" height="124" rx="8" fill="${t.paper}"/>`,
    `<rect x="20" y="122" width="${W - 40}" height="6" fill="${FILL.orange}"/>`,
    `<rect x="20" y="130" width="${W - 40}" height="6" fill="#7ea4f0"/>`,
    `<rect x="32" y="28" width="24" height="24" rx="4" fill="${t.ink}"/>`,
    c.text(44, 46, "A", { role: "display", size: 15, fill: t.paper, anchor: "middle" }),
    c.text(66, 47, "Jiuai233  1st demo", { role: "hand", size: 20, fill: t.ink }),
    c.text(W - 34, 39, "C-60", { role: "mono", size: 12, weight: 700, fill: t.ink, anchor: "end" }),
    c.text(W - 34, 52, "NORMAL", { role: "mono", size: 8.5, fill: t.ink, anchor: "end", ls: 1.5, opacity: 0.6 }),
    `<rect x="${mid - 96}" y="66" width="192" height="50" rx="25" fill="${hole}"/>`,
    `<g clip-path="url(#win)">${reel(mid - 50, 22, 0)}${reel(mid + 50, 15, -0.7)}</g>`,
    `<rect x="${mid - 80}" y="70" width="160" height="4" rx="2" fill="#fff" opacity="0.1"/>`,
    `</g>`,
  );

  // 语言占比
  const barY = 404;
  const barW = right - x0;
  const colors = [FILL.orange, FILL.blue, FILL.pink, FILL.violet];
  c.defs.push(`<clipPath id="bar"><rect x="${x0}" y="${barY - 10}" width="${barW}" height="10" rx="5"/></clipPath>`);
  let bx = x0;
  const segsSvg: string[] = [];
  langs.forEach((l, i) => {
    const w = (l.pct / 100) * barW;
    segsSvg.push(`<rect x="${n(bx)}" y="${barY - 10}" width="${n(w)}" height="10" fill="${colors[i]}"/>`);
    bx += w;
  });
  c.add(`<g clip-path="url(#bar)">${segsSvg.join("")}</g>`);
  let lx = x0;
  langs.forEach((l, i) => {
    const label = `${l.name} `;
    const pct = `${l.pct.toFixed(0)}%`;
    c.add(`<circle cx="${n(lx + 4)}" cy="${barY + 19}" r="4" fill="${colors[i]}"/>`);
    c.add(c.text(lx + 13, barY + 23, [[label, t.muted], [pct, t.faint]], { role: "mono", size: 11.5 }));
    lx += 13 + measure(label + pct, 11.5, true) + 16;
  });
  return c;
}

// ── 3 · 机材表（效果器板）──────────────────────────────────────────────

const PEDALS: [string, string, string][] = [
  ["TS", "TypeScript", FILL.blue],
  ["RE", "React", FILL.cyan],
  ["NX", "Next.js", FILL.violet],
  ["ND", "Node.js", FILL.orange],
];

function gear(t: Theme): Card {
  const c = new Card(t, 900, 274);
  cardFrame(c);
  titleRow(c, "GEAR", "機材リスト", [["IN ", t.faint], ["▸ ▸ ▸", t.orange], [" AMP", t.faint]]);

  const board = { x: 24, y: 66, w: 852, h: 186 };
  c.defs.push(
    `<pattern id="velcro" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,3 H6" stroke="${t.line}" stroke-width="1"/></pattern>`,
    `<radialGradient id="metal" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#f4f2f7"/><stop offset="0.6" stop-color="#b9b3c4"/><stop offset="1" stop-color="#7d768a"/></radialGradient>`,
    `<filter id="ledGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.5"/></filter>`,
  );
  c.add(
    `<rect x="${board.x}" y="${board.y}" width="${board.w}" height="${board.h}" rx="14" fill="${t.board}" stroke="${t.line}"/>`,
    `<rect x="${board.x + 10}" y="${board.y + 10}" width="${board.w - 20}" height="${board.h - 20}" rx="8" fill="url(#velcro)" opacity="0.5"/>`,
  );
  for (const [sx, sy] of [[board.x + 14, board.y + 14], [board.x + board.w - 14, board.y + 14], [board.x + 14, board.y + board.h - 14], [board.x + board.w - 14, board.y + board.h - 14]]) {
    c.add(`<circle cx="${sx}" cy="${sy}" r="4" fill="${t.surface}" stroke="${t.strong}"/><path d="M${sx - 2.5},${sy} H${sx + 2.5}" stroke="${t.strong}"/>`);
  }

  c.css.push(
    ".tap{animation:tap .8s steps(1,end) infinite}",
    "@keyframes tap{0%{opacity:1}50%{opacity:.15}}",
    // 调音表：指针来回找音，停在正中时绿灯亮
    ".cent{animation:cent 3.2s ease-in-out infinite}",
    "@keyframes cent{0%{transform:translateX(-26px)}25%{transform:translateX(12px)}42%{transform:translateX(-6px)}56%,100%{transform:translateX(0)}}",
    ".tuned{animation:tuned 3.2s steps(1,end) infinite}",
    "@keyframes tuned{0%{opacity:.18}56%{opacity:1}}",
  );

  const pw = 120;
  const ph = 140;
  const gap = 28;
  const slots = PEDALS.length + 1;
  const x0 = (900 - (slots * pw + (slots - 1) * gap)) / 2;
  const py = 90;
  const jack = py + 24;
  const rand = rng("jiuai233-pedals");
  const metal = (cx: number) =>
    `<circle cx="${cx}" cy="${py + 123}" r="11" fill="url(#metal)" stroke="${t.ink}" stroke-width="1.5"/><circle cx="${cx}" cy="${py + 123}" r="6" fill="none" stroke="${t.ink}" stroke-opacity="0.35"/>`;
  const cable = (d: string) => `<path d="${d}" fill="none" stroke="${t.cable}" stroke-width="4" stroke-linecap="round"/>`;

  // 第一格是调音表，吉他线从卡片左边进来
  const tx = x0;
  const tc = tx + pw / 2;
  const lcd = "#2b2635";
  const ticks: string[] = [];
  for (let k = -4; k <= 4; k++) {
    const tall = k === 0 ? 5 : 2.5;
    ticks.push(`<rect x="${n(tc + k * 9 - 0.75)}" y="${py + 74 - tall}" width="1.5" height="${tall * 2}" fill="${lcd}" opacity="${k === 0 ? 0.9 : 0.5}"/>`);
  }
  c.add(
    `<rect x="${tx}" y="${py + 5}" width="${pw}" height="${ph}" rx="12" fill="#000" opacity="${t.shadow * 0.7}"/>`,
    `<rect x="${tx}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="#34303f" stroke="${t.pedalEdge}"/>`,
    `<circle cx="${tc - 16}" cy="${py + 15}" r="2.6" fill="#ff7d94" opacity="0.35"/>`,
    `<circle cx="${tc + 16}" cy="${py + 15}" r="2.6" fill="#ff7d94" opacity="0.35"/>`,
    `<g class="tuned"><circle cx="${tc}" cy="${py + 15}" r="5" fill="${FILL.green}" filter="url(#ledGlow)" opacity="0.9"/><circle cx="${tc}" cy="${py + 15}" r="3" fill="#c9f2d4"/></g>`,
    `<rect x="${tx + 12}" y="${py + 28}" width="${pw - 24}" height="56" rx="6" fill="${FILL.yellow}"/>`,
    c.text(tc, py + 60, "A", { role: "display", size: 26, fill: lcd, anchor: "middle" }),
    c.text(tx + pw - 18, py + 41, "440", { role: "mono", size: 8, fill: lcd, anchor: "end", opacity: 0.6 }),
    ...ticks,
    `<path class="cent" d="M${tc - 4},${py + 64} L${tc + 4},${py + 64} L${tc},${py + 69} Z" fill="${lcd}"/>`,
    c.text(tc, py + 105, "TUNER", { role: "mono", size: 10.5, weight: 700, fill: "#f7f4f0", anchor: "middle", ls: 2, opacity: 0.8 }),
    metal(tc),
  );

  const last = x0 + (slots - 1) * (pw + gap) + pw;
  c.defs.push(`<clipPath id="gearClip"><rect width="900" height="274" rx="20"/></clipPath>`);
  const cables: string[] = [
    cable(`M-6,${py + 104} C${x0 - 54},${py + 104} ${x0 - 16},${jack - 30} ${x0 + 6},${jack}`),
    cable(`M${last - 6},${jack} C${last + 16},${jack - 30} ${last + 54},${py + 104} 906,${py + 104}`),
  ];
  PEDALS.forEach(([abbr, name, color], i) => {
    const px = x0 + (i + 1) * (pw + gap);
    const cx = px + pw / 2;
    const blink = abbr === "ND" ? ' class="tap"' : "";
    c.add(
      `<rect x="${px}" y="${py + 5}" width="${pw}" height="${ph}" rx="12" fill="#000" opacity="${t.shadow * 0.7}"/>`,
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="${color}" stroke="${t.pedalEdge}"/>`,
      `<g${blink}><circle cx="${cx}" cy="${py + 15}" r="5" fill="#ff5c7a" filter="url(#ledGlow)" opacity="0.9"/><circle cx="${cx}" cy="${py + 15}" r="3" fill="#ff7d94"/></g>`,
    );
    for (const kx of [px + 28, px + pw - 28]) {
      const a = (-135 + rand() * 270) * (Math.PI / 180);
      const ky = py + 40;
      c.add(
        `<circle cx="${kx}" cy="${ky}" r="11" fill="${t.ink}"/>`,
        `<line x1="${kx}" y1="${ky}" x2="${n(kx + Math.sin(a) * 8)}" y2="${n(ky - Math.cos(a) * 8)}" stroke="${t.paper}" stroke-width="2" stroke-linecap="round"/>`,
      );
    }
    c.add(c.text(cx, py + 88, abbr, { role: "display", size: 28, fill: t.ink, anchor: "middle" }));
    c.add(c.text(cx, py + 105, name, { role: "mono", size: 10.5, fill: t.ink, anchor: "middle", opacity: 0.72 }));
    c.add(metal(cx));
    const a = px - gap - 6;
    const b = px + 6;
    cables.push(cable(`M${a},${jack} C${a + 8},${jack - 34} ${b - 8},${jack - 34} ${b},${jack}`));
  });
  c.add(`<g clip-path="url(#gearClip)">${cables.join("")}</g>`);

  // 踏板上随手贴的贴纸
  const at = (i: number) => x0 + (i + 1) * (pw + gap);
  c.add(
    sticker(t, at(0) + 18, py + 124, -12, 0.72, DECAL.star(FILL.yellow)),
    sticker(t, at(2) + pw - 12, py + 8, 16, 0.78, DECAL.heart(FILL.pink)),
  );
  return c;
}

// ── 4 · 出勤表（应援棒海）──────────────────────────────────────────────

const LEVEL: Record<string, number> = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

function attendance(t: Theme): Card {
  const c = new Card(t, 900, 268);
  cardFrame(c);
  titleRow(c, "ATTENDANCE", "出勤表 · 近一年", [[`${contributions}`, t.orange], [" 次贡献", t.faint]]);

  c.css.push(
    ".pl{transform-box:fill-box;transform-origin:50% 100%;animation:sway 1.6s ease-in-out infinite alternate}",
    "@keyframes sway{from{transform:rotate(-9deg)}to{transform:rotate(9deg)}}",
  );
  c.defs.push(`<filter id="plGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>`);

  const x0 = 66;
  const x1 = 858;
  const px = (x1 - x0) / weeks.length;
  const y0 = 92;
  const py = 17;
  const glows: string[] = [];
  const lights: string[] = [];

  let lastMonth = -1;
  let lastLabelWeek = -10;
  weeks.forEach((w, wi) => {
    const first = w.contributionDays[0];
    const month = Number(first.date.slice(5, 7));
    if (month !== lastMonth) {
      if (wi - lastLabelWeek >= 3 && wi > 0) {
        c.add(c.text(x0 + wi * px, 80, `${month}月`, { size: 11, fill: t.faint }));
        lastLabelWeek = wi;
      }
      lastMonth = month;
    }
    for (const d of w.contributionDays) {
      const cx = x0 + wi * px + px / 2;
      const cy = y0 + d.weekday * py + py / 2;
      const lv = LEVEL[d.contributionLevel] ?? 0;
      if (lv === 0) {
        lights.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="1.8" fill="${t.strong}" opacity="0.5"/>`);
        continue;
      }
      if (lv >= 3) glows.push(`<circle cx="${n(cx)}" cy="${n(cy - 2.5)}" r="7.5" fill="${t.levels[lv]}"/>`);
      lights.push(
        `<g class="pl" style="animation-delay:${n(-wi * 0.09)}s">`,
        `<rect x="${n(cx - 3.25)}" y="${n(cy - 8)}" width="6.5" height="11" rx="3.25" fill="${t.levels[lv]}"/>`,
        `<rect x="${n(cx - 2.25)}" y="${n(cy + 3)}" width="4.5" height="5" rx="1" fill="${t.grip}"/>`,
        `</g>`,
      );
    }
  });
  for (const [r, label] of [[1, "一"], [3, "三"], [5, "五"]] as const) {
    c.add(c.text(44, y0 + r * py + py / 2 + 4, label, { size: 11, fill: t.faint, anchor: "middle" }));
  }
  c.add(`<g filter="url(#plGlow)" opacity="${t.glow * 0.8}">${glows.join("")}</g>`, ...lights);

  const [, hm, hd] = hottest.date.split("-").map(Number);
  c.add(
    c.text(
      x0,
      244,
      [
        ["最长连续 ", t.faint], [`${bestStreak}`], [" 天", t.muted], ["  ·  ", t.faint],
        ["最热 ", t.faint], [`${hm}/${hd}`], [`  ${hottest.contributionCount} 次`, t.muted],
      ],
      { role: "mono", size: 12 },
    ),
  );
  // 图例：少 → 多
  let lx = x1;
  c.add(c.text(lx, 244, "多", { size: 11, fill: t.faint, anchor: "end" }));
  lx -= 24;
  for (let lv = 4; lv >= 0; lv--) {
    const cy = 239;
    if (lv === 0) c.add(`<circle cx="${lx}" cy="${cy}" r="1.6" fill="${t.strong}" opacity="0.5"/>`);
    else c.add(`<rect x="${lx - 2.75}" y="${cy - 7}" width="5.5" height="10" rx="2.75" fill="${t.levels[lv]}"/><rect x="${lx - 2}" y="${cy + 3}" width="4" height="4.5" rx="1" fill="${t.grip}"/>`);
    lx -= 14;
  }
  c.add(c.text(lx - 2, 244, "少", { size: 11, fill: t.faint, anchor: "end" }));
  return c;
}

// ── 5 · 终演（门票半券）────────────────────────────────────────────────

function finale(t: Theme): Card {
  const c = new Card(t, 900, 220);
  const x0 = 16, y0 = 12, x1 = 884, y1 = 208, r = 16, nx = 676, nr = 13;
  const ticket = [
    `M${x0 + r},${y0}`, `H${nx - nr}`, `A${nr},${nr} 0 0 0 ${nx + nr},${y0}`, `H${x1 - r}`, `A${r},${r} 0 0 1 ${x1},${y0 + r}`,
    `V${y1 - r}`, `A${r},${r} 0 0 1 ${x1 - r},${y1}`, `H${nx + nr}`, `A${nr},${nr} 0 0 0 ${nx - nr},${y1}`, `H${x0 + r}`,
    `A${r},${r} 0 0 1 ${x0},${y1 - r}`, `V${y0 + r}`, `A${r},${r} 0 0 1 ${x0 + r},${y0}`, "Z",
  ].join(" ");
  c.add(
    `<path d="${ticket}" fill="${t.card}" stroke="${t.line}"/>`,
    `<line x1="${nx}" y1="${y0 + nr + 6}" x2="${nx}" y2="${y1 - nr - 6}" stroke="${t.strong}" stroke-dasharray="2 6" stroke-linecap="round"/>`,
  );

  c.add(`<path d="${PICK}" transform="translate(52 45) rotate(-14)" fill="${t.orange}"/>`);
  c.add(c.text(68, 50, "FINALE", { role: "mono", size: 13, weight: 700, ls: 2.5 }));
  c.add(c.text(68 + 6 * 10.3 + 10, 50, "終演", { size: 12.5, fill: t.muted }));
  // 结束乐队《忘れてやらない》的歌词，上中下日
  c.add(c.text(40, 108, [["「", t.orange], ["把错归结于天气吧"], ["」", t.orange]], { role: "zh", size: 32 }));
  c.add(c.text(54, 144, "ぜんぶ天気のせいでいいよ", { role: "hand", size: 18, fill: t.muted }));
  c.add(c.text(54 + 12 * 18 + 16, 144, "結束バンド「忘れてやらない」", { size: 12, fill: t.faint }));
  c.add(c.text(48, 184, `# 最后更新 · ${dotted(today)}`, { role: "mono", size: 11.5, fill: t.faint }));

  const sx = (nx + x1) / 2;
  c.add(c.text(sx, 48, "ADMIT ONE", { role: "mono", size: 11, fill: t.faint, anchor: "middle", ls: 3 }));
  c.add(c.text(sx, 74, "整理番号", { size: 12, fill: t.muted, anchor: "middle" }));
  c.add(c.text(sx, 116, "No.233", { role: "display", size: 34, fill: t.orange, anchor: "middle" }));
  const rand = rng(user.login);
  const bars: string[] = [];
  for (let x = sx - 64; x < sx + 64; ) {
    const w = 1 + Math.floor(rand() * 3);
    bars.push(`<rect x="${n(x)}" y="132" width="${w}" height="30" fill="${t.text}" opacity="0.8"/>`);
    x += w + 1 + Math.floor(rand() * 3);
  }
  c.add(...bars);
  c.add(c.text(sx, 184, dotted(today), { role: "mono", size: 11, fill: t.faint, anchor: "middle", ls: 1 }));

  // 入场时盖的章
  c.add(
    `<g transform="translate(850 58) rotate(-16)" opacity="0.85">`,
    `<circle r="27" fill="none" stroke="${t.pink}" stroke-width="2"/>`,
    `<circle r="22.5" fill="none" stroke="${t.pink}" stroke-width="0.8"/>`,
    c.text(0, 2, "入場済", { role: "display", size: 11, fill: t.pink, anchor: "middle" }),
    c.text(0, 13, dotted(today).slice(2), { role: "mono", size: 6.5, fill: t.pink, anchor: "middle" }),
    `</g>`,
  );
  return c;
}

// ── 6 · B 站贴纸（README 里单独包一层链接）────────────────────────────

function linkBili(t: Theme): Card {
  const c = new Card(t, 320, 104);
  const ink = "#2b2635";
  const ax = 62;
  const cy = 54;
  c.defs.push(`<clipPath id="face"><circle cx="${ax}" cy="${cy}" r="32"/></clipPath>`);

  // 头像左上角的三道强调线，画在贴纸外面
  for (const a of [200, 225, 250]) {
    const r = (a * Math.PI) / 180;
    const p = (d: number) => `${n(ax + Math.cos(r) * d)},${n(cy + Math.sin(r) * d)}`;
    c.add(`<path d="M${p(45)} L${p(54)}" stroke="${t.pink}" stroke-width="3" stroke-linecap="round"/>`);
  }

  const tv = [
    `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="M-6,-13 L-2,-8 M6,-13 L2,-8" stroke-width="2.4"/>`,
    `<rect x="-13" y="-8" width="26" height="19" rx="5" stroke-width="2.6"/>`,
    `<path d="M-7.5,-1.5 L-3.5,0.5 M7.5,-1.5 L3.5,0.5" stroke-width="2.2"/>`,
    `</g>`,
  ].join("");
  const body = [
    `<rect x="${ax}" y="28" width="240" height="52" rx="26" fill="${FILL.pink}"/>`,
    `<circle cx="${ax}" cy="${cy}" r="36" fill="${FILL.pink}"/>`,
    `<image href="data:image/jpeg;base64,${BILI.face}" x="${ax - 32}" y="${cy - 32}" width="64" height="64" clip-path="url(#face)"/>`,
    `<g transform="translate(${ax + 54} ${cy + 1})">${tv}</g>`,
    c.text(ax + 76, cy - 6, "bilibili", { role: "pop", size: 13, fill: ink, opacity: 0.75 }),
    c.text(ax + 76, cy + 16, BILI.name, { role: "pop", size: 22, fill: ink }),
    `<circle cx="${ax + 214}" cy="${cy}" r="15" fill="#fff"/>`,
    `<path d="M${ax + 209},${cy - 7} L${ax + 221},${cy} L${ax + 209},${cy + 7} Z" fill="#c9578d" stroke="#c9578d" stroke-width="2" stroke-linejoin="round"/>`,
  ].join("");
  const cut = `<rect x="${ax}" y="28" width="240" height="52" rx="26"/><circle cx="${ax}" cy="${cy}" r="36"/>`;
  c.add(`<g transform="rotate(-2 160 52)">${sticker(t, 0, 0, 0, 1, { cut, body }, 4)}</g>`);
  return c;
}

// ── 输出 ────────────────────────────────────────────────────────────────

const CARDS: [string, (t: Theme) => Card, string][] = [
  ["header", header, "Jiuai233 · ONE-MAN LIVE「自己一个人也没关系，声音总会被听见」"],
  ["profile", profile, "成员档案：Jiuai233 的 GitHub 数据"],
  ["gear", gear, "机材表：Jiuai233 常用的技术栈"],
  ["attendance", attendance, "出勤表：近一年的贡献"],
  ["finale", finale, "终演：「把错归结于天气吧」ぜんぶ天気のせいでいいよ"],
  ["link-bilibili", linkBili, `bilibili：${BILI.name}`],
];

for (const t of [DARK, LIGHT]) {
  for (const [name, build, label] of CARDS) {
    const card = build(t);
    const svg = card.render(await fontFaces(card.chars), label);
    writeFileSync(join(OUT, `${name}-${t.name}.svg`), svg);
    console.log(`${name}-${t.name}.svg  ${(svg.length / 1024).toFixed(0)} KB`);
  }
}
