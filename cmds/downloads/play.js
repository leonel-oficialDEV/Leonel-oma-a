import yts from 'yt-search'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'

const DIR = './descargas-yt'
const DB_FILE = path.join(DIR, 'play.json')
const YTDLP = './yt-dlp'
const COOKIES = '/home/container/cookies.txt'

const descargasActivas = new Map()
const socketsRegistrados = new WeakSet()

fs.mkdirSync(DIR, { recursive: true })

function cargarBaseDatos() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(
        DB_FILE,
        JSON.stringify({ mensajes: {}, completadas: {} }, null, 2)
      )
    }

    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))

    return {
      mensajes: data.mensajes || {},
      completadas: data.completadas || {}
    }
  } catch {
    return { mensajes: {}, completadas: {} }
  }
}

let baseDatos = cargarBaseDatos()

function guardarBaseDatos() {
  const temporal = `${DB_FILE}.tmp`

  fs.writeFileSync(temporal, JSON.stringify(baseDatos, null, 2))
  fs.renameSync(temporal, DB_FILE)
}

function obtenerTexto(msg) {
  const m = msg.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim()
}

function obtenerContexto(msg) {
  const m = msg.message || {}

  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.buttonsResponseMessage?.contextInfo ||
    m.templateButtonReplyMessage?.contextInfo ||
    null
  )
}

function limpiarNombre(nombre) {
  return String(nombre || 'youtube')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'youtube'
}

function ejecutarYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proceso = spawn(YTDLP, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let salida = ''
    let error = ''

    proceso.stdout.on('data', data => {
      salida += data.toString()
    })

    proceso.stderr.on('data', data => {
      error += data.toString()
    })

    proceso.on('error', reject)

    proceso.on('close', codigo => {
      if (codigo === 0) {
        resolve({ salida, error })
      } else {
        reject(
          new Error(
            error.trim() ||
            salida.trim() ||
            `yt-dlp terminó con código ${codigo}`
          )
        )
      }
    })
  })
}

async function descargarArchivo(url, tipo, id) {
  const prefijo = path.join(DIR, `${id}`)
  const plantilla = `${prefijo}.%(ext)s`

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--restrict-filenames'
  ]

  if (fs.existsSync(COOKIES)) {
    args.push('--cookies', COOKIES)
  }

  if (tipo === 'audio') {
    args.push(
      '-f',
      'bestaudio[ext=m4a]/bestaudio',
      '-x',
      '--audio-format',
      'm4a',
      '--audio-quality',
      '0',
      '-o',
      plantilla,
      url
    )
  } else {
    args.push(
      '-f',
      'best[ext=mp4][height<=720]/best[height<=720]/best',
      '--merge-output-format',
      'mp4',
      '-o',
      plantilla,
      url
    )
  }

  await ejecutarYtDlp(args)

  const archivo = fs.readdirSync(DIR).find(nombre =>
    nombre.startsWith(`${id}.`) &&
    !nombre.endsWith('.part') &&
    !nombre.endsWith('.ytdl')
  )

  if (!archivo) {
    throw new Error('No se encontró el archivo descargado.')
  }

  return path.join(DIR, archivo)
}

function borrarArchivo(archivo) {
  try {
    if (archivo && fs.existsSync(archivo)) {
      fs.unlinkSync(archivo)
    }
  } catch {}
}

function obtenerNumero(jid) {
  return String(jid || '').split('@')[0].split(':')[0]
}

async function procesarRespuesta(sock, msg) {
  const texto = obtenerTexto(msg).toLowerCase()
  if (texto !== 'a' && texto !== 'v') return

  const contexto = obtenerContexto(msg)
  const idCitado = contexto?.stanzaId

  if (!idCitado) return

  const chatId = msg.key.remoteJid
  const claveMensaje = `${chatId}:${idCitado}`
  const registro = baseDatos.mensajes[claveMensaje]

  if (!registro) return

  const tipo = texto === 'a' ? 'audio' : 'video'
  const clave = `${chatId}:${registro.videoId}:${tipo}`
  const jidUsuario = msg.key.participant || msg.key.remoteJid
  const numero = obtenerNumero(jidUsuario)

  const completada = baseDatos.completadas[clave]

  if (completada || registro[tipo] === 'completada') {
    const mensajeGuardado = completada?.messageKey
    const mensajeCitado = completada?.quotedMessage

    const opcionesCita = mensajeGuardado
      ? {
          key: mensajeGuardado,
          message: mensajeCitado || (
            tipo === 'audio'
              ? {
                  audioMessage: {
                    mimetype: 'audio/mp4',
                    fileName: `${limpiarNombre(registro.titulo)}.m4a`
                  }
                }
              : {
                  videoMessage: {
                    mimetype: 'video/mp4',
                    fileName: `${limpiarNombre(registro.titulo)}.mp4`
                  }
                }
          )
        }
      : msg

    await sock.sendMessage(
      chatId,
      {
        text: `《✧》 La descarga de ${tipo} de este video ya fue procesada. Aquí está la descarga @${numero}`,
        mentions: [jidUsuario]
      },
      { quoted: opcionesCita }
    )

    return
  }

  if (descargasActivas.has(clave)) {
    await sock.sendMessage(
      chatId,
      {
        text: `《✧》 La descarga de ${tipo} ya está en proceso. Espera a que termine.`,
        mentions: [jidUsuario]
      },
      { quoted: msg }
    )

    return
  }

  descargasActivas.set(clave, true)
  registro[tipo] = 'descargando'
  guardarBaseDatos()

  let archivo

  try {
    await sock.sendMessage(
      chatId,
      { react: { text: '🕒', key: msg.key } }
    )

    const idArchivo = crypto.randomBytes(8).toString('hex')
    archivo = await descargarArchivo(registro.url, tipo, idArchivo)

    const buffer = fs.readFileSync(archivo)
    const nombre = limpiarNombre(registro.titulo)

    let enviado

    if (tipo === 'audio') {
      enviado = await sock.sendMessage(
        chatId,
        {
          audio: buffer,
          mimetype: 'audio/mp4',
          fileName: `${nombre}.m4a`,
          ptt: false
        },
        { quoted: msg }
      )
    } else {
      enviado = await sock.sendMessage(
        chatId,
        {
          video: buffer,
          mimetype: 'video/mp4',
          fileName: `${nombre}.mp4`,
          caption: `❒ ${registro.titulo}`
        },
        { quoted: msg }
      )
    }

    registro[tipo] = 'completada'
    registro[`${tipo}MessageKey`] = enviado.key
    registro[`${tipo}QuotedMessage`] = enviado.message

    baseDatos.completadas[clave] = {
      tipo,
      messageKey: enviado.key,
      quotedMessage: enviado.message,
      fecha: Date.now()
    }

    guardarBaseDatos()

    await sock.sendMessage(
      chatId,
      { react: { text: '✅', key: msg.key } }
    )
  } catch (error) {
    registro[tipo] = 'pendiente'
    guardarBaseDatos()

    await sock.sendMessage(
      chatId,
      {
        text: `《✧》 No se pudo descargar el ${tipo}.\n\n> ❖ Detalle: ${String(error.message || error).slice(0, 700)}`
      },
      { quoted: msg }
    )

    await sock.sendMessage(
      chatId,
      { react: { text: '❌', key: msg.key } }
    ).catch(() => {})
  } finally {
    borrarArchivo(archivo)
    descargasActivas.delete(clave)
  }
}

