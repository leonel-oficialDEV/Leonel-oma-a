import yts from 'yt-search'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const execAsync = promisify(exec)

const tmpDir = './tmp'
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

const cmd = {
  command: ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  category: 'downloads',
  description: 'Descargar un vídeo de YouTube.',

  run: async ({ msg, sock, args, usedPrefix, command, isOwner }) => {
    let tempInput = null
    let tempOutput = null
    let tempOutput2 = null
    try {
      if (!args[0]) return msg.reply('《✧》Por favor, menciona el nombre o URL del video')

      let rawInput = args.join(' ').replace(/\s+/g, ' ').trim()
      let qualityWanted = '360p'

      const qualityMatch = rawInput.match(/\b(\d{3,4}p)\s*$/i)
      if (qualityMatch) {
        qualityWanted = qualityMatch[1].toLowerCase()
        rawInput = rawInput.slice(0, qualityMatch.index).trim()
      }

      if (!rawInput) return msg.reply('《✧》Por favor, menciona el nombre o URL del video')

      if (!['144p','240p','360p','480p','720p','1080p'].includes(qualityWanted)) qualityWanted = '360p'

      const url = await getYoutubeUrl(rawInput)
      const data = await getFareVideo(url, qualityWanted)
      if (!data?.descarga?.url) return msg.reply('《✧》No se pudo descargar el *video*')

      const isUserOwner = isOwner || msg?.isOwner || false
      const durationSeconds = parseDurationToSeconds(data.duracion)

      if (!isUserOwner && durationSeconds > 1800) {
        return msg.reply('《✧》 El video supera el límite permitido de *30 minutos*. Este límite solo puede ser omitido por el *Owner* del bot.')
      }

      const title = data.titulo || 'video'
      const channel = data.canal?.nombre || 'Desconocido'
      const duration = data.duracion || 'Desconocido'
      const views = Number(data.vistas || 0).toLocaleString('es-HN')
      const download = data.descarga
      const quality = download.calidad || qualityWanted
      const file_name = sanitizeFileName(title) + '.mp4'

      const videoId = getVideoId(url)
      const ytThumb = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null
      const thumbnail = data.miniatura || ytThumb || null

      const info_message = `➩ Descargando › *${title}*\n\n> ❖ Canal › *${channel}*\n> ⴵ Duración › *${duration}*\n> ❀ Vistas › *${views}*\n> ❒ Calidad › *${quality}*\n> ❒ Enlace › *${url}*`

      try {
        if (thumbnail) {
          await sock.sendMessage(msg.chat, { image: { url: thumbnail }, caption: info_message }, { quoted: msg })
        } else await msg.reply(info_message)
      } catch { await msg.reply(info_message) }

      await sock.sendMessage(msg.chat, { react: { text: '🔄', key: msg.key } })

      tempInput = path.join(tmpDir, `yt_${Date.now()}_in.mp4`)
      tempOutput = path.join(tmpDir, `yt_${Date.now()}_out.mp4`)
      tempOutput2 = path.join(tmpDir, `yt_${Date.now()}_out2.mp4`)

      await downloadFile(download.url, tempInput)

      const targetHeight = parseInt(qualityWanted) || 360
      const crfValue = targetHeight >= 720 ? 24 : targetHeight >= 480 ? 26 : 28

      try {
        await execAsync(`ffmpeg -y -i "${tempInput}" -vf "scale=-2:'min(${targetHeight},ih)'" -c:v libx264 -preset veryfast -crf ${crfValue} -c:a aac -b:a ${targetHeight >= 720 ? 128 : 96}k -movflags +faststart "${tempOutput}"`)
      } catch {
        fs.copyFileSync(tempInput, tempOutput)
      }

      let finalPath = tempOutput
      let finalSize = fs.statSync(finalPath).size

      if (finalSize > max_video_size) {
        try {
          const fallbackH = Math.min(480, targetHeight)
          await execAsync(`ffmpeg -y -i "${tempOutput}" -vf "scale=-2:'min(${fallbackH},ih)'" -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 96k -movflags +faststart "${tempOutput2}"`)
          if (fs.existsSync(tempOutput2)) {
            finalPath = tempOutput2
            finalSize = fs.statSync(finalPath).size
          }
        } catch {}
      }

      const finalSizeText = formatBytes(finalSize)
      const caption = `乂 *Video descargado*\n\n> ❒ Calidad › *${quality}*\n> ❒ Tamaño › *${finalSizeText}*`

      if (finalSize > max_video_size) {
        await sock.sendMessage(msg.chat, {
          document: { url: finalPath },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: msg })
      } else {
        await sock.sendMessage(msg.chat, {
          video: { url: finalPath },
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: msg })
      }

      await sock.sendMessage(msg.chat, { react: { text: '✅', key: msg.key } })

    } catch (e) {
      await msg.reply(`> Error en *${usedPrefix + command}*.\n> [${e.message}]`)
    } finally {
      try { if (tempInput && fs.existsSync(tempInput)) fs.unlinkSync(tempInput) } catch {}
      try { if (tempOutput && fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput) } catch {}
      try { if (tempOutput2 && fs.existsSync(tempOutput2)) fs.unlinkSync(tempOutput2) } catch {}
    }
  }
}

