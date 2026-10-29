[27/10 11:50 p. m.] Leo: import fetch from 'node-fetch';
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

const agent = new https.Agent({ keepAlive: true });

function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, agent, maxHeaderSize: 1048576 };
    const req = https.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(request(res.headers.location, headers));
      const chunks = [];
      const enc = res.headers['content-encoding'];
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res;
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function extractItemStruct(html) {
  let m = html.match(/<script id="api-data"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { const j = JSON.parse(m[1]); return j?.videoDetail?.itemInfo?.itemStruct || j?.itemInfo?.itemStruct || Object.values(j?.ItemModule||{})[0]; } catch {} }
  m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { const j = JSON.parse(m[1]); const def = j?.__DEFAULT_SCOPE__; for (let k in def) if (def[k]?.itemInfo?.itemStruct) return def[k].itemInfo.itemStruct; } catch {} }
  return null;
}

async function tiktok_ZENNZ(url) {
  const html = await request(url, { 'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36', 'accept-encoding': 'gzip, deflate, br' });
  const d = extractItemStruct(html);
  if (!d) throw new Error('No struct');
  const isImage = !!d.imagePost;
  let dl = isImage ? (d.imagePost.images||[]).flatMap(i=>i?.imageURL?.urlList||[]) : [d.video?.downloadAddr, d.video?.playAddr].filter(Boolean);
  if (!isImage && d.id) {
    try {
      const pHtml = await request(`https://www.tiktok.com/player/api/v1/items?item_ids=${d.id}`);
      const pj = JSON.parse(pHtml);
      const u = pj.items?.[0]?.video_info?.url_list?.[0];
      if (u) dl.unshift(u);
    } catch {}
  }
  return { title: d.desc||'', author: { nickname: d.author?.nickname, unique_id: d.author?.uniqueId }, duration: `${d.video?.duration||0} second`, stats: { likes: d.stats?.diggCount, comments: d.stats?.commentCount, views: d.stats?.playCount, shares: d.stats?.shareCount }, type: isImage?'image':'video', dl, audio: d.music?.playUrl };
}

async function tiktok_SSSTIK(tiktokUrl) {
  const BASE = "https://ssstik.io";
  const r1 = await fetch(`${BASE}/id`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const html1 = await r1.text();
  const tt = html1.match(/tt\s*=\s*["']([^"']+)["']/)?.[1] || html1.match(/name="tt"[^>]*value="([^"]+)"/)?.[1];
  if (!tt) throw new Error('No tt');
  const cookies = r1.headers.get('set-cookie') || '';
  const body = new URLSearchParams({ id: tiktokUrl, locale: "id", tt }).toString();
  const r2 = await fetch(`${BASE}/abc?url=dl`, { method: 'POST', headers: { 'user-agent': 'Mozilla/5.0', 'content-type': 'application/x-www-form-urlencoded', origin: BASE, referer: `${BASE}/id`, cookie: cookies }, body });
  const html2 = await r2.text();
  const hd = html2.match(/href="([^"]+)"[^>]*>Without Watermark HD/)?.[1] || html2.match(/class="[^"]*without_watermark_hd[^"]*"[^>]*href="([^"]+)"/)?.[1];
  const sd = html2.match(/href="([^"]+)"[^>]*>Without Watermark<\/a>/)?.[1] || html2.match(/class="[^"]*without_watermark[^"]*"[^>]*href="([^"]+)"/)?.[1];
  const mp3 = html2.match(/href="([^"]+)"[^>]*>Download MP3/)?.[1];
  const title = html2.match(/<p class="maintext">([^<]+)<\/p>/)?.[1] || 'TikTok';
  const author = html2.match(/<h2>([^<]+)<\/h2>/)?.[1] || 'Desconocido';
  const link = hd || sd;
  if (!link) throw new Error('No link ssstik');
  return { title, author: { nickname: author }, type: 'video', dl: link, audio: mp3, stats: {} };
}

