import yts from 'yt-search'
import { getBuffer } from '#serialize'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DOWNLOAD_DIR = path.join('/tmp', 'descargas-yt')
const YTDLP_PATH = path.resolve('./yt-dlp')
const COOKIES_PATH = '/home/container/cookies.txt'
const YTDLP_TEMP_DIR = path.join(DOWNLOAD_DIR, 'tmp')
const MAX_INTENTOS_DESCARGA = 3
const MAX_REGISTROS = 500
const TTL_REGISTROS = 6 * 60 * 60 * 1000

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true, mode: 0o700 })
fs.mkdirSync(YTDLP_TEMP_DIR, { recursive: true, mode: 0o700 })

process.env.TMPDIR = YTDLP_TEMP_DIR
process.env.TMP = YTDLP_TEMP_DIR
process.env.TEMP = YTDLP_TEMP_DIR

try {
fs.chmodSync(DOWNLOAD_DIR, 0o700)
fs.chmodSync(YTDLP_TEMP_DIR, 0o700)
} catch {}

let ytDlp
let cargaYtDlp
const socketsRegistrados = new WeakSet()
const descargasActivas = new Set()
const mensajesPendientes = new Map()

function limpiarRegistrosAntiguos() {
const ahora = Date.now()

for (const [clave, registro] of mensajesPendientes) {
if (ahora - registro.creado > TTL_REGISTROS) {
mensajesPendientes.delete(clave)
}
}

while (mensajesPendientes.size > MAX_REGISTROS) {
const primeraClave = mensajesPendientes.keys().next().value
if (!primeraClave) break
mensajesPendientes.delete(primeraClave)
}
}

function guardarRegistro(clave, registro) {
mensajesPendientes.delete(clave)
mensajesPendientes.set(clave, registro)
limpiarRegistrosAntiguos()
}

function desenvolverMensaje(msg) {
let mensaje = msg?.message

for (let i = 0; i < 8 && mensaje; i++) {
const envoltura =
mensaje.ephemeralMessage ||
mensaje.viewOnceMessage ||
mensaje.viewOnceMessageV2 ||
mensaje.viewOnceMessageV2Extension ||
mensaje.documentWithCaptionMessage ||
mensaje.deviceSentMessage

if (!envoltura?.message) break
mensaje = envoltura.message

}

return mensaje || {}
}

