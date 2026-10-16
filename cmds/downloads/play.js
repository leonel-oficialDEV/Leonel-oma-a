import yts from 'yt-search'
import { getBuffer } from '#serialize'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DOWNLOAD_DIR = path.resolve('./descargas-yt')
const DATABASE_FILE = path.join(DOWNLOAD_DIR, 'play.json')
const YTDLP_PATH = path.resolve('./yt-dlp')
const COOKIES_PATH = '/home/container/cookies.txt'

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

let ytDlp
const socketsRegistrados = new WeakSet()
const descargasActivas = new Set()

function leerBaseDatos() {
  try {
    if (!fs.existsSync(DATABASE_FILE)) {
      fs.writeFileSync(
        DATABASE_FILE,
        JSON.stringify({ mensajes: {}, completadas: {} }, null, 2)
      )
    }

    const data = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'))

    return {
      mensajes: data.mensajes || {},
      completadas: data.completadas || {}
    }
  } catch {
    return { mensajes: {}, completadas: {} }
  }
}

let baseDatos = leerBaseDatos()

function guardarBaseDatos() {
  const temporal = `${DATABASE_FILE}.tmp`

  fs.writeFileSync(temporal, JSON.stringify(baseDatos, null, 2))
  fs.renameSync(temporal, DATABASE_FILE)
}

async function cargarYtDlp() {
  if (ytDlp) return ytDlp

  const modulo = await import('yt-dlp-wrap-plus')
  const YTDlpWrap =
    modulo.default?.default ||
    modulo.default ||
    modulo.YTDlpWrap

  if (!YTDlpWrap) {
    throw new Error('No se pudo cargar yt-dlp-wrap-plus.')
  }

  ytDlp = new YTDlpWrap(YTDLP_PATH)
  return ytDlp
}

function limpiarTexto(texto = '') {
  return String(texto)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
}

function obtenerVideoId(url = '') {
  try {
    const parsed = new URL(url)

    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] || url
    }

    if (parsed.searchParams.get('v')) {
      return parsed.searchParams.get('v')
    }

    const partes = parsed.pathname.split('/').filter(Boolean)

    if (['shorts', 'embed', 'live'].includes(partes[0])) {
      return partes[1] || url
    }

    return url
  } catch {
    return url
  }
}

function claveDescarga(chatId, videoId, tipo) {
  return `${chatId}:${videoId}:${tipo}`
}

function claveMensaje(chatId, messageId) {
  return `${chatId}:${messageId}`
}

function formatearDuracion(segundos = 0) {
  segundos = Number(segundos) || 0

  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const segundosRestantes = Math.floor(segundos % 60)

  if (horas) {
    return `${horas}:${String(minutos).padStart(2, '0')}:${String(segundosRestantes).padStart(2, '0')}`
  }

  return `${minutos}:${String(segundosRestantes).padStart(2, '0')}`
}

function obtenerTexto(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''
  ).trim()
}

async function buscarVideo(texto) {
  const resultado = await yts(texto)

  if (!resultado.videos?.length) {
    throw new Error('No se encontraron resultados.')
  }

  return resultado.videos[0]
}

async function descargarArchivo(url, tipo) {
  const downloader = await cargarYtDlp()
  const id = crypto.randomBytes(8).toString('hex')
  const salida = path.join(DOWNLOAD_DIR, `${id}.%(ext)s`)

  const argumentos = [
    url,
    '--no-playlist',
    '--no-warnings',
    '--no-part',
    '--no-mtime',
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
    '--output',
    salida
  ]

  if (fs.existsSync(COOKIES_PATH)) {
    argumentos.push('--cookies', COOKIES_PATH)
  }

  if (tipo === 'audio') {
    argumentos.push(
      '-f',
      'bestaudio[ext=m4a]/bestaudio',
      '--extract-audio',
      '--audio-format',
      'm4a',
      '--audio-quality',
      '0'
    )
  } else {
    argumentos.push(
      '-f',
      'best[ext=mp4][height<=720]/best[height<=720]/best',
      '--merge-output-format',
      'mp4'
    )
  }

  try {
    await downloader.execPromise(argumentos)

    const archivos = fs.readdirSync(DOWNLOAD_DIR)
      .filter(nombre => nombre.startsWith(`${id}.`))
      .map(nombre => path.join(DOWNLOAD_DIR, nombre))

    if (!archivos.length) {
      throw new Error('No se generó el archivo de descarga.')
    }

    const archivo = archivos[0]

    return {
      buffer: fs.readFileSync(archivo),
      archivo,
      extension: path.extname(archivo).slice(1) || (tipo === 'audio' ? 'm4a' : 'mp4')
    }
  } catch (error) {
    for (const nombre of fs.readdirSync(DOWNLOAD_DIR)) {
      if (nombre.startsWith(`${id}.`)) {
        try {
          fs.unlinkSync(path.join(DOWNLOAD_DIR, nombre))
        } catch {}
      }
    }

    throw error
  }
}

