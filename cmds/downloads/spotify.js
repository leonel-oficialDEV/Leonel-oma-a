import fetch from 'node-fetch'

async function getSpotifyLink(text) {
  try {
    const url = `${global.APIs?.evogb?.url}/search/spotify?query=${encodeURIComponent(text)}&key=${global.APIs?.evogb?.key}`
    const res = await fetch(url).then(r => r.json())
    if (res?.status && res.result?.[0]) return res.result[0]
  } catch {}
  return null
}

async function getSpotifyDL(spUrl) {
  try {
    const url = `${global.APIs?.evogb?.url}/dl/spotify?url=${encodeURIComponent(spUrl)}&key=${global.APIs?.evogb?.key}`
    const res = await fetch(url).then(r => r.json())
    const d = res?.data || res?.result
    return d?.url || d?.dl || null
  } catch {}
  return null
}

const isSpotifyUrl = (t) => /open\.spotify\.com/i.test(t)

export default {
  command: ['spotify', 'spot', 'spdl', 'spotifydl'],
  category: 'downloader',
  description: 'Descarga audios de Spotify por nombre o enlace',
  run: async ({ sock, msg, text }) => {
    const chatId = msg.chat
    const q = text?.trim()
    if (!q) return sock.sendMessage(chatId, { text: '《✧》 Pon el nombre o link de Spotify.' }, { quoted: msg })

    await sock.sendMessage(chatId, { react: { text: '🕒', key: msg.key } })

    try {
      let spUrl = q
      let info = null

      if (!isSpotifyUrl(q)) {
        info = await getSpotifyLink(q)
        if (!info) return sock.sendMessage(chatId, { text: '《✧》 No encontré resultados en Spotify.' }, { quoted: msg })
        spUrl = info.link
      }

      const dl = await getSpotifyDL(spUrl)
      if (!dl) return sock.sendMessage(chatId, { text: '《✧》 No se pudo descargar el audio de Spotify.' }, { quoted: msg })

      await sock.sendMessage(chatId, { audio: { url: dl }, mimetype: 'audio/mpeg' }, { quoted: msg })
      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } })

    } catch (e) {
      await sock.sendMessage(chatId, { text: `> Error Spotify: ${e.message}` }, { quoted: msg })
    }
  }
}