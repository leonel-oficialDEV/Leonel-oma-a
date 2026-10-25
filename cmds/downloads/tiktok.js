import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import https from 'https';
import zlib from 'zlib';

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

// === SCRAPPER 1 ZENNZ ===
const agent = new https.Agent({ keepAlive: true });
function reqTT(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, agent, maxHeaderSize: 1048576 };
    const req = https.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(reqTT(res.headers.location, headers));
      const chunks = []; const enc = res.headers['content-encoding'];
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res;
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
      stream.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}
function extractStruct(html) {
  let m = html.match(/<script id="api-data"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { const j = JSON.parse(m[1]); return j?.videoDetail?.itemInfo?.itemStruct || j?.itemInfo?.itemStruct || Object.values(j?.ItemModule||{})[0]; } catch {} }
  m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { const j = JSON.parse(m[1]); const def = j?.__DEFAULT_SCOPE__; for (let k in def) if (def[k]?.itemInfo?.itemStruct) return def[k].itemInfo.itemStruct; } catch {} }
  return null;
}
async function scrapperZennz(url) {
  const { text } = await reqTT(url, { 'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36', 'accept-encoding': 'gzip, deflate, br' });
  const d = extractStruct(text); if (!d) throw new Error('No struct');
  const isImg = !!d.imagePost;
  let dl = isImg ? (d.imagePost.images||[]).flatMap(i=>i?.imageURL?.urlList||[]) : [d.video?.downloadAddr, d.video?.playAddr].filter(Boolean);
  if (!isImg && d.id) { try { const p = await reqTT(`https://www.tiktok.com/player/api/v1/items?item_ids=${d.id}`); const pj = JSON.parse(p.text); const u = pj.items?.[0]?.video_info?.url_list?.[0]; if (u) dl.unshift(u); } catch {} }
  return { title: d.desc||'', author: { nickname: d.author?.nickname, unique_id: d.author?.uniqueId }, duration: `${d.video?.duration||0} second`, stats: { likes: d.stats?.diggCount, comments: d.stats?.commentCount, views: d.stats?.playCount, shares: d.stats?.shareCount }, created_at: d.createTime ? new Date(d.createTime*1000).toLocaleString() : 'N/A', type: isImg?'image':'video', dl, audio: d.music?.playUrl };
}

// === SCRAPPER 2 SSSTIK ===
async function scrapperSSStik(tiktokUrl) {
  const BASE = "https://ssstik.io";
  const r1 = await fetch(`${BASE}/id`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const html1 = await r1.text();
  let tt = html1.match(/tt\s*=\s*["']([^"']+)["']/)?.[1] || html1.match(/name="tt"[^>]*value="([^"]+)"/)?.[1];
  if (!tt) throw new Error('No tt token');
  const cookies = (r1.headers.get('set-cookie')||'').split(',').map(c=>c.split(';')[0]).join('; ');
  const body = new URLSearchParams({ id: tiktokUrl, locale: "id", tt }).toString();
  const r2 = await fetch(`${BASE}/abc?url=dl`, { method: 'POST', headers: { 'user-agent': 'Mozilla/5.0', 'content-type': 'application/x-www-form-urlencoded', 'origin': BASE, 'referer': `${BASE}/id`, 'cookie': cookies }, body });
  const html2 = await r2.text();
  const getHref = (re) => html2.match(re)?.[1];
  const hd = getHref(/<a[^>]+class="[^"]*without_watermark_hd[^"]*"[^>]+href="([^"]+)"/);
  const sd = getHref(/<a[^>]+class="[^"]*without_watermark[^"]*"[^>]+href="([^"]+)"/) || html2.match(/<a[^>]+href="([^"]+)"[^>]*>Without Watermark/)?.[1];
  const mp3 = html2.match(/<a[^>]+class="[^"]*music[^"]*"[^>]+href="([^"]+)"/)?.[1];
  if (!sd && !hd) throw new Error('ssstik sin link');
  return { title: html2.match(/<p class="maintext">([^<]+)<\/p>/)?.[1]||'TikTok', author: { nickname: html2.match(/<h2>([^<]+)<\/h2>/)?.[1]||'Desconocido' }, type: 'video', dl: hd||sd, audio: mp3, stats: {}, created_at: 'N/A' };
}

