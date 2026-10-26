import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const LOGIN = "jiuai233";
const BILI_MID = 23360518;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// GitHub：公开仓库的语言和近一年的贡献日历，用本机 gh 的登录态
const query = `query($login: String!) { user(login: $login) { login
  repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) { nodes { name isFork
    languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } } }
  contributionsCollection { contributionCalendar { totalContributions
    weeks { contributionDays { date contributionCount contributionLevel weekday } } } } } }`;
const stats = execFileSync("gh", ["api", "graphql", "-f", `query=${query}`, "-f", `login=${LOGIN}`], { encoding: "utf8" });
writeFileSync(join(DATA, "stats.json"), JSON.stringify(JSON.parse(stats), null, 2) + "\n");

// B 站：昵称和头像
const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${BILI_MID}`, { headers: { "User-Agent": UA } });
const body = await res.json();
if (body.code !== 0) throw new Error(`bilibili card: ${body.code} ${body.message}`);
const { name, face } = body.data.card;
const img = await fetch(`${face}@240w_240h_1c.jpg`, { headers: { "User-Agent": UA } });
if (!img.ok) throw new Error(`bilibili face: ${img.status}`);
writeFileSync(join(DATA, "bili-face.jpg"), Buffer.from(await img.arrayBuffer()));
writeFileSync(join(DATA, "bili.json"), JSON.stringify({ mid: BILI_MID, name }, null, 2) + "\n");

console.log(`stats.json · bili.json（${name}）· bili-face.jpg 已更新`);
