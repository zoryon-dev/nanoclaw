#!/usr/bin/env node
// YouTube search/details helper for Lobby.
// Credentials are injected by the OneCLI proxy — pass key=onecli-managed.
// Usage:
//   node yt.mjs search "<query>" [--max N] [--order relevance|date|viewCount|rating]
//                                [--no-shorts] [--min-min M] [--max-min M]
//                                [--region BR] [--lang pt] [--published-after ISO]
//                                [--channel CHANNEL_ID] [--json]
//   node yt.mjs details <videoId>[,<videoId>...] [--json]
//   node yt.mjs channel "<query>" [--max N] [--json]
//
// Output (default): human-readable lines. With --json: raw structured array.

const API = "https://www.googleapis.com/youtube/v3";
const KEY = "onecli-managed";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const flagOnly = ["no-shorts", "json"];
      if (flagOnly.includes(k)) out[k] = true;
      else out[k] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

async function api(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  url.searchParams.set("key", KEY);
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) {
    const e = body?.error;
    if (e?.error === "access_restricted" || e?.manage_url) {
      throw new Error(`ACCESS_RESTRICTED|${e.manage_url || ""}`);
    }
    const msg = e?.message || JSON.stringify(body);
    throw new Error(`API_${r.status}|${msg}`);
  }
  return body;
}

// ISO 8601 duration (PT#H#M#S) -> seconds + pretty string
function parseDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || [];
  const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
  const total = h * 3600 + mi * 60 + s;
  const pretty = h
    ? `${h}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${mi}:${String(s).padStart(2, "0")}`;
  return { total, pretty };
}

function fmtViews(n) {
  n = +n || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtDate(iso) {
  // YYYY-MM-DD... -> DD/MM/YYYY
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || "");
}

async function search(args) {
  const q = args._[0];
  if (!q) throw new Error("usage: search \"<query>\"");
  const max = Math.min(+(args.max || 8), 25);
  // Over-fetch a bit when filtering by duration so we still return ~max results.
  const fetchN = args["no-shorts"] || args["min-min"] || args["max-min"]
    ? Math.min(max * 3, 50) : max;

  const res = await api("search", {
    part: "snippet",
    q,
    type: "video",
    maxResults: fetchN,
    order: args.order || "relevance",
    regionCode: args.region || "BR",
    relevanceLanguage: args.lang || "pt",
    publishedAfter: args["published-after"],
    channelId: args.channel,
  });

  const ids = (res.items || []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) return [];

  // Enrich with duration + stats (search endpoint lacks these).
  const det = await api("videos", {
    part: "contentDetails,statistics,snippet",
    id: ids.join(","),
  });
  const byId = new Map((det.items || []).map((v) => [v.id, v]));

  let rows = ids.map((id) => {
    const v = byId.get(id);
    if (!v) return null;
    const d = parseDuration(v.contentDetails?.duration);
    return {
      id,
      url: `https://youtu.be/${id}`,
      title: v.snippet?.title,
      channel: v.snippet?.channelTitle,
      published: v.snippet?.publishedAt,
      publishedPretty: fmtDate(v.snippet?.publishedAt),
      durationSec: d.total,
      duration: d.pretty,
      views: +(v.statistics?.viewCount || 0),
      viewsPretty: fmtViews(v.statistics?.viewCount),
      likes: +(v.statistics?.likeCount || 0),
      isShort: d.total > 0 && d.total <= 60,
    };
  }).filter(Boolean);

  if (args["no-shorts"]) rows = rows.filter((r) => !r.isShort);
  if (args["min-min"]) rows = rows.filter((r) => r.durationSec >= +args["min-min"] * 60);
  if (args["max-min"]) rows = rows.filter((r) => r.durationSec <= +args["max-min"] * 60);

  return rows.slice(0, max);
}

async function details(args) {
  const ids = (args._[0] || "").split(",").filter(Boolean);
  if (!ids.length) throw new Error("usage: details <videoId>[,<id>...]");
  const det = await api("videos", {
    part: "contentDetails,statistics,snippet",
    id: ids.join(","),
  });
  return (det.items || []).map((v) => {
    const d = parseDuration(v.contentDetails?.duration);
    return {
      id: v.id,
      url: `https://youtu.be/${v.id}`,
      title: v.snippet?.title,
      channel: v.snippet?.channelTitle,
      published: v.snippet?.publishedAt,
      publishedPretty: fmtDate(v.snippet?.publishedAt),
      duration: d.pretty,
      durationSec: d.total,
      views: +(v.statistics?.viewCount || 0),
      viewsPretty: fmtViews(v.statistics?.viewCount),
      likes: +(v.statistics?.likeCount || 0),
      comments: +(v.statistics?.commentCount || 0),
      description: v.snippet?.description,
    };
  });
}

async function channel(args) {
  const q = args._[0];
  if (!q) throw new Error("usage: channel \"<query>\"");
  const max = Math.min(+(args.max || 5), 25);
  const res = await api("search", {
    part: "snippet", q, type: "channel", maxResults: max,
    regionCode: args.region || "BR",
  });
  return (res.items || []).map((c) => ({
    id: c.id.channelId,
    title: c.snippet?.channelTitle,
    url: `https://youtube.com/channel/${c.id.channelId}`,
    description: c.snippet?.description,
  }));
}

function printHuman(cmd, rows) {
  if (!rows.length) { console.log("(nenhum resultado)"); return; }
  if (cmd === "channel") {
    rows.forEach((c, i) => {
      console.log(`${i + 1}. ${c.title}`);
      console.log(`   ${c.url}`);
      if (c.description) console.log(`   ${c.description.slice(0, 120)}`);
    });
    return;
  }
  rows.forEach((r, i) => {
    const short = r.isShort ? " [SHORT]" : "";
    console.log(`${i + 1}. ${r.title}${short}`);
    console.log(`   ${r.channel} · ${r.duration} · ${r.viewsPretty} views · ${r.publishedPretty}`);
    console.log(`   ${r.url}`);
  });
}

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();
  const args = parseArgs(argv);
  try {
    let rows;
    if (cmd === "search") rows = await search(args);
    else if (cmd === "details") rows = await details(args);
    else if (cmd === "channel") rows = await channel(args);
    else { console.error("commands: search | details | channel"); process.exit(2); }

    if (args.json) console.log(JSON.stringify(rows, null, 2));
    else printHuman(cmd, rows);
  } catch (e) {
    const [code, extra] = String(e.message).split("|");
    if (code === "ACCESS_RESTRICTED") {
      console.error(`ERRO: este agente não tem acesso à credencial do YouTube no OneCLI.`);
      if (extra) console.error(`Conceda acesso: ${extra}`);
    } else if (code.startsWith("API_403") && /SERVICE_DISABLED|accessNotConfigured/.test(extra)) {
      console.error(`ERRO: YouTube Data API v3 não está habilitada no projeto Google Cloud.`);
      console.error(`Habilite e tente de novo.`);
    } else {
      console.error(`ERRO: ${e.message}`);
    }
    process.exit(1);
  }
})();
