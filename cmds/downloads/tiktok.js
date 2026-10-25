import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import https from 'https';
import zlib from 'zlib';
import axios from 'axios';
import cheerio from 'cheerio';

const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

async function downloadToFile(url, filename) {
  const filePath = path.join(tmpDir, filename);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fileStream = fs.createWriteStream(filePath);
  if (res.body.pipe) await pipeline(res.body, fileStream);
  else await pipeline(Readable.fromWeb(res.body), fileStream);
  return filePath;
}

const BASE_URL = "https://ssstik.io";
const HEADERS_BASE = {
  "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
};

async function getToken() {
  const res = await axios.get(`${BASE_URL}/id`, { headers: { ...HEADERS_BASE, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } });
  const $ = cheerio.load(res.data);
  let tt = null;
  $("script").each((_, el) => { const src = $(el).html() || ""; const match = src.match(/tt\s*=\s*["']([^"']+)["']/); if (match) tt = match[1]; });
  if (!tt) tt = $('input[name="tt"]').val();
  const cookies = res.headers["set-cookie"]?.map((c) => c.split(";")[0]).join("; ") || "";
  return { tt, cookies };
}

function parseResult(html) {
  const $ = cheerio.load(html);
  const result = { author: null, title: null, stats: {}, links: {} };
  result.author = $("h2").first().text().trim();
  result.title = $("p.maintext").first().text().trim();
  const statKeys = ["likes", "comments", "shares"];
  $(".trending-actions .d-flex").each((i, el) => { const val = $(el).find("div").last().text().trim(); if (statKeys[i]) result.stats[statKeys[i]] = val; });
  const sdLink = $("a.download_link.without_watermark:not(.without_watermark_hd)").attr("href") || $("a.download_link.without_watermark").attr("href");
  if (sdLink) result.links.no_watermark = sdLink;
  const hdLink = $("a.download_link.without_watermark_hd").attr("href");
  if (hdLink) result.links.hd = hdLink;
  const mp3Link = $("a.download_link.music").attr("href");
  if (mp3Link) result.links.mp3 = mp3Link;
  return result;
}

async function downloadTikTok_SSSTIK(tiktokUrl) {
  const { tt, cookies } = await getToken();
  if (!tt) throw new Error("Gagal ambil token tt");
  const params = new URLSearchParams({ id: tiktokUrl, locale: "id", tt });
  const res = await axios.post(`${BASE_URL}/abc?url=dl`, params.toString(), {
    headers: { ...HEADERS_BASE, accept: "*/*", "content-type": "application/x-www-form-urlencoded", "hx-current-url": `${BASE_URL}/id`, "hx-request": "true", "hx-target": "target", "hx-trigger": "_gcaptcha_pt", origin: BASE_URL, referer: `${BASE_URL}/id`, "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin", cookie: cookies },
  });
  return parseResult(res.data);
}

const agent = new https.Agent({ keepAlive: true });

function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method, headers: body ? { ...headers, 'content-length': Buffer.byteLength(body) } : headers, agent, maxHeaderSize: 1048576 };
    const req = https.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newHeaders = { ...headers };
        delete newHeaders.host;
        return resolve(request(res.headers.location, { method, headers: newHeaders, body }));
      }
      const chunks = [];
      const encoding = res.headers['content-encoding'];
      const stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress()) : encoding === 'deflate' ? res.pipe(zlib.createInflate()) : res;
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), headers: res.headers, status: res.statusCode }));
      stream.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractItemStruct(html) {
  const apiMatch = html.match(/<script id="api-data"[^>]*>([\s\S]*?)<\/script>/);
  if (apiMatch) {
    try {
      const j = JSON.parse(apiMatch[1]);
      let s = j?.videoDetail?.itemInfo?.itemStruct || j?.itemInfo?.itemStruct;
      if (s) return s;
      if (j?.ItemModule) {
        const firstId = Object.keys(j.ItemModule)[0];
        if (firstId && j.ItemModule[firstId]) return j.ItemModule[firstId];
      }
    } catch (_) {}
  }
  const uniMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (uniMatch) {
    try {
      const j = JSON.parse(uniMatch[1]);
      const defaultScope = j?.__DEFAULT_SCOPE__ || {};
      for (const key of Object.keys(defaultScope)) {
        const s = defaultScope[key]?.itemInfo?.itemStruct;
        if (s) return s;
      }
    } catch (_) {}
  }
  return null;
}