function buscarRegistro(chatId, messageId) {
  if (!messageId) return null
  return baseDatos.mensajes[claveMensaje(chatId, messageId)] || null
}

async function procesarRespuesta(sock, msg) {
  const texto = obtenerTexto(msg).toLowerCase()
  if (!['a', 'v'].includes(texto)) return

  const chatId = msg.key?.remoteJid
  if (!chatId) return

  const contexto =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo

  const messageId = contexto?.stanzaId
  if (!messageId) return

  const registro = buscarRegistro(chatId, messageId)
  if (!registro) return

  const tipo = texto === 'a' ? 'audio' : 'video'
  const tipoTexto = tipo === 'audio' ? 'audio' : 'video'
  const clave = claveDescarga(chatId, registro.videoId, tipo)

  if (baseDatos.completadas[clave] || registro[tipo] === 'completada') {
    await sock.sendMessage(
      chatId,
      {
        text: `《✧》 La descarga de ${tipoTexto} de este video ya fue procesada.\n\n➩ *${registro.titulo}*`,
        quoted: msg
      }
    )

    if (!baseDatos.completadas[clave]) {
      baseDatos.completadas[clave] = {
        titulo: registro.titulo,
        url: registro.url,
        fecha: Date.now()
      }
      guardarBaseDatos()
    }

    return
  }

  if (descargasActivas.has(clave)) {
    await sock.sendMessage(
      chatId,
      {
        text: `《✧》 La descarga de ${tipoTexto} ya está en proceso. Espera a que termine y vuelve a intentarlo si fuera necesario.`,
        quoted: msg
      }
    )
    return
  }

  descargasActivas.add(clave)
  registro[tipo] = 'procesando'
  guardarBaseDatos()

  let archivoDescargado

  try {
    await sock.sendMessage(chatId, {
      react: { text: '🕒', key: msg.key }
    })

    archivoDescargado = await descargarArchivo(registro.url, tipo)

    const nombre = limpiarTexto(registro.titulo) || tipo
    const duracion = Number(registro.duracion) || 0
    const comoDocumento = duracion > 1200

    if (tipo === 'audio') {
      await sock.sendMessage(
        chatId,
        comoDocumento
          ? {
              document: archivoDescargado.buffer,
              mimetype: 'audio/mp4',
              fileName: `${nombre}.${archivoDescargado.extension}`,
              caption: `➩ ${registro.titulo}`
            }
          : {
              audio: archivoDescargado.buffer,
              mimetype: 'audio/mp4',
              fileName: `${nombre}.${archivoDescargado.extension}`
            },
        { quoted: msg }
      )
    } else {
      await sock.sendMessage(
        chatId,
        comoDocumento
          ? {
              document: archivoDescargado.buffer,
              mimetype: 'video/mp4',
              fileName: `${nombre}.${archivoDescargado.extension}`,
              caption: `➩ ${registro.titulo}`
            }
          : {
              video: archivoDescargado.buffer,
              mimetype: 'video/mp4',
              fileName: `${nombre}.${archivoDescargado.extension}`,
              caption: `➩ ${registro.titulo}`
            },
        { quoted: msg }
      )
    }

    registro[tipo] = 'completada'

    baseDatos.completadas[clave] = {
      titulo: registro.titulo,
      url: registro.url,
      fecha: Date.now()
    }

    guardarBaseDatos()

    await sock.sendMessage(chatId, {
      react: { text: '✅', key: msg.key }
    })
  } catch (error) {
    registro[tipo] = 'pendiente'
    guardarBaseDatos()

    await sock.sendMessage(chatId, {
      react: { text: '❌', key: msg.key }
    }).catch(() => {})

    await sock.sendMessage(
      chatId,
      {
        text: `《✧》 No se pudo descargar el ${tipoTexto}. Puedes responder otra vez *${texto}* a la respuesta original para reintentarlo.\n\n> Error: ${String(error?.message || error).slice(0, 400)}`,
        quoted: msg
      }
    ).catch(() => {})
  } finally {
    descargasActivas.delete(clave)

    if (archivoDescargado?.archivo) {
      try {
        fs.unlinkSync(archivoDescargado.archivo)
      } catch {}
    }
  }
}