async function tiktokDownload(url, evogbUrl, evogbKey, deliriusUrl) {
  if (evogbUrl) { try { const ep = `${evogbUrl}/dl/tiktok?url=${encodeURIComponent(url)}${evogbKey?`&key=${evogbKey}`:''}`; const r = await fetch(ep); if(r.ok){ const j=await r.json(); const d=j?.data||j?.result||j; if(d?.play||d?.dl||d?.hd) return { title: d.title||d.desc, author: d.author||{ nickname: d.author_name }, duration: d.duration, stats: { likes: d.like||d.digg_count, comments: d.comment||d.comment_count, views: d.play_count||d.views, shares: d.share_count||d.share }, created_at: d.create_time?new Date(d.create_time*1000).toLocaleString():d.taken_at||'N/A', type: d.images?'image':'video', dl: d.images||d.play||d.hd||d.video||d.dl, audio: d.music?.url||d.music }; } } catch {} }
  if (deliriusUrl) { try { const r = await fetch(`${deliriusUrl}/download/tiktok?url=${encodeURIComponent(url)}`); if(r.ok){ const j=await r.json(); const d=j?.data||j; if(d) return { title: d.title, author: d.author, duration: d.duration, stats: { likes: d.like, comments: d.comment, views: d.views, shares: d.share }, created_at: d.created_at||'N/A', type: d.type||'video', dl: d.hd||d.wm||d.play, audio: d.music }; } } catch {} }
  try { const d = await scrapperZennz(url); if(d.dl?.length) return d; } catch(e){ console.log('zennz fail', e.message) }
  try { const d = await scrapperSSStik(url); if(d.dl) return d; } catch(e){ console.log('ssstik fail', e.message) }
  try { const r = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`); const j = await r.json(); if(j.code===0){ const d=j.data; return { title: d.title, author: d.author, duration: d.duration, stats: { likes: d.digg_count, comments: d.comment_count, views: d.play_count, shares: d.share_count }, created_at: d.create_time?new Date(d.create_time*1000).toLocaleString():'N/A', type: d.images?'image':'video', dl: d.images||d.play, audio: d.music }; } } catch {}
  return null;
}

async function tiktokSearch(query, evogbUrl, evogbKey, deliriusUrl) {
  if (evogbUrl) { try { const ep = `${evogbUrl}/search/tiktok?query=${encodeURIComponent(query)}${evogbKey?`&key=${evogbKey}`:''}`; const r = await fetch(ep); if(r.ok){ const j=await r.json(); const raw=j?.data||[]; if(Array.isArray(raw)&&raw.length) return raw.map(x=>({ title: x.title, hd: x.dl||x.play||x.video, duration: x.duration||x.taken_at, like: x.stats?.likes||0, coment: x.stats?.comments||0, play: x.stats?.views||0, share: x.stats?.shares||0, author: { nickname: x.author?.nickname||x.author?.fullname, username: x.author?.nickname }, music: { title: x.music?.title } })).filter(v=>v.hd); } } catch {} }
  const fallbacks = []; if(deliriusUrl) fallbacks.push(`${deliriusUrl}/search/tiktoksearch?query=${encodeURIComponent(query)}`); fallbacks.push(`https://api.delirius.store/search/tiktoksearch?query=${encodeURIComponent(query)}`);
  for (const ep of fallbacks) { try { const r = await fetch(ep); if(!r.ok) continue; const j = await r.json(); if(j.status===200 && Array.isArray(j.meta) && j.meta.length) return j.meta; if(Array.isArray(j.data) && j.data.length) return j.data.map(x=>({ ...x, hd: x.hd||x.dl||x.play })); } catch {} }
  return [];
}

export default {
  command: ['tiktok', 'tt', 'tiktoksearch', 'ttsearch', 'tts'],
  category: 'downloader',
  description: 'busca y descarga videos de tik tok',
  run: async (...params) => {
    let sock, msg, m, args, usedPrefix='.', command='tt';
    if (params[0]?.msg) { const ctx=params[0]; msg=ctx.msg; sock=ctx.sock; m=msg; args=ctx.args||[]; usedPrefix=ctx.usedPrefix||'.'; command=ctx.command||'tt'; }
    else { const [client, mm, a, up, cmd] = params; sock=client; msg=mm; m=mm; args=a||[]; usedPrefix=up||'.'; command=cmd||'tt'; }
    const reply = async (t) => { if (m?.reply) return m.reply(t); return sock.sendMessage(m.chat||msg.chat, { text: t }, { quoted: msg||m }); };
    if (!args.length) return reply(`《✧》 Por favor, ingresa un término de búsqueda o enlace de TikTok.`);
    const text = args.join(' ').trim();
    const isUrl = /(?:https:?\/{2})?(?:w{3}|vm|vt|t)?\.?tiktok.com\/([^\s&]+)/gi.test(text);
    const evogbUrl = global.APIs?.evogb?.url || global.links?.api;
    const evogbKey = global.APIs?.evogb?.key;
    const deliriusUrl = global.APIs?.delirius?.url;

    try {
      if (isUrl) {
        const data = await tiktokDownload(text, evogbUrl, evogbKey, deliriusUrl);
        if (!data) return reply('《✧》 No se encontró contenido válido en TikTok o el video es privado.');
        const caption = `ㅤ۟∩　ׅ　★ ໌ fatal　ׅ　🅣𝗂𝗄𝖳𝗈𝗄 🅓ownload　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ✎ ׄ ⬭ *Título:* ${data.title || 'Sin título'}\n𖣣ֶㅤ֯⌗ ꕥ ׄ ⬭ *Autor:* ${data.author?.nickname || data.author?.unique_id || data.author || 'Desconocido'}\n𖣣ֶㅤ֯⌗ ⴵ ׄ ⬭ *Duración:* ${data.duration || 'N/A'}\n𖣣ֶㅤ֯⌗ ❖ ׄ ⬭ *Likes:* ${(data.stats?.likes || data.stats?.like || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❀ ׄ ⬭ *Comentarios:* ${(data.stats?.comments || data.stats?.coment || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ✿ ׄ ⬭ *Vistas:* ${(data.stats?.views || data.stats?.play || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☆ ׄ ⬭ *Compartidos:* ${(data.stats?.shares || data.stats?.share || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☁︎ ׄ ⬭ *Fecha:* ${data.created_at || 'N/A'}`.trim();
        const temp=[]; try {
          if (data.type === 'image') {
            const dlArray = Array.isArray(data.dl)?data.dl:[data.dl]; const medias=[];
            for (let i=0;i<dlArray.length;i++){ const p=await downloadToFile(dlArray[i], `tt_img_${Date.now()}_${i}.jpg`); temp.push(p); medias.push({ type:'image', data:{ url:p }, caption: i===0?caption:'' }); }
            await sock.sendAlbumMessage(msg.chat||m.chat, medias, { quoted: msg||m });
            if (data.audio){ const ap=await downloadToFile(data.audio, `tt_audio_${Date.now()}.mp4`); temp.push(ap); await sock.sendMessage(msg.chat||m.chat, { audio:{ url:ap }, mimetype:'audio/mp4' }, { quoted: msg||m }); }
          } else {
            const vurl = Array.isArray(data.dl)?data.dl[0]:data.dl; const vp=await downloadToFile(vurl, `tt_video_${Date.now()}.mp4`); temp.push(vp);
            await sock.sendMessage(msg.chat||m.chat, { video:{ url:vp }, caption }, { quoted: msg||m });
          }
        } finally { for(let f of temp) try{ if(fs.existsSync(f)) fs.unlinkSync(f); }catch{} }
      } else {
        await reply('🕒 Buscando en TikTok...');
        const results = await tiktokSearch(text, evogbUrl, evogbKey, deliriusUrl) || [];
        if (!results.length) return reply(`《✧》 No se encontraron resultados para *${text}*.`);
        const validResults = results.filter(v => v && (v.hd || v.play || v.dl));
        if (!validResults.length) return reply(`《✧》 No se encontraron resultados para *${text}*.`);
        const temp=[]; try {
          const items = validResults.slice(0, 10);
          const medias=[];
          for (let i=0;i<items.length;i++){
            const v=items[i];
            const cap = `ㅤ۟∩　ׅ　★ ໌　ׅ　🅣𝗂𝗄𝖳𝗈𝗄 🅢earch　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ✎ ׄ ⬭ *Título:* ${v.title || 'Sin título'}\n𖣣ֶㅤ֯⌗ ꕥ ׄ ⬭ *Autor:* ${v.author?.nickname || 'Desconocido'} ${v.author?.username?`@${v.author.username}`:''}\n𖣣ֶㅤ֯⌗ ⴵ ׄ ⬭ *Duración:* ${v.duration || 'N/A'}\n𖣣ֶㅤ֯⌗ ❖ ׄ ⬭ *Likes:* ${(v.like||0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❀ ׄ ⬭ *Comentarios:* ${(v.coment||0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ✿ ׄ ⬭ *Vistas:* ${(v.play||0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☆ ׄ ⬭ *Compartidos:* ${(v.share||0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❒ ׄ ⬭ *Audio:* ${v.music?.title||'Sonido original'}`.trim();
            const urlDl = v.hd || v.play || v.dl;
            const vp = await downloadToFile(urlDl, `tt_search_${Date.now()}_${i}.mp4`); temp.push(vp);
            medias.push({ type:'video', data:{ url:vp }, caption: cap });
          }
          await sock.sendAlbumMessage(msg.chat||m.chat, medias, { quoted: msg||m });
        } finally { for(let f of temp) try{ if(fs.existsSync(f)) fs.unlinkSync(f); }catch{} }
      }
    } catch(e){ await reply(`> Error en *${usedPrefix + command}*: ${e.message}`); }
  }
}