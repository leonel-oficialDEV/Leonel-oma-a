import yts from 'yt-search'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { getBuffer } from '#serialize'

const mod = await import('yt-dlp-wrap-plus')
const YTDlpWrap = mod.default?.default || mod.default || mod

const YTDLP_PATH = path.resolve('./yt-dlp')
const COOKIES_PATH = '/home/container/cookies.txt'

if (!fs.existsSync(YTDLP_PATH)) {
  await YTDlpWrap.downloadFromGithub(YTDLP_PATH)
}

try {
  await fs.promises.chmod(YTDLP_PATH, 0o755)
} catch {}

const ytDlp = new YTDlpWrap(YTDLP_PATH)

let descargaActiva = false

const crearArchivoTemporal = extension => {
  return path.join(
    '/tmp',
    `yt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${extension}`
  )
}

const descargarArchivo = async (url, formato, extension) => {
  const archivo = crearArchivoTemporal(extension)

  try {
    if (!fs.existsSync(COOKIES_PATH)) {
      throw new Error(`No se encontró el archivo de cookies: ${COOKIES_PATH}`)
    }

    await ytDlp.execPromise([
      url,
      '--no-playlist',
      '--no-cache-dir',
      '--no-part',
      '--no-overwrites',
      '--cookies',
      COOKIES_PATH,
      '--js-runtimes',
      'node',
      '--remote-components',
      'ejs:github',
      '--no-warnings',
      '--quiet',
      '-f',
      formato,
      '-o',
      archivo
    ])

    if (!fs.existsSync(archivo)) {
      throw new Error('yt-dlp terminó pero no creó el archivo.')
    }

    const stat = await fs.promises.stat(archivo)

    if (!stat.size) {
      throw new Error('yt-dlp creó un archivo vacío.')
    }

    return archivo
  } catch (e) {
    try {
      if (fs.existsSync(archivo)) {
        await fs.promises.unlink(archivo)
      }
    } catch {}

    throw e
  }
}

const obtenerMiniatura = async url => {
  try {
    const buffer = await getBuffer(url)

    if (!buffer?.length) {
      return null
    }

    return await sharp(buffer)
      .resize(300, 300, {
        fit: 'cover'
      })
      .jpeg({
        quality: 80
      })
      .toBuffer()
  } catch {
    return null
  }
}

const limpiarNombre = nombre => {
  return String(nombre || 'youtube')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'youtube'
}

const isYtUrl = texto =>
  /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(texto)

const obtenerVideo = async texto => {
  if (isYtUrl(texto)) {
    const id = texto.match(
      /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([^&?/]+)/
    )?.[1]

    if (id) {
      const resultado = await yts({ videoId: id }).catch(() => null)

      if (resultado?.title) {
        return resultado
      }
    }

    const busqueda = await yts(texto)

    if (busqueda?.videos?.[0]) {
      return busqueda.videos[0]
    }

    throw new Error('No se encontró información del video.')
  }

  const busqueda = await yts(texto)

  if (!busqueda?.videos?.length) {
    throw new Error('No se encontraron resultados.')
  }

  return busqueda.videos[0]
}

const formatearVistas = vistas => {
  if (vistas == null) return 'N/A'

  try {
    return Number(vistas).toLocaleString('es-ES')
  } catch {
    return String(vistas)
  }
}