export default cmd

const max_video_size = 40 * 1024 * 1024

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Download failed ${res.status}`)
  const fileStream = fs.createWriteStream(dest)
  if (typeof res.body.pipe === 'function') {
    await pipeline(res.body, fileStream)
  } else {
    await pipeline(Readable.fromWeb(res.body), fileStream)
  }
}

async function getYoutubeUrl(input) {
  const id = getVideoId(input)
  if (id) return `https://youtu.be/${id}`
  if (isYTUrl(input)) return input
  try {
    const evoUrl = global.APIs?.evogb?.url || global.links?.api || 'https://api.evogb.org'
    const evoKey = global.APIs?.evogb?.key || 'Mai301520-art'
    const endpoint = `${evoUrl}/search/yt?query=${encodeURIComponent(input)}&key=${encodeURIComponent(evoKey)}`
    const res = await fetch(endpoint).then(r => r.json())
    if (res?.status && Array.isArray(res.result) && res.result.length) return res.result[0].url
  } catch {}
  const search = await yts(input)
  const video = search.videos?.[0] || search.all?.find(v => v.type === 'video')
  if (!video?.url) throw new Error('No se encontró video')
  return video.url
}

async function getFareVideo(url, quality = '360p') {
  const evogbUrl = global.APIs?.evogb?.url || global.links?.api || 'https://api.evogb.org'
  const evogbKey = global.APIs?.evogb?.key || 'Mai301520-art'
  const deliriusUrl = global.APIs?.delirius?.url || 'https://delirius-apiofc.vercel.app'

  const endpoints = [
    `${evogbUrl}/dl/ytv?url=${encodeURIComponent(url)}&quality=${quality}&key=${evogbKey}`,
    `${evogbUrl}/dl/ytmp4?url=${encodeURIComponent(url)}&quality=${quality}&key=${evogbKey}`,
    `${evogbUrl}/download/ytmp4?url=${encodeURIComponent(url)}&quality=${quality}&key=${evogbKey}`,
    `${evogbUrl}/dl/ytv?url=${encodeURIComponent(url)}&quality=360&key=${evogbKey}`,
    `${deliriusUrl}/download/ytmp4?url=${encodeURIComponent(url)}`,
    `https://delirius-apiofc.vercel.app/download/ytmp4?url=${encodeURIComponent(url)}`,
    `https://api.delirius.online/download/ytmp4?url=${encodeURIComponent(url)}`
  ]

  let lastError = null
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { 
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }
      })
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue }

      const text = await res.text()
      let json; try { json = JSON.parse(text) } catch { lastError = 'JSON inválido'; continue }

      const d = json?.data || json?.result || json
      const videoUrl = d?.dl || d?.download || d?.url || d?.hd || d?.video
      if (!videoUrl) { lastError = json.message || 'Sin URL'; continue }

      return {
        titulo: d.title || d.titulo || 'video',
        canal: { nombre: d.author?.name || d.channel || d.author || 'Desconocido' },
        duracion: d.duration || d.duracion || 'Desconocido',
        vistas: d.views || d.vistas || 0,
        miniatura: d.thumbnail || d.miniatura || null,
        descarga: { url: videoUrl, calidad: d.quality || d.calidad || quality, tamaño: d.size || d.tamaño || null }
      }
    } catch (e) { 
      lastError = e.message 
    }
  }

  throw new Error('No se pudo obtener el enlace de descarga de ningún servidor disponible.')
}

const isYTUrl = url => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

function getVideoId(text = '') {
  const raw = String(text || '').trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw
  return raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|[?&]v=)([a-zA-Z0-9_-]{11})/)?.[1] || null
}

function sanitizeFileName(name = 'video') {
  return String(name).replace(/\.(mp4|mkv|webm|mov|avi)$/i, '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video'
}

function formatBytes(bytes = 0) {
  if (!bytes) return 'Desconocido'
  const units = ['B','KB','MB','GB']; let i = 0; let s = Number(bytes)
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++ }
  return `${s.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

function parseDurationToSeconds(duration) {
  if (typeof duration === 'number') return duration
  if (!duration || typeof duration !== 'string') return 0

  const clean = duration.trim()
  if (!isNaN(clean)) return parseInt(clean, 10)

  const parts = clean.split(':').map(p => parseInt(p, 10))
  if (parts.some(isNaN)) return 0

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return 0
}
