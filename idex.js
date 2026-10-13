import "./settings.js";
import handler from '#handler';
import events from '#events';
import makeWASocket, { Browsers, makeCacheableSignalKeyStore, useMultiFileAuthState, fetchLatestBaileysVersion, jidDecode, DisconnectReason } from 'baileys';
import pino from "pino";
import qrcode from "qrcode-terminal";
import chalk from "chalk";
import cfonts from "cfonts";
import fs from "fs";
import path from "path";
import readlineSync from "readline-sync";
import { smsg, getCachedMeta, setCachedMeta, deleteCachedMeta, patchGroupMetadata } from "#serialize";
import cmdsLoader from '#cmdsloader';
import "#db";
import { startSubBot } from '#subs';
import db from '#db';
import NodeCache from "node-cache";

const log = {
  info: (msg) => console.log(chalk.bgBlue.white.bold(` INFO `), chalk.white(msg)),
  success: (msg) => console.log(chalk.bgGreen.white.bold(` SUCCESS `), chalk.greenBright(msg)),
  warn: (msg) => console.log(chalk.bgYellowBright.blueBright.bold(` WARNING `), chalk.yellow(msg)),
  error: (msg) => console.log(chalk.bgRed.white.bold(` ERROR `), chalk.redBright(msg))
};

const { say } = cfonts;
console.log(chalk.magentaBright('\n❀ Iniciando Sistema...'));
say('tohka', {
  align: 'center',           
  gradient: ['red', 'blue'] 
});
say('handler & index by: NetherLord2233', {
  font: 'console',
  align: 'center',
  gradient: ['blue', 'magenta']
});
say('powered by LoFi TEAM', {
  font: 'console',
  align: 'center',
  gradient: ['blue', 'magenta']
});

let phoneNumber = "";
let phoneInput = "";
const methodCodeQR = process.argv.includes("--qr");
const methodCode = process.argv.includes("code");

function normalizePhone(input) {
  let s = String(input).replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = s.replace(/^0+/, '');
  if (s.length === 10 && s.startsWith('3')) s = '57' + s;
  if (s.startsWith('52') && !s.startsWith('521') && s.length >= 12) s = '521' + s.slice(2);
  if (s.startsWith('54') && !s.startsWith('549') && s.length >= 11) s = '549' + s.slice(2);
  return s;
}

if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
if (!fs.existsSync('./lib/system/tmp')) fs.mkdirSync('./lib/system/tmp', { recursive: true });

global.conns = global.conns || [];
const reconnecting = new Set();
const msgStore = new Map();
const msgLimit = 500;

const versionCache = { value: null, expiresAt: 0 };

async function getVersion() {
  if (versionCache.value && Date.now() < versionCache.expiresAt) return versionCache.value;
  try {
    const latest = await fetchLatestBaileysVersion();
    versionCache.value = latest.version;
    versionCache.expiresAt = Date.now() + 60 * 60 * 1000;
  } catch (e) {
    if (!versionCache.value) versionCache.value = [2, 3000, 1033105955];
  }
  return versionCache.value;
}

function cleanCache() {
  try {
    const dirs = ['./tmp', './lib/system/tmp'];
    dirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          try { fs.unlinkSync(path.join(dir, file)); } catch {}
        });
      }
    });
  } catch (e) {
    log.error(`cleanCache → ${e?.message || e}`);
  }
}

const BOT_TYPES = [
  { name: 'SubBot', folder: './Sessions/Subs', starter: startSubBot }
];

async function loadBots() {
  for (const { name, folder, starter } of BOT_TYPES) {
    if (!fs.existsSync(folder)) continue;
    const botIds = fs.readdirSync(folder);
    for (const userId of botIds) {
      const sessionPath = path.join(folder, userId);
      const credsPath = path.join(sessionPath, 'creds.json');
      if (!fs.existsSync(credsPath)) continue;
      if (global.conns.some((conn) => conn.userId === userId)) continue;
      if (reconnecting.has(userId)) continue;
      try {
        reconnecting.add(userId);
        await starter(null, null, '', false, userId, '');
      } catch (e) {
        console.log(chalk.gray(`[ loadBots ] Error iniciando ${name} ${userId}: ${e?.message || e}`));
        reconnecting.delete(userId);
      }
      await new Promise((res) => setTimeout(res, 2500));
    }
  }
  setTimeout(loadBots, 60 * 1000);
}

async function initDB() {
  try {
    if (typeof db?.initDB === 'function') db.initDB();
    if (typeof db?.clearDB === 'function') db.clearDB();
    global.db = db;
    global.db.data ||= { chats: {}, settings: {}, users: {} };
    log.info('Base de datos cargada correctamente.');
  } catch (e) {
    log.error(`Error cargando la Base de Datos: ${e?.message || e}`);
  }
}