async function tiktokDownload(url) {
  try { const z = await tiktok_ZENNZ(url); if (z.dl?.length) return z; } catch {}
  try { const s = await tiktok_SSSTIK(url); if (s.dl) return s; } catch {}
  try {
    const r = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    if (j.code === 0) { const d = j.data; return { title: d.title, author: d.author, duration: d.duration, stats: { likes: d.digg_count, comments: d.comment_count, views: d.play_count, shares: d.share_count }, type: d.images ? 'image' : 'video', dl: d.images || d.play, audio: d.music }; }
  } catch {}
  return null;
}

async function tiktokSearch(query, deliriusUrl) {
  const list = [];
  if (deliriusUrl) list.push(`${deliriusUrl}/search/tiktoksearch?query=${encodeURIComponent(query)}`);
  list.push(`https://api.delirius.store/search/tiktoksearch?query=${encodeURIComponent(query)}`);
  for (const ep of list) {
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
        const caption = `ㅤ۟∩　ׅ　★ ໌ fatal　ׅ　🅣𝗂𝗄𝖳𝗈𝗄 🅓ownload　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ✎ ׄ ⬭ *Título:* ${data.title || 'Sin título'}\n𖣣ֶㅤ֯⌗ ꕥ ׄ ⬭ *Autor:* ${data.author?.nickname || data.author?.unique_id || 'Desconocido'}\n𖣣ֶㅤ֯⌗ ⴵ ׄ ⬭ *Duración:* ${data.duration || 'N/A'}\n𖣣ֶㅤ֯⌗ ❖ ׄ ⬭ *Likes:* ${(data.stats?.likes || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❀ ׄ ⬭ *Comentarios:* ${(data.stats?.comments || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ✿ ׄ ⬭ *Vistas:* ${(data.stats?.views || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☆ ׄ ⬭ *Compartidos:* ${(data.stats?.shares || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☁︎ ׄ ⬭ *Fecha:* ${data.created_at || 'N/A'}`.trim();
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
[29/10 12:09 a. m.] Leo: import yts from 'yt-search'
import { getBuffer } from '#serialize'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DOWNLOAD_DIR = '/home/container/tmp'
const TMP_DIR = '/home/container/tmp'
const YTDLP_PATH = '/home/container/yt-dlp'
const COOKIES_PATH = '/home/container/cookies.txt'
const MAX_INTENTOS_DESCARGA = 3

let ytDlp

process.env.TMPDIR = TMP_DIR
process.env.TMP = TMP_DIR
process.env.TEMP = TMP_DIR

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function cargarYtDlp() {
  if (ytDlp) return ytDlp

  const modulo = await import('yt-dlp-wrap-plus')
  const YTDlpWrap = modulo.default?.default || modulo.default || modulo.YTDlpWrap

  if (!YTDlpWrap) {
    throw new Error('No se pudo cargar yt-dlp-wrap-plus.')
  }

  if (!fs.existsSync(YTDLP_PATH)) {
    throw new Error(`No se encontró el ejecutable: ${YTDLP_PATH}`)
  }

  try {
    fs.chmodSync(YTDLP_PATH, 0o755)
  } catch {}

  const instancia = new YTDlpWrap(YTDLP_PATH)
  await instancia.execPromise(['--version'])

  ytDlp = instancia
  return ytDlp
}

function eliminarArchivosDescarga(id) {
  try {
    for (const nombre of fs.readdirSync(DOWNLOAD_DIR)) {
      if (!nombre.startsWith(`${id}.`)) continue

      const archivo = path.join(DOWNLOAD_DIR, nombre)

      try {
        const stat = fs.lstatSync(archivo)
        if (stat.isSymbolicLink() || stat.isFile()) {
          fs.unlinkSync(archivo)
        } else if (stat.isDirectory()) {
          fs.rmSync(archivo, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
        }
      } catch {}
    }
  } catch {}
}

function obtenerChatId(msg) {
  return msg?.key?.remoteJid || msg?.chat || ''
}

function formatearDuracion(segundos = 0) {
  segundos = Number(segundos) || 0
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const segundosRestantes = Math.floor(segundos % 60)
  return horas
    ? `${horas}:${String(minutos).padStart(2, '0')}:${String(segundosRestantes).padStart(2, '0')}`
    : `${minutos}:${String(segundosRestantes).padStart(2, '0')}`
}

function limpiarTexto(texto = '') {
  return String(texto)
    .replace(/[\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
}

async function buscarVideo(texto) {
  // Mejora: Detectar enlaces directos (youtu.be o youtube.com) con o sin parámetros raros (?si=...)
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = texto.match(ytRegex);

  if (match && match[1]) {
    try {
      const videoId = match[1];
      const video = await yts({ videoId });
      if (video) return video;
    } catch (e) {
      // Fallback silencioso si falla la búsqueda por ID
    }
  }

  // Búsqueda normal por texto
  const resultado = await yts(texto)
  if (!resultado.videos?.length) {
    throw new Error('No se encontraron resultados.')
  }
  return resultado.videos[0]
}

function buscarArchivoDescargado(id, tipo) {
  const extensionesPermitidas = tipo === 'audio'
    ? ['.m4a', '.mp3', '.opus', '.webm', '.aac', '.wav']
    : ['.mp4', '.mkv', '.webm', '.mov']

  const archivos = fs.readdirSync(DOWNLOAD_DIR)

  const candidatos = archivos
    .filter(nombre => {
      if (!nombre.startsWith(`${id}.`)) return false
      const extension = path.extname(nombre).toLowerCase()
      if (!extensionesPermitidas.includes(extension)) return false
      if (/\.(part|ytdl|temp)$/i.test(nombre)) return false
      return true
    })
    .map(nombre => {
      const archivo = path.join(DOWNLOAD_DIR, nombre)
      try {
        const stat = fs.statSync(archivo)
        return stat.isFile() && stat.size > 0 ? { archivo, nombre, tamano: stat.size } : null
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.tamano - a.tamano)

  return candidatos[0] || null
}

async function descargarArchivo(url, tipo) {
  const downloader = await cargarYtDlp()
  let ultimoError

  for (let intento = 1; intento <= MAX_INTENTOS_DESCARGA; intento++) {
    const id = `yt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`

    try {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
      eliminarArchivosDescarga(id)

      const plantilla = path.join(DOWNLOAD_DIR, `${id}.%(ext)s`)

      const argumentos = [
        '--ignore-config',
        '--no-playlist',
        '--no-warnings',
        '--no-cache-dir',
        '--no-part',
        '--no-mtime',
        '--retries', '5',
        '--fragment-retries', '5',
        '--extractor-retries', '3',
        '--file-access-retries', '3',
        '--socket-timeout', '30',
        '--js-runtimes', 'node',
        '--remote-components', 'ejs:github',
        '--output', plantilla
      ]

      if (fs.existsSync(COOKIES_PATH)) {
        argumentos.push('--cookies', COOKIES_PATH)
      }

      if (tipo === 'audio') {
        argumentos.push(
          '-f', 'bestaudio[ext=m4a]/bestaudio',
          '--extract-audio',
          '--audio-format', 'm4a',
          '--audio-quality', '0'
        )
      } else {
        argumentos.push(
          '-f', 'best[ext=mp4][height<=720]/best[height<=720]/best',
          '--merge-output-format', 'mp4'
        )
      }

      argumentos.push(url)

      await downloader.execPromise(argumentos)

      const resultado = buscarArchivoDescargado(id, tipo)

      if (!resultado) {
        throw new Error(`yt-dlp terminó, pero no se encontró el archivo descargado en ${DOWNLOAD_DIR}.`)
      }

      return { ...resultado, id }
    } catch (error) {
      ultimoError = error
      eliminarArchivosDescarga(id)
      if (intento < MAX_INTENTOS_DESCARGA) {
        await esperar(intento * 1500)
      }
    }
  }

  throw new Error(`No se pudo descargar después de ${MAX_INTENTOS_DESCARGA} intentos: ${String(ultimoError?.message || ultimoError).slice(0, 600)}`)
}

export default {
  command: ['play', 'mp3', 'playaudio', 'ytaudio', 'play2', 'playvid', 'mp4', 'ytmp4', 'ytvideo'],
  category: 'downloader',

  run: async ({ sock, msg, args, text, command }) => {
    const chatId = obtenerChatId(msg)
    const opciones = chatId.endsWith('@newsletter') ? undefined : { quoted: msg }
    const consulta = (text || args?.join(' ') || '').trim()

    try {
      if (!consulta) {
        return sock.sendMessage(chatId, {
          text: '《✧》 Escribe el nombre o la URL del video de YouTube.'
        }, opciones)
      }

      // Definir si es video o audio según el comando ingresado
      const cmdName = command.toLowerCase();
      const isVideo = ['play2', 'playvid', 'mp4', 'ytmp4', 'ytvideo'].includes(cmdName);
      const tipoDescarga = isVideo ? 'video' : 'audio';

      await sock.sendMessage(chatId, { react: { text: '🕒', key: msg.key } })

      const video = await buscarVideo(consulta)
      const titulo = video.title || consulta
      const url = video.url
      const miniatura = video.thumbnail
      const duracion = Number(video.seconds) || 0

      let informacion = `➩ Descargando › ${titulo}\n\n`
      informacion += `> ❖ Canal › *${video.author?.name || 'Desconocido'}*\n`
      informacion += `> ⴵ Duración › *${video.timestamp || formatearDuracion(duracion)}*\n`
      informacion += `> ❀ Vistas › *${Number(video.views || 0).toLocaleString()}*\n`
      informacion += `> ✩ Formato › *${isVideo ? 'Video (MP4)' : 'Audio (M4A)'}*\n`
      informacion += `> ❒ YouTube › *${url}*\n\n`
      informacion += `⏳ _Descargando archivo, por favor espera..._`

      let enviado
      if (miniatura) {
        try {
          enviado = await sock.sendMessage(chatId, { image: await getBuffer(miniatura), caption: informacion }, opciones)
        } catch {
          enviado = await sock.sendMessage(chatId, { text: informacion }, opciones)
        }
      } else {
        enviado = await sock.sendMessage(chatId, { text: informacion }, opciones)
      }

      if (!enviado?.key?.id) {
        throw new Error('No se pudo registrar el mensaje.')
      }

      // Descarga Directa
      const descarga = await descargarArchivo(url, tipoDescarga)

      if (!fs.existsSync(descarga.archivo)) {
        throw new Error('El archivo descargado ya no existe.')
      }

      const nombre = limpiarTexto(titulo) || tipoDescarga
      const extension = path.extname(descarga.nombre) || (tipoDescarga === 'audio' ? '.m4a' : '.mp4')
      const comoDocumento = duracion > 1200 // Envía como documento si pasa de 20 minutos

      // Envío del archivo
      if (tipoDescarga === 'audio') {
        if (comoDocumento) {
          await sock.sendMessage(chatId, {
            document: { url: descarga.archivo },
            mimetype: 'audio/mp4',
            fileName: `${nombre}${extension}`,
            caption: `➩ ${titulo}`
          }, opciones)
        } else {
          await sock.sendMessage(chatId, {
            audio: { url: descarga.archivo },
            mimetype: 'audio/mp4',
            fileName: `${nombre}${extension}`,
            ptt: false
          }, opciones)
        }
      } else {
        if (comoDocumento) {
          await sock.sendMessage(chatId, {
            document: { url: descarga.archivo },
            mimetype: 'video/mp4',
            fileName: `${nombre}${extension}`,
            caption: `➩ ${titulo}`
          }, opciones)
        } else {
          await sock.sendMessage(chatId, {
            video: { url: descarga.archivo },
            mimetype: 'video/mp4',
            fileName: `${nombre}${extension}`,
            caption: `➩ ${titulo}`
          }, opciones)
        }
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } })

      // Limpieza del archivo descargado
      if (descarga?.id) {
        eliminarArchivosDescarga(descarga.id)
      }

    } catch (error) {
      await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }).catch(() => {})
      await sock.sendMessage(chatId, {
        text: `《✧》 Error: ${String(error?.message || error).slice(0, 800)}`
      }, opciones).catch(() => {})
    }
  }
}