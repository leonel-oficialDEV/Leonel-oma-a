import fetch from 'node-fetch'
import yts from 'yt-search'
import { getBuffer } from '#serialize'

async function getSpotifyLink(text) {
  try {
    const evoUrl = global.APIs?.evogb?.url
    const evoKey = global.APIs?.evogb?.key
    const endpoint = `${evoUrl}/search/spotify?query=${encodeURIComponent(text)}&key=${encodeURIComponent(evoKey)}`
    const res = await fetch(endpoint).then(r => r.json())
    if (res?.status && res.result?.[0]) return res.result[0]
  } catch {}
  return null
}

async function getYtLink(text) {
  try {
    const res = await yts(text)
    return res?.videos?.[0] || null
  } catch { return null }
}

async function getAudioMedia(type, url) {
  try {
    const evoUrl = global.APIs?.evogb?.url
    const evoKey = global.APIs?.evogb?.key
    const endpoint = type === 'spotify'
   ? `${evoUrl}/dl/spotify?url=${encodeURIComponent(url)}&key=${encodeURIComponent(evoKey)}`
      : `${evoUrl}/dl/ytmp3?url=${encodeURIComponent(url)}&key=${encodeURIComponent(evoKey)}`
    const res = await fetch(endpoint).then(r => r.json())
    const d = res?.data || res?.result || res
    return d?.url || d?.dl || d?.download || null
  } catch { return null }
}

const isYtUrl = (t) => /(youtube\.com|youtu\.be)/i.test(t)
const isSpotifyUrl = (t) => /open\.spotify\.com/i.test(t)

export default {
  command: ['play','mp3','playaudio','ytaudio', 'spotif'],
  category: 'downloader',
  run: async ({ sock, msg, args, text, usedPrefix, command }) => {
    try {
      const isChannel = msg.chat.endsWith('@newsletter')
      const options = isChannel? undefined : { quoted: msg }
      const chatId = msg.chat
      const q = text?.trim()

      if (!q) {
        return sock.sendMessage(msg.chat, { text: '《✧》 Por favor, menciona el nombre o URL de YouTube o Spotify que deseas descargar.' }, options)
      }

      await sock.sendMessage(chatId, { react: { text: '🕒', key: msg.key } })

      // --- URL DIRECTA: DESCARGA SIN PREGUNTAR ---
      if (isYtUrl(q) || isSpotifyUrl(q)) {
        const type = isSpotifyUrl(q) ? 'spotify' : 'yt'
        const dlUrl = await getAudioMedia(type, q)

        if (!dlUrl) {
          await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } })
          return sock.sendMessage(chatId, { text: '《✧》 No se pudo obtener el audio de la URL.' }, options)
        }

        await sock.sendMessage(chatId, {
          audio: { url: dlUrl },
          fileName: `${type}_${Date.now()}.mp3`,
          mimetype: 'audio/mpeg'
        }, options)

        return sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } })
      }

      // --- BÚSQUEDA: PREGUNTA YT / SPOTIFY ---
      const [ytInfo, spInfo] = await Promise.all([
        getYtLink(q),
        getSpotifyLink(q)
      ])

      if (!ytInfo &&!spInfo) {
        return sock.sendMessage(chatId, { text: '《✧》 No se encontraron resultados' }, options)
      }

      const title = ytInfo?.title || spInfo?.title || q
      const thumb = ytInfo?.thumbnail || spInfo?.image || null
      const ytUrl = ytInfo?.url || null
      const spotifyUrl = spInfo?.link || null
      const author = ytInfo?.author?.name || spInfo?.artist || 'Desconocido'
      const duration = ytInfo?.timestamp || 'Desconocido'
      const vistas = ytInfo? (ytInfo.views || 0).toLocaleString() : null

      let infoMessage = `➩ Descargando › ${title}\n\n`
      infoMessage += `> ❖ Canal › *${author}*\n`
      infoMessage += `> ⴵ Duración › *${duration}*\n`
      if (vistas) infoMessage += `> ❀ Vistas › *${vistas}*\n`
      if (ytUrl) infoMessage += `> ❒ YouTube › *${ytUrl}*\n`
      if (spotifyUrl) infoMessage += `> ❒ Spotify › *${spotifyUrl}*\n`
      infoMessage += `\n*Responde a este mensaje con:*\n> *spotify* para Spotify\n> *yt* para YouTube`

      let sent
      if (thumb) {
        try {
          const thumbBuffer = await getBuffer(thumb)
          sent = await sock.sendMessage(chatId, { image: thumbBuffer, caption: infoMessage }, options)
        } catch {
          sent = await sock.sendMessage(chatId, { text: infoMessage }, options)
        }
      } else {
        sent = await sock.sendMessage(chatId, { text: infoMessage }, options)
      }

      const sentId = sent.key.id
      const requesterId = msg.key.participant || msg.key.remoteJid
      let uses = 0
      const maxUses = 2

      const collector = async (upsert) => {
        try {
          const m = upsert.messages?.[0]
          if (!m || m.key.fromMe) return
          if (m.key.remoteJid!== chatId) return

          const senderId = m.key.participant || m.key.remoteJid
          const isOwner = senderId === requesterId || m.key.remoteJid === requesterId || (msg.sender && senderId.includes(msg.sender.split('@')[0]))
          if (!isOwner && chatId.endsWith('@g.us')) return

          const mText = (m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.extendedTextMessage?.caption || '').toLowerCase().trim()
          if (!['spotify', 'yt', 'youtube'].includes(mText)) return

          const ctx = m.message?.extendedTextMessage?.contextInfo
          if (ctx?.stanzaId !== sentId) return
          if (uses >= maxUses) {
            sock.ev.off('messages.upsert', collector)
            return
          }

          uses++
          const type = mText === 'spotify'? 'spotify' : 'yt'
          const urlToDl = type === 'spotify'? spotifyUrl : ytUrl

          if (!urlToDl) {
            await sock.sendMessage(chatId, { text: `《✧》 No hay link de ${type}` }, { quoted: m })
            if (uses >= maxUses) sock.ev.off('messages.upsert', collector)
            return
          }

          await sock.sendMessage(chatId, { react: { text: '🕒', key: m.key } })
          const dlUrl = await getAudioMedia(type, urlToDl)

          if (!dlUrl) {
            await sock.sendMessage(chatId, { text: '《✧》 No se pudo obtener el audio, intenta con la otra opción' }, { quoted: m })
            if (uses >= maxUses) sock.ev.off('messages.upsert', collector)
            return
          }

          await sock.sendMessage(chatId, {
            audio: { url: dlUrl },
            fileName: `${title}.mp3`,
            mimetype: 'audio/mpeg'
          }, { quoted: m })

          await sock.sendMessage(chatId, { react: { text: '✅', key: m.key } })
          if (uses >= maxUses) sock.ev.off('messages.upsert', collector)

        } catch (e) {
          console.log('[play collector]', e)
        }
      }

      sock.ev.on('messages.upsert', collector)
      setTimeout(() => { try { sock.ev.off('messages.upsert', collector) } catch {} }, 900000)

      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } })

    } catch (e) {
      await sock.sendMessage(msg.chat, { text: `> Error: ${e.message}` }, { quoted: msg })
    }
  }
}