function registrarEscucha(sock) {
  if (socketsRegistrados.has(sock)) return
  socketsRegistrados.add(sock)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages || []) {
      if (!msg.message || msg.key?.fromMe) continue

      try {
        await procesarRespuesta(sock, msg)
      } catch (error) {
        console.error('[play collector]', error)
      }
    }
  })
}

export default {
  command: ['play', 'mp3', 'playaudio', 'ytaudio', 'play2', 'playvid'],
  category: 'downloader',

  async before({ sock }) {
    if (sock) registrarEscucha(sock)
  },

  run: async ({ sock, msg, args, text, usedPrefix, command }) => {
    const chatId = msg.chat || msg.key?.remoteJid
    const isChannel = chatId?.endsWith('@newsletter')
    const options = isChannel ? undefined : { quoted: msg }
    const q = (text || args?.join(' ') || '').trim()

    try {
      registrarEscucha(sock)

      if (!q) {
        return sock.sendMessage(
          chatId,
          {
            text: '《✧》 Por favor, menciona el nombre o URL de YouTube que deseas descargar.'
          },
          options
        )
      }

      await sock.sendMessage(chatId, {
        react: { text: '🕒', key: msg.key }
      })

      const video = await buscarVideo(q)
      const title = video.title || q
      const thumb = video.thumbnail || null
      const ytUrl = video.url
      const author = video.author?.name || 'Desconocido'
      const duration = video.timestamp || formatearDuracion(video.seconds)
      const vistas = Number(video.views || 0).toLocaleString()

      let infoMessage = `➩ Descargando › ${title}\n\n`
      infoMessage += `> ❖ Canal › *${author}*\n`
      infoMessage += `> ⴵ Duración › *${duration}*\n`
      infoMessage += `> ❀ Vistas › *${vistas}*\n`
      infoMessage += `> ❒ YouTube › *${ytUrl}*\n`
      infoMessage += '\n*Responde a este mensaje con:*\n'
      infoMessage += '> *a* para descargar audio\n'
      infoMessage += '> *v* para descargar video'

      let sent

      if (thumb) {
        try {
          const thumbBuffer = await getBuffer(thumb)
          sent = await sock.sendMessage(
            chatId,
            { image: thumbBuffer, caption: infoMessage },
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

      const sentId = sent?.key?.id

      if (!sentId) {
        throw new Error('No se pudo obtener el ID del mensaje enviado.')
      }

      const videoId = obtenerVideoId(ytUrl)
      const clave = claveMensaje(chatId, sentId)

      baseDatos.mensajes[clave] = {
        chatId,
        messageId: sentId,
        videoId,
        url: ytUrl,
        titulo: title,
        duracion: video.seconds || 0,
        solicitante: msg.key?.participant || msg.key?.remoteJid,
        creado: Date.now(),
        audio: 'pendiente',
        video: 'pendiente'
      }

      guardarBaseDatos()

      await sock.sendMessage(chatId, {
        react: { text: '✅', key: msg.key }
      })
    } catch (error) {
      await sock.sendMessage(chatId, {
        react: { text: '❌', key: msg.key }
      }).catch(() => {})

      await sock.sendMessage(
        chatId,
        { text: `《✧》 Error: ${error.message}` },
        options
      ).catch(() => {})
    }
  }
}