async function tiktok_ZENNZ(url) {
  const { text } = await request(url, {
    headers: {
      'sec-ch-ua': '"Mises";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'upgrade-insecure-requests': '1',
      'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-user': '?1',
      'sec-fetch-dest': 'document',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6',
      'priority': 'u=0, i'
    }
  });
  const detail = extractItemStruct(text);
  const isImage = !!detail.imagePost;
  let download;
  if (isImage) {
    download = (detail.imagePost.images || []).reduce((acc, img) => acc.concat(img?.imageURL?.urlList || []), []);
  } else {
    download = [detail.video?.downloadAddr, detail.video?.playAddr].filter(Boolean);
    if (detail.id) {
      try {
        const pUrl = `https://www.tiktok.com/player/api/v1/items?item_ids=${detail.id}`;
        const pText = await request(pUrl).then(r => r.text);
        const pJson = JSON.parse(pText);
        const directUrl = pJson.items?.[0]?.video_info?.url_list?.[0];
        if (directUrl) download.unshift(directUrl);
      } catch {}
    }
  }
  return {
    id: detail.id || detail.aweme_id || null,
    isVideo: !isImage,
    title: detail.desc || detail.suggestedWords?.[0] || '',
    duration: `${detail.video?.duration || detail.music?.duration || 0} second`,
    stats: { like: detail.stats?.diggCount || 0, views: detail.stats?.playCount || 0, share: detail.stats?.shareCount || 0, comment: detail.stats?.commentCount || 0 },
    download,
    author: { username: detail.author?.uniqueId || '', nickname: detail.author?.nickname || '' },
    music: { title: detail.music?.title || '', url: detail.music?.playUrl || null }
  };
}

async function tiktokDownload(url) {
  try {
    const z = await tiktok_ZENNZ(url);
    if (z.download?.length) return { title: z.title, author: z.author, duration: z.duration, stats: { likes: z.stats.like, comments: z.stats.comment, views: z.stats.views, shares: z.stats.share }, type: z.isVideo ? 'video' : 'image', dl: z.download, audio: z.music.url };
  } catch {}
  try {
    const s = await downloadTikTok_SSSTIK(url);
    const link = s.links.hd || s.links.no_watermark;
    if (link) return { title: s.title, author: { nickname: s.author }, type: 'video', dl: link, audio: s.links.mp3, stats: s.stats };
  } catch {}
  try {
    const r = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    if (j.code === 0) { const d = j.data; return { title: d.title, author: d.author, duration: d.duration, stats: { likes: d.digg_count, comments: d.comment_count, views: d.play_count, shares: d.share_count }, type: d.images ? 'image' : 'video', dl: d.images || d.play, audio: d.music }; }
  } catch {}
  return null;
}

async function tiktokSearch(query, deliriusUrl) {
  const urls = [];
  if (deliriusUrl) urls.push(`${deliriusUrl}/search/tiktoksearch?query=${encodeURIComponent(query)}`);
  urls.push(`https://api.delirius.store/search/tiktoksearch?query=${encodeURIComponent(query)}`);
  for (const ep of urls) {
    try {
      const r = await fetch(ep);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.status === 200 && Array.isArray(j.meta) && j.meta.length) return j.meta;
      if (Array.isArray(j.data) && j.data.length) return j.data;
    } catch {}
  }
  return [];
}