const formatearDuracion = duracion => {
  if (!duracion) return 'N/A'

  if (typeof duracion === 'string') {
    return duracion
  }

  const segundos = Number(duracion)

  if (!Number.isFinite(segundos)) {
    return 'N/A'
  }

  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const secs = segundos % 60

  if (horas > 0) {
    return `${horas}:${String(minutos).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${minutos}:${String(secs).padStart(2, '0')}`
}

const obtenerSegundos = video => {
  if (typeof video.seconds === 'number') {
    return video.seconds
  }

  if (typeof video.duration === 'number') {
    return video.duration
  }

  const duracion = video.timestamp || video.duration

  if (typeof duracion !== 'string') {
    return 0
  }

  const partes = duracion.split(':').map(Number)

  if (partes.some(Number.isNaN)) {
    return 0
  }

  if (partes.length === 3) {
    return partes[0] * 3600 + partes[1] * 60 + partes[2]
  }

  if (partes.length === 2) {
    return partes[0] * 60 + partes[1]
  }

  return Number(partes[0]) || 0
}

export default {
  command: ['play', 'mp3', 'playaudio', 'ytaudio', 'spotif'],
  category: 'downloader',

  run: async ({ sock, msg, args, text, usedPrefix, command }) => {
    let archivo = null
    let collector = null
    let collectorTimeout = null

    try {
      const isChannel = msg.chat.endsWith('@newsletter')
      const options = isChannel ? undefined : { quoted: msg }
      const chatId = msg.chat
      const q = text?.trim()

      if (!q) {
        return sock.sendMessage(
          chatId,
          {
            text: '《✧》 Por favor, menciona el nombre o URL de YouTube que deseas descargar.'
          },
          options
        )
      }

      if (descargaActiva) {
        return sock.sendMessage(
          chatId,
          {
            text: '《✧》 Ya hay una descarga en proceso, espera a que termine.'
          },
          options
        )
      }

      await sock.sendMessage(chatId, {
        react: { text: '🕒', key: msg.key }
      })

      const video = await obtenerVideo(q)

      if (!video?.url) {
        throw new Error('No se pudo obtener la URL del video.')
      }

      const title = limpiarNombre(video.title)
      const thumb = video.thumbnail
        ? await obtenerMiniatura(video.thumbnail)
        : null

      const author = video.author?.name || 'Desconocido'
      const duration = video.timestamp || formatearDuracion(video.seconds)
      const vistas = formatearVistas(video.views)
      const ytUrl = video.url

      let infoMessage = `➩ Descargando › ${video.title || title}\n\n`
      infoMessage += `> ❖ Canal › *${author}*\n`
      infoMessage += `> ⴵ Duración › *${duration}*\n`
      infoMessage += `> ❀ Vistas › *${vistas}*\n`
      infoMessage += `> ❒ YouTube › *${ytUrl}*\n`
      infoMessage += '\n*Responde a este mensaje con:*\n'
      infoMessage += '> *yt* para descargar el audio de YouTube'

      let sent

      if (thumb) {
        try {
          sent = await sock.sendMessage(
            chatId,
            {
              image: thumb,
              caption: infoMessage
            },
            options
          )
        } catch {
          sent = await sock.sendMessage(
            chatId,
            { text: infoMessage },
            options
          )
        }
      } else {
        sent = await sock.sendMessage(
          chatId,
          { text: infoMessage },
          options
        )
      }

      const sentId = sent.key.id
      const requesterId = msg.key.participant || msg.key.remoteJid
      let uses = 0
      const maxUses = 2

      collector = async upsert => {
        try {
          const m = upsert.messages?.[0]

          if (!m || m.key.fromMe) return
          if (m.key.remoteJid !== chatId) return

          const senderId = m.key.participant || m.key.remoteJid

          const isOwner =
            senderId === requesterId ||
            m.key.remoteJid === requesterId ||
            (
              msg.sender &&
              senderId.includes(msg.sender.split('@')[0])
            )

          if (!isOwner && chatId.endsWith('@g.us')) return

          const mText = (
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.imageMessage?.caption ||
            ''
          ).toLowerCase().trim()

          if (!['yt', 'youtube'].includes(mText)) return

          const ctx = m.message?.extendedTextMessage?.contextInfo

          if (ctx?.stanzaId !== sentId) return

          if (uses >= maxUses) {
            sock.ev.off('messages.upsert', collector)
            clearTimeout(collectorTimeout)
            return
          }

          uses++

          await sock.sendMessage(chatId, {
            react: { text: '🕒', key: m.key }
          })

          let audioArchivo = null

          try {
            descargaActiva = true

            audioArchivo = await descargarArchivo(
              ytUrl,
              'bestaudio[ext=m4a]/bestaudio',
              'm4a'
            )

            await sock.sendMessage(
              chatId,
              {
                audio: { url: audioArchivo },
                fileName: `${title}.m4a`,
                mimetype: 'audio/mp4'
              },
              { quoted: m }
            )

            await sock.sendMessage(chatId, {
              react: { text: '✅', key: m.key }
            })
          } catch (e) {
            await sock.sendMessage(
              chatId,
              {
                text: `《✧》 No se pudo descargar el audio.\n\n> Error: ${e?.message || e}`
              },
              { quoted: m }
            )
          } finally {
            descargaActiva = false

            if (audioArchivo) {
              try {
                if (fs.existsSync(audioArchivo)) {
                  await fs.promises.unlink(audioArchivo)
                }
              } catch {}
            }
          }

          if (uses >= maxUses) {
            sock.ev.off('messages.upsert', collector)
            clearTimeout(collectorTimeout)
          }
        } catch (e) {
          console.error('[play collector]', e)
        }
      }

      sock.ev.on('messages.upsert', collector)

      collectorTimeout = setTimeout(() => {
        try {
          sock.ev.off('messages.upsert', collector)
        } catch {}
      }, 900000)

      await sock.sendMessage(chatId, {
        react: { text: '✅', key: msg.key }
      })
    } catch (e) {
      await sock.sendMessage(
        msg.chat,
        {
          text: `《✧》 No se pudo procesar la descarga.\n\n> Error: ${e?.message || e}`
        },
        { quoted: msg }
      )
    }
  }
}