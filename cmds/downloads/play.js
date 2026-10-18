import yts from 'yt-search'
import fetch from 'node-fetch'
import axios from 'axios'

const CNV = "https://cnv.cx/v2"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const cnvAxios = axios.create({ timeout: 60000, headers: { "User-Agent": UA, Referer: "https://frame.y2meta-uk.com/", Origin: "https://frame.y2meta-uk.com" } })

const cmd = {
  // Comandos unificados para audio y video
  command: ['play', 'mp3', 'ytmp3', 'ytaudio', 'playaudio', 'play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  category: 'downloads',
  description: 'Descargar audio o vídeo de YouTube.',

  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (!args[0]) {
        return msg.reply('《✧》Por favor, menciona el nombre o URL del video que deseas descargar')
      }

      // Determinar si están pidiendo video o audio según el comando
      const isVideo = ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'].includes(command.toLowerCase())
      
      const input_text = args.join(' ').trim()
      const video_id = getVideoId(input_text)
      const query = video_id ? `https://youtu.be/${video_id}` : input_text

      let url = query
      let title = isVideo ? 'video' : 'audio'
      let thumbnail = null
      let video_info = null

      // BÚSQUEDA Y EXTRACCIÓN DE METADATOS
      try {
        video_info = await getVideoInfo(query, video_id)

        if (video_info) {
          url = video_info.url || `https://youtu.be/${video_info.videoId}`
          title = video_info.title || title
          thumbnail = video_info.image || video_info.thumbnail || null

          const views = Number(video_info.views || 0).toLocaleString('es-HN')
          const channel = video_info.author?.name || video_info.author || 'Desconocido'

          const info_message = `➩ Descargando › *${title}*

> ❖ Canal › *${channel}*
> ⴵ Duración › *${video_info.timestamp || 'Desconocido'}*
> ❀ Vistas › *${views}*
> ✩ Publicado › *${video_info.ago || 'Desconocido'}*
> ❒ Enlace › *${url}*`

          if (thumbnail) {
            await sock.sendMessage(msg.chat, {
              image: { url: thumbnail },
              caption: info_message
            }, { quoted: msg })
          } else {
            await msg.reply(info_message)
          }
        }
      } catch {}

      if (!isYTUrl(url)) {
        return msg.reply('《✧》No se encontró un video válido de YouTube.')
      }

      const actual_video_id = video_info ? video_info.videoId : getVideoId(url)

      if (!isVideo) {
        // ==========================================
        // PROCESO PARA AUDIO (API DELIRIUS)
        // ==========================================
        const audio = await getAudioFromDelirius(url)

        if (!audio?.buffer?.length) {
          return msg.reply('《✧》No se pudo descargar el *audio*, intenta más tarde.')
        }

        await sock.sendMessage(msg.chat, {
          audio: audio.buffer,
          fileName: audio.name || `${sanitizeFileName(title)}.mp3`,
          mimetype: 'audio/mpeg'
        }, { quoted: msg })

      } else {
        // ==========================================
        // PROCESO PARA VIDEO (SCRAPER CNV)
        // ==========================================
        const videoData = await getVideoFromScraper(actual_video_id)

        if (!videoData?.buffer?.length) {
          return msg.reply('《✧》No se pudo descargar el *video*, intenta más tarde.')
        }

        const file_name = sanitizeFileName(title) + '.mp4'
        const size_bytes = videoData.buffer.length
        const size_text = formatBytes(size_bytes)
        const quality = videoData.quality || '360p'
        const max_video_size = 50 * 1024 * 1024 // 50 MB
        
        const send_as_document = size_bytes > max_video_size

        const caption = `乂 *Video descargado*

> ❒ Calidad › *${quality}*
> ❒ Tamaño › *${size_text}*`

        if (send_as_document) {
          await sock.sendMessage(msg.chat, {
            document: videoData.buffer,
            mimetype: 'video/mp4',
            fileName: file_name,
            caption
          }, { quoted: msg })
        } else {
          await sock.sendMessage(msg.chat, {
            video: videoData.buffer,
            mimetype: 'video/mp4',
            fileName: file_name,
            caption
          }, { quoted: msg })
        }
      }

    } catch (e) {
      await msg.reply(
        `> An unexpected error occurred while executing command *${usedPrefix + command}*.\n> [Error: *${e.message}*]`
      )
    }
  }
}

export default cmd

// ==========================================
// FUNCIONES AUXILIARES DE ENLACES Y METADATOS
// ==========================================

const isYTUrl = (url = '') =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

const getVideoId = (text = '') => {
  const raw = String(text || '').trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw

  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ]

  for (const pattern of patterns) {
    const match = raw.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

async function getVideoInfo(input, video_id) {
  if (video_id) {
    try {
      const info = await yts({ videoId: video_id })
      if (info?.videoId) {
        return {
          ...info,
          url: `https://youtu.be/${info.videoId}`,
          image: info.thumbnail || info.image
        }
      }
    } catch {}
  }

  const search = await yts(input)
  return search.videos?.[0] || search.all?.find(v => v.type === 'video') || null
}

function sanitizeFileName(name = 'archivo') {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'archivo'
}

function formatBytes(bytes = 0) {
  if (!bytes || Number.isNaN(bytes)) return 'Desconocido'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = Number(bytes)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}

// ==========================================
// FUNCIONES DE DESCARGA (DELIRIUS & SCRAPER CNV)
// ==========================================

async function getAudioFromDelirius(url) {
  const api_url = `https://api.delirius.online/download/ytmp3?url=${encodeURIComponent(url)}`
  
  const res = await fetch(api_url, { headers: { 'accept': 'application/json' } })
  if (!res.ok) throw new Error(`API falló: HTTP ${res.status}`)

  const json = await res.json()
  if (!json?.status || !json?.data?.download) {
    throw new Error('No se encontró el enlace de descarga en la API.')
  }

  const audio_res = await fetch(json.data.download)
  if (!audio_res.ok) throw new Error(`No se pudo descargar el audio: HTTP ${audio_res.status}`)

  const buffer = await audio_res.buffer()
  const safeName = json.data.title ? sanitizeFileName(json.data.title) : 'audio'

  return {
    buffer,
    name: `${safeName}.mp3`
  }
}

async function getVideoFromScraper(videoId) {
  const resKey = await cnvAxios.get(`${CNV}/sanity/key?id=${videoId}`)
  const key = resKey.data.key
  
  let dlUrl = null
  let qualityFound = '360p'

  // Prioriza calidades manejables para WhatsApp
  for (const q of [360, 720, 480]) {
    try {
      const res = await cnvAxios.post(`${CNV}/converter`, new URLSearchParams({
        link: `https://youtu.be/${videoId}`, format: "mp4", audioBitrate: "128", videoQuality: String(q), filenameStyle: "pretty", vCodec: "h264"
      }).toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "*/*", key } })
      
      if (res.data?.url) { 
        dlUrl = res.data.url
        qualityFound = `${q}p`
        break 
      }
    } catch {}
  }
  
  if (!dlUrl) throw new Error("No se pudo extraer el enlace de descarga del video.")
  
  // Usar Axios para obtener el Buffer real del video
  const vidRes = await axios.get(dlUrl, { 
    responseType: 'arraybuffer', 
    headers: { 'User-Agent': UA, 'Referer': 'https://www.youtube.com/' } 
  })

  return { buffer: Buffer.from(vidRes.data), quality: qualityFound }
}