export default {
  command: ['tiktok', 'tt', 'tiktoksearch', 'ttsearch', 'tts'],
  category: 'downloader',
  description: 'busca y descarga videos de tik tok',
  run: async (...params) => {
    let sock, msg, m, args, usedPrefix = '.', command = 'tt';
    if (params[0]?.msg) { const ctx = params[0]; msg = ctx.msg; sock = ctx.sock; m = msg; args = ctx.args || []; usedPrefix = ctx.usedPrefix || '.'; command = ctx.command || 'tt'; }
    else { const [client, mm, a, up, cmd] = params; sock = client; msg = mm; m = mm; args = a || []; usedPrefix = up || '.'; command = cmd || 'tt'; }
    const reply = async (t) => { if (m?.reply) return m.reply(t); return sock.sendMessage(m.chat || msg.chat, { text: t }, { quoted: msg || m }); };
    if (!args.length) return reply(`《✧》 Por favor, ingresa un término de búsqueda o enlace de TikTok.`);
    const text = args.join(' ').trim();
    const isUrl = /tiktok\.com\//i.test(text);
    const deliriusUrl = global.APIs?.delirius?.url;
    try {
      if (isUrl) {
        const data = await tiktokDownload(text);
        if (!data) return reply('《✧》 No se encontró contenido válido en TikTok o el video es privado.');
        const caption = `ㅤ۟∩　ׅ　★ ໌ fatal　ׅ　🅣𝗂𝗄𝖳𝗈𝗄 🅓ownload　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ✎ ׄ ⬭ *Título:* ${data.title || 'Sin título'}\n𖣣ֶㅤ֯⌗ ꕥ ׄ ⬭ *Autor:* ${data.author?.nickname || data.author?.unique_id || 'Desconocido'}\n𖣣ֶㅤ֯⌗ ⴵ ׄ ⬭ *Duración:* ${data.duration || 'N/A'}\n𖣣ֶㅤ֯⌗ ❖ ׄ ⬭ *Likes:* ${(data.stats?.likes || data.stats?.like || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❀ ׄ ⬭ *Comentarios:* ${(data.stats?.comments || data.stats?.comment || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ✿ ׄ ⬭ *Vistas:* ${(data.stats?.views || data.stats?.play || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☆ ׄ ⬭ *Compartidos:* ${(data.stats?.shares || data.stats?.share || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☁︎ ׄ ⬭ *Fecha:* ${data.created_at || 'N/A'}`.trim();
        const temp = [];
        try {
          if (data.type === 'image') {
            const arr = Array.isArray(data.dl) ? data.dl : [data.dl];
            const medias = [];
            for (let i = 0; i < arr.length; i++) { const p = await downloadToFile(arr[i], `tt_img_${Date.now()}_${i}.jpg`); temp.push(p); medias.push({ type: 'image', data: { url: p }, caption: i === 0 ? caption : '' }); }
            await sock.sendAlbumMessage(msg.chat || m.chat, medias, { quoted: msg || m });
          } else {
            const vurl = Array.isArray(data.dl) ? data.dl[0] : data.dl;
            const vp = await downloadToFile(vurl, `tt_video_${Date.now()}.mp4`);
            temp.push(vp);
            await sock.sendMessage(msg.chat || m.chat, { video: { url: vp }, caption }, { quoted: msg || m });
          }
        } finally { for (let f of temp) try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
      } else {
        await reply('🕒 Buscando en TikTok...');
        const results = await tiktokSearch(text, deliriusUrl) || [];
        if (!results.length) return reply(`《✧》 No se encontraron resultados para *${text}*.`);
        const validResults = results.filter(v => v && (v.hd || v.play || v.dl));
        if (!validResults.length) return reply(`《✧》 No se encontraron resultados para *${text}*.`);
        const temp = [];
        try {
          const items = validResults.slice(0, 10);
          const medias = [];
          for (let i = 0; i < items.length; i++) {
            const v = items[i];
            const cap = `ㅤ۟∩　ׅ　★ ໌　ׅ　🅣𝗂𝗄𝖳𝗈𝗄 🅢earch　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ✎ ׄ ⬭ *Título:* ${v.title || 'Sin título'}\n𖣣ֶㅤ֯⌗ ꕥ ׄ ⬭ *Autor:* ${v.author?.nickname || 'Desconocido'} ${v.author?.username ? `@${v.author.username}` : ''}\n𖣣ֶㅤ֯⌗ ⴵ ׄ ⬭ *Duración:* ${v.duration || 'N/A'}\n𖣣ֶㅤ֯⌗ ❖ ׄ ⬭ *Likes:* ${(v.like || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❀ ׄ ⬭ *Comentarios:* ${(v.coment || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ✿ ׄ ⬭ *Vistas:* ${(v.play || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☆ ׄ ⬭ *Compartidos:* ${(v.share || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❒ ׄ ⬭ *Audio:* ${v.music?.title || 'Sonido original'}`.trim();
            const urlDl = v.hd || v.play || v.dl;
            const vp = await downloadToFile(urlDl, `tt_search_${Date.now()}_${i}.mp4`);
            temp.push(vp);
            medias.push({ type: 'video', data: { url: vp }, caption: cap });
          }
          await sock.sendAlbumMessage(msg.chat || m.chat, medias, { quoted: msg || m });
        } finally { for (let f of temp) try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
      }
    } catch (e) { await reply(`> Error en *${usedPrefix + command}*: ${e.message}`); }
  }
}