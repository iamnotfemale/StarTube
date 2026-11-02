// channels.txt → videos.json (YouTube Data API v3). 실행: node --env-file=.env fetch.mjs
// 쿼터: 채널당 하루 2~3 unit (무료 한도 10,000/일). 기존 데이터에 누적한다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const KEY = process.env.YT_API_KEY;
if (!KEY) throw new Error("YT_API_KEY 가 없습니다 (.env 또는 GitHub Secret)");
const OUT = "videos.json";
const FIRST_RUN_PAGES = 20; // 처음 등록된 채널은 최근 1000개까지 백필
const SHORT_MAX_SEC = 180;  // ponytail: 길이로 쇼츠 판정. 3분 이하 일반 영상도 빠짐 → 필요하면 /shorts/ID 확인 추가

const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { channels: [], videos: [] };
const entries = readFileSync("channels.txt", "utf8").split(/\r?\n/).map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#")).map((l) => l.split("|").map((s) => s.trim()))
  .map(([category, handle]) => ({ category, handle }));

async function api(path, params) {
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: KEY })}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const sec = (iso) => { const [, h = 0, m = 0, s = 0] = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) ?? []; return +h * 3600 + +m * 60 + +s; };
const hadVideos = new Set(old.videos.map((v) => v.channel));
const channels = [], fresh = [];

for (const { category, handle } of entries) {
  try {
    const q = handle.startsWith("UC") ? { id: handle } : { forHandle: handle };
    const ch = (await api("channels", { part: "snippet,contentDetails", ...q })).items?.[0];
    if (!ch) throw new Error("채널을 찾지 못함");
    channels.push({ id: ch.id, handle, category, name: ch.snippet.title, avatar: ch.snippet.thumbnails.default.url });

    let ids = [], pageToken;
    for (let p = 0; p < (hadVideos.has(ch.id) ? 1 : FIRST_RUN_PAGES); p++) {
      const pl = await api("playlistItems", { part: "contentDetails", maxResults: 50, playlistId: ch.contentDetails.relatedPlaylists.uploads, ...(pageToken && { pageToken }) });
      ids.push(...pl.items.map((i) => i.contentDetails.videoId));
      if (!(pageToken = pl.nextPageToken)) break;
    }
    for (let i = 0; i < ids.length; i += 50) {
      const { items } = await api("videos", { part: "snippet,contentDetails,statistics,status", id: ids.slice(i, i + 50).join(",") });
      for (const v of items) {
        const dur = sec(v.contentDetails.duration);
        // 쇼츠·예정/진행중 라이브·임베드 금지 영상 제외
        if (dur <= SHORT_MAX_SEC || v.snippet.liveBroadcastContent !== "none" || !v.status.embeddable) continue;
        fresh.push({ id: v.id, channel: ch.id, title: v.snippet.title, desc: v.snippet.description.slice(0, 500),
          published: v.snippet.publishedAt, views: +(v.statistics.viewCount ?? 0), dur });
      }
    }
  } catch (err) {
    console.warn(`⚠ ${handle}: ${err.message}`);
    const prev = old.channels.find((c) => c.handle === handle);
    if (prev) channels.push({ ...prev, category });
  }
}

// 새로 가져온 것으로 갱신하고, 지금도 등록된 채널의 과거 영상은 유지
const live = new Set(channels.map((c) => c.id));
const merged = new Map(old.videos.filter((v) => live.has(v.channel)).map((v) => [v.id, v]));
for (const v of fresh) merged.set(v.id, v);
const videos = [...merged.values()].sort((a, b) => b.published.localeCompare(a.published));

// hidden.txt: 관리 탭에서 숨긴 영상 ID (한 줄에 하나, # 뒤는 메모)
const hidden = new Set(existsSync("hidden.txt") ? readFileSync("hidden.txt", "utf8").split(/\r?\n/).map((l) => l.split("#")[0].trim()).filter(Boolean) : []);
const shown = videos.filter((v) => !hidden.has(v.id));

writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), channels, videos: shown }));
console.log(`채널 ${channels.length}개, 영상 ${shown.length}개 (숨김 ${videos.length - shown.length}개)`);