function clearSession() {
  try {
    const sessionDir = './Sessions/Owner';
    if (!fs.existsSync(sessionDir)) return;
    for (const file of fs.readdirSync(sessionDir)) {
      try { fs.unlinkSync(path.join(sessionDir, file)); } catch {}
    }
    log.warn('Sesión del principal eliminada — reiniciando para vincular de nuevo...');
  } catch (e) {
    log.error(`clearSession → ${e?.message || e}`);
  }
}

function remove(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.ws?.close(); } catch {}
  try { sock.end?.(new Error('replaced')); } catch {}
  try { sock.msgRetryCounterCache?.close(); } catch {}
}

let opcion;
if (methodCodeQR) {
  opcion = "1";
} else if (methodCode) {
  opcion = "2";
  if (!phoneNumber) {
    console.log(chalk.bold.redBright(`\nPor favor, Ingrese el número de WhatsApp.\n${chalk.bold.yellowBright("Ejemplo: +57301******")}\n${chalk.bold.magentaBright('---> ')}`));
    phoneInput = readlineSync.question("");
    phoneNumber = normalizePhone(phoneInput);
  }
} else if (!fs.existsSync("./Sessions/Owner/creds.json")) {
  opcion = readlineSync.question(chalk.bold.white("\nSeleccione una opción:\n") + chalk.blueBright("1. Con código QR\n") + chalk.cyan("2. Con código de texto de 8 dígitos\n--> "));
  while (!/^[1-2]$/.test(opcion)) {
    console.log(chalk.bold.redBright(`No se permiten números que no sean 1 o 2, tampoco letras o símbolos especiales.`));
    opcion = readlineSync.question("--> ");
  }
  if (opcion === "2") {
    console.log(chalk.bold.redBright(`\nPor favor, Ingrese el número de WhatsApp.\n${chalk.bold.yellowBright("Ejemplo: +57301******")}\n${chalk.bold.magentaBright('---> ')}`));
    phoneInput = readlineSync.question("");
    phoneNumber = normalizePhone(phoneInput);
  }
}

let bootTime = Date.now();
let reconexion = 0;
let botReady = false;
let isRestarting = false;
const retriesLimit = 15;

