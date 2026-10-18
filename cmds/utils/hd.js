import FormData from 'form-data'
import fetch from 'node-fetch'

export default {
  command: ['hd', 'enhance', 'remini', 'upscale', 'dehaze', 'recolor'],
  category: 'utils',
  description: 'Mejorar la calidad de una imagen.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const q = msg.quoted || msg
      const mime = q?.mimetype || q?.msg?.mimetype || ''
      if (!mime) return msg.reply(`ㅤ۟∩　ׅ　★ ໌　ׅ　🅗𝖣 🅔nhance　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ❀ ⬭ Responde a una *imagen* con:\n> ${usedPrefix + command}`)
      if (!/^image\/(jpe?g|png|webp)$/i.test(mime)) return msg.reply(`ㅤ۟∩　ׅ　★ ໌　ׅ　🅗𝖣 🅔nhance　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ❀ ⬭ El formato *${mime}* no es compatible`)
      const buffer = await q.download?.()
      if (!buffer ||!Buffer.isBuffer(buffer) || buffer.length < 10) return msg.reply('ㅤ۟∩　ׅ　★ ໌　ׅ　🅗𝖣 🅔nhance　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ❀ ⬭ No se pudo descargar la imagen')

      await sock.sendMessage(msg.chat, { text: `ㅤ۟∩　ׅ　★ ໌　ׅ　🅗𝖣 🅔nhance　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ❀ ⬭ *Mejorando en HD...*\n𖣣ֶㅤ֯⌗ ❀ ⬭ *Espera* › 5 a 15s` }, { quoted: msg })

      const result = await evogbUpscale(buffer)
      if (!result?.ok) return msg.reply(`ㅤ۟∩　ׅ　★ ໌　ׅ　🅗𝖣 🅔nhance　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ❀ ⬭ No se pudo *mejorar* la imagen\n> ${result?.error}`)

      await sock.sendMessage(msg.chat, { image: result.buffer, caption: `ㅤ۟∩　ׅ　★ ໌　ׅ　🅗𝖣 🅔nhance　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ❀ ⬭ *Imagen mejorada en HD*` }, { quoted: msg })
      await sock.sendMessage(msg.chat, { react: { text: '✅', key: msg.key } })

    } catch (e) {
      await msg.reply(`> Ocurrió un error inesperado ejecutando *${usedPrefix + command}*.`)
    }
  }
}

async function evogbUpscale(inputBuf) {
  try {
    const baseUrl = global.APIs?.evogb?.url || 'https://api.evogb.org'
    const apiKey = global.APIs?.evogb?.key
    const apiUrl = `${baseUrl}/tools/upscale?key=${apiKey}`
    const form = new FormData()
    form.append('file', inputBuf, { filename: 'image.jpg', contentType: 'image/jpeg' })
    const r = await fetch(apiUrl, { method: 'POST', body: form, headers: form.getHeaders() })
    if (!r.ok) {
      return { ok: false, error: `La API respondió con error ${r.status}, intenta más tarde.` }
    }
    const contentType = r.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const j = await r.json()
      if (!j?.status) return { ok: false, error: `Error de API: ${j?.message || 'intenta más tarde'}`.replace(apiKey, '[hidden]') }
      const dl = j.data?.url || j.data
      if (!dl) return { ok: false, error: 'La API no devolvió la imagen' }
      const imgRes = await fetch(dl)
      if (!imgRes.ok) return { ok: false, error: 'No se pudo descargar el resultado' }
      const buf = Buffer.from(await imgRes.arrayBuffer())
      return { ok: true, buffer: buf }
    }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 100) return { ok: false, error: 'Respuesta vacía de la API' }
    return { ok: true, buffer: buf }
  } catch (e) {
    return { ok: false, error: 'Error interno del servidor, intenta más tarde.' }
  }
}