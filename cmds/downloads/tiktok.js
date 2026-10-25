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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fileStream = fs.createWriteStream(filePath);
  if (typeof res.body.pipe === 'function') {
    await pipeline(res.body, fileStream);
  } else {
    await pipeline(Readable.fromWeb(res.body), fileStream);
  }
  return filePath;
}

// --- SCRAPPER 1: ZENNZ XD (directo) ---
const agent = new https.Agent({ keepAlive: true });
function requestTikTok(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method, headers: body ? { ...headers, 'content-length': Buffer.byteLength(body) } : headers, agent, maxHeaderSize: 1048576 };
    const req = https.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newHeaders = { ...headers }; delete newHeaders.host;
        return resolve(requestTikTok(res.headers.location, { method, headers: newHeaders, body }));
      }
      const chunks = []; const encoding = res.headers['content-encoding'];
      const stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress()) : encoding === 'deflate' ? res.pipe(zlib.createInflate()) : res;
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), headers: res.headers, status: res.statusCode }));
      stream.on('error', reject);
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
function extractItemStruct(html) {
  const apiMatch = html.match(/<script id="api-data"[^>]*>([\s\S]*?)<\/script>/);
  if (apiMatch) { try { const j = JSON.parse(apiMatch[1]); let s = j?.videoDetail?.itemInfo?.itemStruct || j?.itemInfo?.itemStruct; if (s) return s; if (j?.ItemModule) { const firstId = Object.keys(j.ItemModule)[0]; if (firstId) return j.ItemModule[firstId]; } } catch (_) {} }
  const uniMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (uniMatch) { try { const j = JSON.parse(uniMatch[1]); const defaultScope = j?.__DEFAULT_SCOPE__ || {}; for (const key of Object.keys(defaultScope)) { const s = defaultScope[key]?.itemInfo?.itemStruct; if (s) return s; } } catch (_) {} }
  return null;
}
async function tiktokZennz(url) {
  const { text } = await requestTikTok(url, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36', 'accept': 'text/html', 'accept-encoding': 'gzip, deflate, br', 'accept-language': 'en-US,en;q=0.9' } });
  const detail = extractItemStruct(text); if (!detail) throw new Error('No struct');
  const isImage = !!detail.imagePost;
  let dl = isImage ? (detail.imagePost.images || []).reduce((a, img) => a.concat(img?.imageURL?.urlList || []), []) : [detail.video?.downloadAddr, detail.video?.playAddr].filter(Boolean);
  return { title: detail.desc || '', author: { nickname: detail.author?.nickname, unique_id: detail.author?.uniqueId }, duration: detail.video?.duration, stats: { likes: detail.stats?.diggCount, comments: detail.stats?.commentCount, views: detail.stats?.playCount, shares: detail.stats?.shareCount }, created_at: detail.createTime ? new Date(detail.createTime*1000).toLocaleString() : 'N/A', type: isImage ? 'image' : 'video', dl, audio: detail.music?.playUrl };
}

// --- SCRAPPER 2: SSSTIK.IO ---
async function tiktokSSStik(tiktokUrl) {
  const BASE_URL = "https://ssstik.io";
  const HEADERS_BASE = { "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/137.0.0.0 Mobile Safari/537.36" };
  const res1 = await axios.get(`${BASE_URL}/id`, { headers: { ...HEADERS_BASE, accept: "text/html" } });
  const $1 = cheerio.load(res1.data); let tt = null;
  $1("script").each((_, el) => { const src = $1(el).html() || ""; const m = src.match(/tt\s*=\s*["']([^"']+)["']/); if (m) tt = m[1]; });
  if (!tt) tt = $1('input[name="tt"]').val();
  const cookies = res1.headers["set-cookie"]?.map(c => c.split(";")[0]).join("; ") || "";
  const params = new URLSearchParams({ id: tiktokUrl, locale: "id", tt });
  const res2 = await axios.post(`${BASE_URL}/abc?url=dl`, params.toString(), { headers: { ...HEADERS_BASE, accept: "*/*", "content-type": "application/x-www-form-urlencoded", origin: BASE_URL, referer: `${BASE_URL}/id`, cookie: cookies } });
  const $ = cheerio.load(res2.data);
  const sd = $("a.download_link.without_watermark:not(.without_watermark_hd)").attr("href") || $("a.download_link.without_watermark").attr("href");
  const hd = $("a.download_link.without_watermark_hd").attr("href");
  const mp3 = $("a.download_link.music").attr("href");
  if (!sd && !hd) throw new Error('ssstik no links');
  return { title: $("p.maintext").first().text().trim() || 'TikTok', author: { nickname: $("h2").first().text().trim() }, duration: null, stats: {}, created_at: 'N/A', type: 'video', dl: hd || sd, audio: mp3 };
}

export default {
  command: ['tiktok', 'tt', 'tiktoksearch', 'ttsearch', 'tts'],
  category: 'downloader',
  description: 'busca y descarga videos de tik tok',
  run: async (...params) => {
    let client, m, args, usedPrefix, command, msg, sock;
    if (params[0]?.msg || params[0]?.sock) {
      const ctx = params[0]; msg = ctx.msg; sock = ctx.sock; client = sock; m = msg;
      args = ctx.args || []; usedPrefix = ctx.usedPrefix || '.'; command = ctx.command || 'tt';
    } else { [client, m, args, usedPrefix, command] = params; msg = m; sock = client; }
    const safeArgs = args || [];
    const reply = async (text) => { if (m?.reply) return m.reply(text); if (msg?.reply) return msg.reply(text); return (sock || client).sendMessage((m?.chat || msg?.chat), { text }, { quoted: msg || m }); };
    if (!safeArgs.length) return reply(`《✧》 Por favor, ingresa un término de búsqueda o enlace de TikTok.`);
    const text = safeArgs.join(" ").trim();
    const isUrl = /(?:https:?\/{2})?(?:w{3}|vm|vt|t)?\.?tiktok.com\/([^\s&]+)/gi.test(text);
    const evogbUrl = global.APIs?.evogb?.url || global.links?.api;
    const evogbKey = global.APIs?.evogb?.key;
    const deliriusUrl = global.APIs?.delirius?.url;
    try {
      if (isUrl) {
        const data = await tiktokDownload(text, evogbUrl, evogbKey, deliriusUrl);
        if (!data) return reply('《✧》 No se encontró contenido válido o es privado.');
        const caption = `ㅤ۟∩　ׅ　★ ໌ fatal　ׅ　🅣𝗂𝗄𝖳𝗈𝗄 🅓ownload　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ✎ ׄ ⬭ *Título:* ${data.title || 'Sin título'}\n𖣣ֶㅤ֯⌗ ꕥ ׄ ⬭ *Autor:* ${data.author?.nickname || data.author?.unique_id || 'Desconocido'}\n𖣣ֶㅤ֯⌗ ⴵ ׄ ⬭ *Duración:* ${data.duration || 'N/A'}\n𖣣ֶㅤ֯⌗ ❖ ׄ ⬭ *Likes:* ${(data.stats?.likes || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❀ ׄ ⬭ *Comentarios:* ${(data.stats?.comments || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ✿ ׄ ⬭ *Vistas:* ${(data.stats?.views || 0).toLocaleString()}`.trim();
        const tempFiles = [];
        try {
          if (data.type === 'image') {
            const dlArray = Array.isArray(data.dl) ? data.dl : [data.dl];
            const medias = []; for (let i = 0; i < dlArray.length; i++) { const p = await downloadToFile(dlArray[i], `tt_img_${Date.now()}_${i}.jpg`); tempFiles.push(p); medias.push({ type: 'image', data: { url: p }, caption: i === 0 ? caption : '' }); }
            await (sock || client).sendAlbumMessage((msg?.chat || m?.chat), medias, { quoted: msg || m });
            if (data.audio) { const ap = await downloadToFile(data.audio, `tt_audio_${Date.now()}.mp4`); tempFiles.push(ap); await (sock || client).sendMessage((msg?.chat || m?.chat), { audio: { url: ap }, mimetype: 'audio/mp4' }, { quoted: msg || m }); }
          } else {
            const videoUrl = Array.isArray(data.dl) ? data.dl[0] : data.dl;
            const videoPath = await downloadToFile(videoUrl, `tt_video_${Date.now()}.mp4`); tempFiles.push(videoPath);
            await (sock || client).sendMessage((msg?.chat || m?.chat), { video: { url: videoPath }, caption }, { quoted: msg || m });
          }
        } finally { for (const fp of tempFiles) { try { if (fs.existsSync(fp)) await fs.promises.unlink(fp); } catch {} } }
      } else {
        await reply('🕒 Buscando en TikTok...');
        const results = await tiktokSearch(text, evogbUrl, evogbKey, deliriusUrl) || [];
        if (!results.length) return reply(`《✧》 No se encontraron resultados para *${text}*.`);
        const validResults = results.filter(v => v && v.hd); if (!validResults.length) return reply(`《✧》 Sin resultados válidos.`);
        const tempFiles = [];
        try {
          const items = validResults.slice(0, 5);
          const medias = []; for (let i = 0; i < items.length; i++) { const v = items[i]; const cap = `🅣𝗂𝗄𝖳𝗈𝗄 🅢earch\n\n*Título:* ${v.title || 'Sin título'}\n*Autor:* ${v.author?.nickname || 'Desconocido'}`.trim(); const vp = await downloadToFile(v.hd, `tt_search_${Date.now()}_${i}.mp4`); tempFiles.push(vp); medias.push({ type: 'video', data: { url: vp }, caption: cap }); }
          await (sock || client).sendAlbumMessage((msg?.chat || m?.chat), medias, { quoted: msg || m });
        } finally { for (const fp of tempFiles) { try { if (fs.existsSync(fp)) await fs.promises.unlink(fp); } catch {} } }
      }
    } catch (e) { await reply(`> Error en ${usedPrefix + command}: ${e.message}`); }
  }
};

async function tiktokDownload(url, evogbUrl, evogbKey, deliriusUrl) {
  if (evogbUrl) { try { const endpoint = `${evogbUrl}/dl/tiktok?url=${encodeURIComponent(url)}${evogbKey ? `&key=${evogbKey}` : ''}`; const res = await fetch(endpoint); if (res.ok) { const json = await res.json(); const d = json?.data || json?.result || json; if (d?.play || d?.dl || d?.video || d?.hd) return { title: d.title || d.desc, author: d.author, duration: d.duration, stats: { likes: d.like || d.digg_count, comments: d.comment || d.comment_count, views: d.play_count || d.views, shares: d.share_count }, created_at: 'N/A', type: d.images ? 'image' : 'video', dl: d.images || d.play || d.hd || d.video || d.dl, audio: d.music?.url || d.music }; } } catch {} }
  if (deliriusUrl) { try { const endpoint = `${deliriusUrl}/download/tiktok?url=${encodeURIComponent(url)}`; const res = await fetch(endpoint); if (res.ok) { const json = await res.json(); const d = json?.data || json; if (d) return { title: d.title, author: d.author, duration: d.duration, stats: { likes: d.like, comments: d.comment, views: d.views, shares: d.share }, created_at: d.created_at || 'N/A', type: d.type || 'video', dl: d.hd || d.wm || d.play, audio: d.music }; } } catch {} }
  try { const data = await tiktokZennz(url); if (data?.dl?.length) return data; } catch (e) { console.log('zennz fail', e.message); }
  try { const data = await tiktokSSStik(url); if (data?.dl) return data; } catch (e) { console.log('ssstik fail', e.message); }
  try { const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`; const res = await fetch(endpoint); const json = await res.json(); if (json.code === 0) { const d = json.data; return { title: d.title, author: d.author, duration: d.duration, stats: { likes: d.digg_count, comments: d.comment_count, views: d.play_count, shares: d.share_count }, created_at: d.create_time ? new Date(d.create_time * 1000).toLocaleString() : 'N/A', type: d.images ? 'image' : 'video', dl: d.images || d.play, audio: d.music }; } } catch {}
  return null;
}

async function tiktokSearch(query, evogbUrl, evogbKey, deliriusUrl) {
  if (evogbUrl) { try { const endpoint = `${evogbUrl}/search/tiktok?query=${encodeURIComponent(query)}${evogbKey ? `&key=${evogbKey}` : ''}`; const res = await fetch(endpoint); if (res.ok) { const json = await res.json(); const raw = json?.data || []; if (Array.isArray(raw) && raw.length) return raw.map(x => ({ title: x.title, hd: x.dl || x.play || x.video, duration: x.duration, like: x.stats?.likes || 0, coment: x.stats?.comments || 0, play: x.stats?.views || 0, share: x.stats?.shares || 0, author: { nickname: x.author?.nickname }, music: { title: x.music?.title } })).filter(v => v.hd); } } catch {} }
  const fallbacks = []; if (deliriusUrl) fallbacks.push(`${deliriusUrl}/search/tiktoksearch?query=${encodeURIComponent(query)}`); fallbacks.push(`https://api.delirius.store/search/tiktoksearch?query=${encodeURIComponent(query)}`);
  for (const endpoint of fallbacks) { try { const res = await fetch(endpoint); if (!res.ok) continue; const json = await res.json(); if (json.status === 200 && Array.isArray(json.meta) && json.meta.length) return json.meta; } catch {} }
  return [];
}