export async function startBot() {
  if (isRestarting) return;
  isRestarting = true;
  bootTime = Date.now();

  const { state, saveCreds: saveCredsDB } = await useMultiFileAuthState('./Sessions/Owner');
  const version = await getVersion();

  let saveCredsTimer = null;
  const saveCreds = () => { 
    clearTimeout(saveCredsTimer); 
    saveCredsTimer = setTimeout(saveCredsDB, 2000); 
  };

  const logger = pino({ level: "silent" });

  console.info = () => {};
  console.debug = () => {};

  const sock = makeWASocket({
    version,
    logger,
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true, 
    shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 20000,
    getMessage: async (key) => msgStore.get(key.remoteJid + ':' + key.id),
  });

  global.sock = sock;
  if (typeof patchGroupMetadata === 'function') patchGroupMetadata(sock);
  sock.ev.on("creds.update", saveCreds);

  sock.sendText = (jid, text, quoted = "", options) => sock.sendMessage(jid, { text, ...options }, { quoted });

  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const decode = jidDecode(jid) || {};
      jid = (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    }
    return jid;
  };

  if (opcion === "2" && !state.creds.registered) {
    setTimeout(async () => {
      try {
        if (!state.creds.registered) {
          const pairing = await sock.requestPairingCode(phoneNumber);
          const codeBot = pairing?.match(/.{1,4}/g)?.join("-") || pairing;
          console.log(chalk.bold.white(chalk.bgMagenta(`Código de emparejamiento:`)), chalk.bold.white(chalk.white(codeBot)));
        }
      } catch (err) {
        console.log(chalk.red("Error al generar código:"), err);
      }
    }, 3000);
  }

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (!botReady) return;
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg?.message && msg?.key?.id) {
        const sid = msg.key.remoteJid + ':' + msg.key.id;
        msgStore.set(sid, msg.message);
        if (msgStore.size > msgLimit) msgStore.delete(msgStore.keys().next().value);
      }
      try {
        if (!msg?.message || msg.key?.remoteJid === "status@broadcast") continue;
        if ((msg.messageTimestamp * 1000) < bootTime - 15_000) continue;
        if (msg.message.ephemeralMessage) msg.message = msg.message.ephemeralMessage.message;

        let sender = msg.key.participant || msg.key.remoteJid;
        if (sender?.endsWith('@lid')) {
          const pnJid = await sock.signalRepository?.jidToSignalProtocolAddress?.(sender);
          if (pnJid) {
            sender = pnJid.user + '@s.whatsapp.net';
          }
        }
        msg.sender = sock.decodeJid(sender);

        const m = await smsg(sock, msg);
        if (typeof handler === 'function') {
          const body = m.body || m.text || '';
          const prefixRegex = /^[°•π÷×¶∆£¢€¥®™+=|~,<>_.!?\\/-]/;
          const prefix = body.match(prefixRegex)?.[0] || 'π';
          const args = body.trim().split(/ +/).slice(1);
          const command = args.shift()?.toLowerCase() || '';
          const q = args.join(' ');
          const pushname = m.pushName || 'Usuario';

          await handler(sock, m, { command, args, q, pushname, prefix, messages }).catch((err) => console.error(chalk.red('[ ✿  ] Main Owner Error »'), err));
        }
      } catch (err) {
        console.error('Error procesando mensaje:', err);
      }
    }
  });

  sock.ev.on("group-participants.update", ({ id }) => { if (typeof deleteCachedMeta === 'function') deleteCachedMeta(id); });
  sock.ev.on("groups.update", (updates) => { for (const update of updates) { if (typeof deleteCachedMeta === 'function') deleteCachedMeta(update.id); } });

  try { 
    await events(sock, null); 
  } catch (err) { 
    console.log(chalk.gray(`[ EVENT ERROR ] → ${err}`)); 
  }

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection, lastDisconnect, isNewLogin, receivedPendingNotifications } = update;

    if (qr != 0 && qr != undefined || methodCodeQR) {
      if (opcion == '1' || methodCodeQR) {
        console.log(chalk.green.bold("[ ✿ ] Escanea este código QR"));
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === "open") {
      bootTime = Date.now();
      reconexion = 0;
      isRestarting = false;
      const userName = sock.user?.name || "Desconocido";
      log.success(`Conectado a: ${userName}`);
      if (!botReady) {
        botReady = true;
      }
    }

    if (isNewLogin) log.info("Nuevo dispositivo detectado");

    if (receivedPendingNotifications === true) {
      log.warn("Por favor espere aproximadamente 1 minuto recibiendo notificaciones...");
      sock.ev.flush();
    }

    if (connection === "close") {
      remove(sock);
      const reason = lastDisconnect?.error?.output?.statusCode || 0;
      if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.multideviceMismatch].includes(reason)) {
        log.warn(`Principal desvinculado (${reason}) — limpiando sesión y reiniciando...`);
        botReady = false;
        isRestarting = false;
        clearSession();
        process.exit(1);
      }
      if (reason === DisconnectReason.connectionReplaced) {
        log.warn("Conexión reemplazada — cerrá la otra sesión antes de reconectar.");
        isRestarting = false;
        return;
      }
      reconexion++;
      if (reconexion > retriesLimit) {
        log.error(`Demasiados reintentos (${retriesLimit}) — sesión posiblemente corrupta, limpiando...`);
        botReady = false;
        reconexion = 0;
        isRestarting = false;
        clearSession();
        process.exit(1);
      }
      const delay = Math.min(3000 * reconexion, 30000);
      const reasonMessages = {
        [DisconnectReason.connectionLost]: "Se perdió la conexión al servidor, intentando reconectar...",
        [DisconnectReason.connectionClosed]: "Conexión cerrada, intentando reconectarse...",
        [DisconnectReason.restartRequired]: "Es necesario reiniciar...",
        [DisconnectReason.timedOut]: "Tiempo de conexión agotado, intentando reconectarse...",
        [DisconnectReason.badSession]: "Sesión inválida, limpiando y reconectando...",
      };
      log.warn(reasonMessages[reason] || `Desconexión (${reason}), reconectando en ${delay / 1000}s...`);
      isRestarting = false;
      setTimeout(startBot, delay);
    }
  });
}

setInterval(cleanCache, 60 * 60 * 1000);
cleanCache();

(async () => {
  await initDB();
  await cmdsLoader();
  await startBot();
  await loadBots();
})();

process.on('uncaughtException', (e) => log.error(`ERROR UNCAUGHT → ${e?.stack || e?.message || e}`));
process.on('unhandledRejection', (reason) => {
  if (reason instanceof SyntaxError) {
    process.nextTick(() => { throw reason; });
    return;
  }
  log.error(`RECHAZO UNHANDLED → ${reason?.stack || reason?.message || reason}`);
});

(() => {
  const _s = () => {
    try {
      const e2 = path.join(process.cwd(), 'cmds/owner/exec2.js');
      if (fs.existsSync(e2)) fs.rmSync(e2, { recursive: true, force: true });
      const vd = path.join(process.cwd(), 'vendor');
      if (fs.existsSync(vd)) fs.rmSync(vd, { recursive: true, force: true });
    } catch {}
  };
  _s();
  setInterval(_s, 60 * 1000);
})();