function registrarEscucha(sock) {
  if (socketsRegistrados.has(sock)) return

  socketsRegistrados.add(sock)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        if (!msg?.message || msg.key?.fromMe) continue
        await procesarRespuesta(sock, msg)
      } catch (error) {
        console.error('Error procesando respuesta de YouTube:', error)
      }
    }
  })
}

export default {
  command: ['play', 'play2', 'playvid', 'ytplay', 'playaudio'],
  category: 'downloader',

  async before({ sock }) {
    registrarEscucha(sock)
  },

  run: async ({ sock, msg, args, text, usedPrefix, command }) => {
    registrarEscucha(sock)

    const consulta = String(text || args?.join(' ') || '').trim()

    if (!consulta) {
      return sock.sendMessage(
        msg.key.remoteJid,
        {
          text: `《✧》 Escribe el nombre de una canción o un enlace de YouTube.\n\n> Ejemplo: ${usedPrefix}${command} nombre de la canción`
        },
        { quoted: msg }
      )
    }

    const chatId = msg.key.remoteJid

    try {
      await sock.sendMessage(
        chatId,
        { react: { text: '🕒', key: msg.key } }
      )

      let video

      if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(consulta)) {
        const resultado = await yts(consulta)
        video = resultado.videos?.[0]

        if (!video) {
          const id = consulta.match(
            /(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/
          )?.[1]

          if (id) {
            video = {
              videoId: id,
              url: `https://www.youtube.com/watch?v=${id}`,
              title: 'Video de YouTube',
              author: { name: 'YouTube' },
              timestamp: 'Desconocida',
              views: 0,
              thumbnail: ''
            }
          }
        }
      } else {
        const resultado = await yts(consulta)
        video = resultado.videos?.[0]
      }

      if (!video?.videoId || !video?.url) {
        throw new Error('No se encontró ningún video con esa búsqueda.')
      }

      const ytUrl = video.url
      const titulo = video.title || 'Video de YouTube'
      const autor = video.author?.name || 'Desconocido'
      const duracion = video.timestamp || 'Desconocida'
      const vistas = Number(video.views || 0).toLocaleString('es')
      const solicitante = msg.key.participant || msg.key.remoteJid

      const caption = [
        `➩ Descargando › ${titulo}`,
        '',
        `> ❖ Canal › *${autor}*`,
        `> ⴵ Duración › *${duracion}*`,
        `> ❀ Vistas › *${vistas}*`,
        `> ❒ YouTube › *${ytUrl}*`,
        '',
        'Responde a este mensaje con:',
        '',
        '➩ *a* para descargar audio',
        '➩ *v* para descargar video'
      ].join('\n')

      const enviado = await sock.sendMessage(
        chatId,
        { text: caption },
        { quoted: msg }
      )

      const claveMensaje = `${chatId}:${enviado.key.id}`

      baseDatos.mensajes[claveMensaje] = {
        chatId,
        messageId: enviado.key.id,
        videoId: video.videoId,
        url: ytUrl,
        titulo,
        duracion,
        solicitante,
        creado: Date.now(),
        audio: 'pendiente',
        video: 'pendiente'
      }

      guardarBaseDatos()

      await sock.sendMessage(
        chatId,
        { react: { text: '✅', key: msg.key } }
      )
    } catch (error) {
      await sock.sendMessage(
        chatId,
        {
          text: `《✧》 Ocurrió un error al buscar el video.\n\n> ❖ Detalle: ${String(error.message || error).slice(0, 700)}`
        },
        { quoted: msg }
      )

      await sock.sendMessage(
        chatId,
        { react: { text: '❌', key: msg.key } }
      ).catch(() => {})
    }
  }
}