import yts from 'yt-search'
import fetch from 'node-fetch'
import axios from 'axios'

const CNV = "https://cnv.cx/v2"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const cnvAxios = axios.create({ timeout: 60000, headers: { "User-Agent": UA, Referer: "https://frame.y2meta-uk.com/", Origin: "https://frame.y2meta-uk.com" } })

// Caché temporal para guardar los mensajes de .play y un listener global para respuestas sin prefijo
const playCache = new Map()
let listenerAttached = false

const cmd = {
  // Se agregaron 'a', 'v' y 'av' por si el usuario responde usando prefijo (.a, .v, .av)
  command: ['play', 'mp3', 'ytmp3', 'ytaudio', 'playaudio', 'play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo', 'a', 'v', 'av'],
  category: 'downloads',
  description: 'Descargar audio o vídeo de YouTube.',

  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      // =========================================================================
      // LISTENER AUTOMÁTICO PARA RESPUESTAS SIN PREFIJO ("a", "v", "av")
      // =========================================================================
      if (!listenerAttached && sock?.ev) {
        listenerAttached = true
        sock.ev.on('messages.upsert', async ({ messages }) => {
          const m = messages?.[0]
          if (!m?.message || m.key?.fromMe) return

          const text = (
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            m.message.imageMessage?.caption ||
            m.message.videoMessage?.caption ||
            ''
          ).trim().toLowerCase()

          if (!['a', 'v', 'av'].includes(text)) return

          const contextInfo = m.message.extendedTextMessage?.contextInfo
          const quotedId = contextInfo?.stanzaId
          const quotedMsg = contextInfo?.quotedMessage
          if (!quotedId && !quotedMsg) return

          const quotedCaption = quotedMsg?.imageMessage?.caption || quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || ''
          let data = playCache.get(quotedId)

          if (!data) {
            const matchUrl = quotedCaption.match(/Enlace\s*›\s*\*?(https?:\/\/[^\s*]+)\*?/i)
            const matchTitle = quotedCaption.match(/Descargando\s*›\s*\*([^\n*]+)\*/i)
            if (matchUrl?.[1]) {
              data = {
                url: matchUrl[1],
                videoId: getVideoId(matchUrl[1]),
                title: matchTitle?.[1] || 'archivo'
              }
            }
          }

          if (!data) return

          const chat = m.key.remoteJid
          await processMediaDownload(sock, chat, m, text, data.url, data.videoId, data.title)
        })
      }

      const cmdLower = command.toLowerCase()

      // =========================================================================
      // SI RESPONDEN CON PREFIJO (.a, .v, .av) O SI EL HANDLER PASA SIN PREFIJO
      // =========================================================================
      if (['a', 'v', 'av'].includes(cmdLower)) {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const quotedId = contextInfo?.stanzaId || msg.quoted?.id || msg.quoted?.key?.id
        const quotedMsg = contextInfo?.quotedMessage || msg.quoted?.message || msg.quoted

        let data = quotedId ? playCache.get(quotedId) : null

        if (!data && quotedMsg) {
          const quotedCaption =
            quotedMsg?.imageMessage?.caption ||
            quotedMsg?.conversation ||
            quotedMsg?.extendedTextMessage?.text ||
            msg.quoted?.text ||
            msg.quoted?.caption ||
            ''

          const matchUrl = quotedCaption.match(/Enlace\s*›\s*\*?(https?:\/\/[^\s*]+)\*?/i)
          const matchTitle = quotedCaption.match(/Descargando\s*›\s*\*([^\n*]+)\*/i)
          if (matchUrl?.[1]) {
            data = {
              url: matchUrl[1],
              videoId: getVideoId(matchUrl[1]),
              title: matchTitle?.[1] || 'archivo'
            }
          }
        }

        if (!data) {
          return msg.reply('《✧》Debes responder (etiquetar) al mensaje del comando *play* para descargar.')
        }

        return await processMediaDownload(sock, msg.chat, msg, cmdLower, data.url, data.videoId, data.title)
      }

      // =========================================================================
      // FLUJO DE BÚSQUEDA (.play, .ytmp3, .ytmp4, etc.)
      // =========================================================================
      if (!args[0]) {
        return msg.reply('《✧》Por favor, menciona el nombre o URL del video que deseas descargar')
      }

      const isDirectVideo = ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'].includes(cmdLower)
      const isDirectAudio = ['mp3', 'ytmp3', 'ytaudio', 'playaudio'].includes(cmdLower)
      const isInteractivePlay = cmdLower === 'play'

      const input_text = args.join(' ').trim()
      const video_id = getVideoId(input_text)
      const query = video_id ? `https://youtu.be/${video_id}` : input_text

      let url = query
      let title = isDirectVideo ? 'video' : 'audio'
      let thumbnail = null
      let video_info = null

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
> ❒ Enlace › *${url}*${isInteractivePlay ? `\n\n> 💡 *Responde a este mensaje con:*\n> • *a* › Para Audio\n> • *v* › Para Video\n> • *av* › Para Audio y Video` : ''}`

          let sentMsg
          if (thumbnail) {
            sentMsg = await sock.sendMessage(msg.chat, {
              image: { url: thumbnail },
              caption: info_message
            }, { quoted: msg })
          } else {
            sentMsg = await sock.sendMessage(msg.chat, {
              text: info_message
            }, { quoted: msg })
          }

          // Guardar en caché el ID del mensaje enviado para cuando lo etiqueten
          const actualId = video_info.videoId || getVideoId(url)
          if (sentMsg?.key?.id && actualId) {
            playCache.set(sentMsg.key.id, {
              url,
              videoId: actualId,
              title,
              timestamp: Date.now()
            })

            // Limpiar caché antiguo (15 minutos)
            setTimeout(() => playCache.delete(sentMsg.key.id), 15 * 60 * 1000)
          }
        }
      } catch {}

      if (!isYTUrl(url)) {
        return msg.reply('《✧》No se encontró un video válido de YouTube.')
      }

      // Si usó ".play", se detiene aquí esperando que el usuario etiquete el mensaje con a, v o av
      if (isInteractivePlay) return

      const actual_video_id = video_info ? video_info.videoId : getVideoId(url)

      if (isDirectAudio) {
        await processMediaDownload(sock, msg.chat, msg, 'a', url, actual_video_id, title)
      } else if (isDirectVideo) {
        await processMediaDownload(sock, msg.chat, msg, 'v', url, actual_video_id, title)
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
// FUNCIÓN PARA PROCESAR AUDIO, VIDEO O AMBOS
// ==========================================

async function processMediaDownload(sock, chat, quotedMsg, mode, url, videoId, title) {
  const sendAudioTask = async () => {
    try {
      const audio = await getAudioFromDelirius(url)
      if (!audio?.buffer?.length) {
        return sock.sendMessage(chat, { text: '《✧》No se pudo descargar el *audio*, intenta más tarde.' }, { quoted: quotedMsg })
      }
      await sock.sendMessage(chat, {
        audio: audio.buffer,
        fileName: audio.name || `${sanitizeFileName(title)}.mp3`,
        mimetype: 'audio/mpeg'
      }, { quoted: quotedMsg })
    } catch (err) {
      await sock.sendMessage(chat, { text: `《✧》Error al descargar el *audio*: ${err.message}` }, { quoted: quotedMsg })
    }
  }

  const sendVideoTask = async () => {
    try {
      const videoData = await getVideoFromScraper(videoId)
      if (!videoData?.buffer?.length) {
        return sock.sendMessage(chat, { text: '《✧》No se pudo descargar el *video*, intenta más tarde.' }, { quoted: quotedMsg })
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
        await sock.sendMessage(chat, {
          document: videoData.buffer,
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: quotedMsg })
      } else {
        await sock.sendMessage(chat, {
          video: videoData.buffer,
          mimetype: 'video/mp4',
          fileName: file_name,
          caption
        }, { quoted: quotedMsg })
      }
    } catch (err) {
      await sock.sendMessage(chat, { text: `《✧》Error al descargar el *video*: ${err.message}` }, { quoted: quotedMsg })
    }
  }

  if (mode === 'a') {
    await sendAudioTask()
  } else if (mode === 'v') {
    await sendVideoTask()
  } else if (mode === 'av') {
    // Descarga y envía el audio y el video simultáneamente
    await Promise.all([sendAudioTask(), sendVideoTask()])
  }
}

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
    size /= 102