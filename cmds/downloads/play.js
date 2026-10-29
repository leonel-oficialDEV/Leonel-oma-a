import yts from 'yt-search'
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