async function cargarYtDlp() {
if (ytDlp) return ytDlp
if (cargaYtDlp) return cargaYtDlp

cargaYtDlp = (async () => {
const modulo = await import('yt-dlp-wrap-plus')
const YTDlpWrap =
modulo.default?.default ||
modulo.default ||
modulo.YTDlpWrap

if (!YTDlpWrap) {
  throw new Error('No se pudo cargar yt-dlp-wrap-plus.')
}

if (process.platform !== 'linux') {
  throw new Error(
    `La descarga automática está configurada para Linux. Sistema detectado: ${process.platform}`
  )
}

let descargarEjecutable = !fs.existsSync(YTDLP_PATH)

if (!descargarEjecutable) {
  try {
    fs.chmodSync(YTDLP_PATH, 0o755)

    const comprobacion = new YTDlpWrap(YTDLP_PATH)
    await comprobacion.execPromise(['--version'])

    ytDlp = comprobacion
    return ytDlp
  } catch {
    descargarEjecutable = true

    try {
      fs.unlinkSync(YTDLP_PATH)
    } catch {}
  }
}

if (descargarEjecutable) {
  let nombreEjecutable

  if (process.arch === 'x64') {
    nombreEjecutable = 'yt-dlp_linux'
  } else if (process.arch === 'arm64') {
    nombreEjecutable = 'yt-dlp_linux_aarch64'
  } else {
    throw new Error(
      `Arquitectura no compatible con la descarga automática: ${process.arch}`
    )
  }

  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${nombreEjecutable}`
  const temporal = `${YTDLP_PATH}.download`

  try {
    const respuesta = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120000)
    })

    if (!respuesta.ok) {
      throw new Error(`GitHub respondió HTTP ${respuesta.status}.`)
    }

    const buffer = Buffer.from(await respuesta.arrayBuffer())

    if (buffer.length < 100000) {
      throw new Error(
        `El ejecutable descargado es demasiado pequeño: ${buffer.length} bytes.`
      )
    }

    fs.writeFileSync(temporal, buffer, { mode: 0o755 })
    fs.chmodSync(temporal, 0o755)
    fs.renameSync(temporal, YTDLP_PATH)
    fs.chmodSync(YTDLP_PATH, 0o755)
  } catch (error) {
    try {
      fs.unlinkSync(temporal)
    } catch {}

    throw new Error(
      `No se pudo instalar yt-dlp: ${String(error?.message || error).slice(0, 500)}`
    )
  }
}

const comprobacion = new YTDlpWrap(YTDLP_PATH)

try {
  const version = await comprobacion.execPromise(['--version'])

  if (!version) {
    throw new Error('yt-dlp no devolvió su versión.')
  }
} catch (error) {
  throw new Error(
    `El ejecutable no pudo iniciarse. Detalle: ${String(error?.message || error).slice(0, 500)}`
  )
}

ytDlp = comprobacion
return ytDlp

})()

try {
return await cargaYtDlp
} finally {
cargaYtDlp = null
}
}

function limpiarTexto(texto = '') {
return String(texto)
.replace(/[\/:*?"<>|]/g, '')
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
return "${chatId}:${videoId}:${tipo}"
}

function claveMensaje(chatId, messageId) {
return "${chatId}:${messageId}"
}

function formatearDuracion(segundos = 0) {
segundos = Number(segundos) || 0

const horas = Math.floor(segundos / 3600)
const minutos = Math.floor((segundos % 3600) / 60)
const segundosRestantes = Math.floor(segundos % 60)

if (horas) {
return "${horas}:${String(minutos).padStart(2, '0')}:${String(segundosRestantes).padStart(2, '0')}"
}

return "${minutos}:${String(segundosRestantes).padStart(2, '0')}"
}

function obtenerTexto(msg) {
const mensaje = desenvolverMensaje(msg)

return (
mensaje.conversation ||
mensaje.extendedTextMessage?.text ||
mensaje.imageMessage?.caption ||
mensaje.videoMessage?.caption ||
mensaje.documentMessage?.caption ||
mensaje.buttonsResponseMessage?.selectedButtonId ||
mensaje.templateButtonReplyMessage?.selectedId ||
mensaje.listResponseMessage?.singleSelectReply?.selectedRowId ||
''
).trim()
}

function obtenerContexto(msg) {
const mensaje = desenvolverMensaje(msg)

return (
mensaje.extendedTextMessage?.contextInfo ||
mensaje.imageMessage?.contextInfo ||
mensaje.videoMessage?.contextInfo ||
mensaje.documentMessage?.contextInfo ||
mensaje.audioMessage?.contextInfo ||
mensaje.buttonsResponseMessage?.contextInfo ||
mensaje.templateButtonReplyMessage?.contextInfo ||
mensaje.listResponseMessage?.contextInfo ||
null
)
}

function obtenerChatId(msg) {
return msg?.key?.remoteJid || msg?.chat || null
}

function normalizarJid(jid) {
if (!jid) return ''

return String(jid)
.split(':')[0]
.trim()
.toLowerCase()
}

function obtenerJidUsuario(msg, sock) {
const chatId = obtenerChatId(msg)

if (msg?.key?.fromMe) {
return normalizarJid(
sock?.user?.id ||
sock?.user?.jid ||
msg?.key?.participant ||
msg?.participant ||
''
)
}

if (chatId?.endsWith('@g.us')) {
return normalizarJid(
msg?.key?.participant ||
msg?.participant ||
msg?.key?.participantAlt ||
''
)
}

return normalizarJid(
msg?.key?.participant ||
msg?.participant ||
chatId ||
''
)
}

function mismoUsuario(jidA, jidB) {
const a = normalizarJid(jidA)
const b = normalizarJid(jidB)

if (!a || !b) return false
if (a === b) return true

const esNumero = jid => jid.endsWith('@s.whatsapp.net')
const esLid = jid => jid.endsWith('@lid')

if (esNumero(a) && esNumero(b)) {
return a.split('@')[0] === b.split('@')[0]
}

if (esLid(a) && esLid(b)) {
return a.split('@')[0] === b.split('@')[0]
}

return false
}

async function buscarVideo(texto) {
const resultado = await yts(texto)

if (!resultado.videos?.length) {
throw new Error('No se encontraron resultados.')
}

return resultado.videos[0]
}

function limpiarArchivosIntento(id) {
try {
for (const nombre of fs.readdirSync(DOWNLOAD_DIR)) {
if (nombre.startsWith("${id}.")) {
try {
fs.unlinkSync(path.join(DOWNLOAD_DIR, nombre))
} catch {}
}
}

const temporalIntento = path.join(YTDLP_TEMP_DIR, id)

try {
  fs.rmSync(temporalIntento, { recursive: true, force: true })
} catch {}

} catch {}
}

function esperar(ms) {
return new Promise(resolve => setTimeout(resolve, ms))
}

async function descargarArchivo(url, tipo) {
const downloader = await cargarYtDlp()
let ultimoError

for (let intento = 1; intento <= MAX_INTENTOS_DESCARGA; intento++) {
const id = crypto.randomBytes(8).toString('hex')
const directorioIntento = path.join(YTDLP_TEMP_DIR, id)
const salida = path.join(DOWNLOAD_DIR, "${id}.%(ext)s")

fs.mkdirSync(directorioIntento, { recursive: true, mode: 0o700 })

const argumentos = [
  url,
  '--no-playlist',
  '--no-warnings',
  '--no-part',
  '--no-mtime',
  '--no-cache-dir',
  '--retries',
  '5',
  '--fragment-retries',
  '5',
  '--extractor-retries',
  '3',
  '--file-access-retries',
  '3',
  '--retry-sleep',
  '2',
  '--js-runtimes',
  'node',
  '--remote-components',
  'ejs:github',
  '--output',
  salida,
  '--paths',
  `temp:${directorioIntento}`
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
    .filter(archivo => {
      try {
        return fs.statSync(archivo).isFile() &&
          fs.statSync(archivo).size > 0
      } catch {
        return false
      }
    })

  if (!archivos.length) {
    throw new Error('yt-dlp terminó, pero no generó ningún archivo.')
  }

  const archivo = archivos.find(archivo =>
    !/\.(part|ytdl|json|description|jpg|jpeg|png|webp)$/i.test(archivo)
  ) || archivos[0]

  const buffer = fs.readFileSync(archivo)
  const extension = path.extname(archivo).slice(1) ||
    (tipo === 'audio' ? 'm4a' : 'mp4')

  try {
    fs.rmSync(directorioIntento, { recursive: true, force: true })
  } catch {}

  return { buffer, archivo, extension }
} catch (error) {
  ultimoError = error
  limpiarArchivosIntento(id)

  if (intento < MAX_INTENTOS_DESCARGA) {
    await esperar(intento * 2000)
  }
}

}

const detalle = String(ultimoError?.message || ultimoError || 'Error desconocido')

throw new Error(
"La descarga falló después de ${MAX_INTENTOS_DESCARGA} intentos. ${detalle.slice(0, 700)}"
)
}

function buscarRegistro(chatId, messageId) {
if (!messageId) return null

limpiarRegistrosAntiguos()
return mensajesPendientes.get(claveMensaje(chatId, messageId)) || null
}

async function procesarRespuesta(sock, msg) {
const texto = obtenerTexto(msg).trim().toLowerCase()

if (!['a', 'v'].includes(texto)) return

const chatId = obtenerChatId(msg)
if (!chatId) return

const contexto = obtenerContexto(msg)
const messageId = contexto?.stanzaId

if (!messageId) return

const registro = buscarRegistro(chatId, messageId)
if (!registro) return

const jidUsuario = obtenerJidUsuario(msg, sock)

if (!mismoUsuario(jidUsuario, registro.solicitante)) {
return
}

const tipo = texto === 'a' ? 'audio' : 'video'
const clave = claveDescarga(
registro.chatId || chatId,
registro.videoId,
tipo
)

if (descargasActivas.has(clave) || registro[tipo] === 'procesando') {
return
}

if (registro[tipo] === 'completada') {
return sock.sendMessage(
chatId,
{ text: "《✧》 La descarga de ${tipo} de este video ya fue procesada." },
{ quoted: msg }
).catch(() => {})
}

descargasActivas.add(clave)
registro[tipo] = 'procesando'

let archivoDescargado

try {
await sock.sendMessage(chatId, {
react: { text: '🕒', key: msg.key }
})

archivoDescargado = await descargarArchivo(registro.url, tipo)

const nombre = limpiarTexto(registro.titulo) || tipo
const duracion = Number(registro.duracion) || 0
const comoDocumento = duracion > 1200

let enviado

if (tipo === 'audio') {
  enviado = await sock.sendMessage(
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
  enviado = await sock.sendMessage(
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
registro[`${tipo}MessageKey`] = enviado?.key || null
registro.creado = Date.now()

await sock.sendMessage(chatId, {
  react: { text: '✅', key: msg.key }
})

} catch (error) {
registro[tipo] = 'pendiente'

await sock.sendMessage(chatId, {
  react: { text: '❌', key: msg.key }
}).catch(() => {})

await sock.sendMessage(
  chatId,
  {
    text: `《✧》 No se pudo descargar el ${tipo}. Puedes responder otra vez *${texto}* al mensaje original para reintentarlo.\n\n> Error: ${String(error?.message || error).slice(0, 800)}`
  },
  { quoted: msg }
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
if (!sock || socketsRegistrados.has(sock)) return

socketsRegistrados.add(sock)

sock.ev.on('messages.upsert', async ({ messages }) => {
for (const msg of messages || []) {
if (!msg?.message) continue

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

run: async ({ sock, msg, args, text }) => {
const chatId = obtenerChatId(msg)
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

  const clave = claveMensaje(chatId, sentId)

  guardarRegistro(clave, {
    chatId,
    messageId: sentId,
    videoId: obtenerVideoId(ytUrl),
    url: ytUrl,
    titulo: title,
    duracion: video.seconds || 0,
    solicitante: obtenerJidUsuario(msg, sock),
    creado: Date.now(),
    audio: 'pendiente',
    video: 'pendiente'
  })

  await sock.sendMessage(chatId, {
    react: { text: '✅', key: msg.key }
  })
} catch (error) {
  await sock.sendMessage(chatId, {
    react: { text: '❌', key: msg.key }
  }).catch(() => {})

  await sock.sendMessage(
    chatId,
    { text: `《✧》 Error: ${String(error?.message || error).slice(0, 800)}` },
    options
  ).catch(() => {})
}

}
}