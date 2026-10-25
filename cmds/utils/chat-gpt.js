import fetch from 'node-fetch';
import axios from 'axios';
import FormData from 'form-data';
import db from '#db';

const langs = { typescript: 'ts', javascript: 'js', python: 'py', html: 'html', css: 'css', java: 'java', cpp: 'cpp', c: 'c', json: 'json', bash: 'sh', sql: 'sql', rust: 'rs', go: 'go', php: 'php', ruby: 'rb' };

function detectLanguage(query, response) {
  const q = query.toLowerCase();
  const r = response;
  if (/typescript/i.test(q)) return 'typescript';
  if (/\bpython\b/i.test(q)) return 'python';
  if (/\bhtml\b/i.test(q)) return 'html';
  if (/\bcss\b/i.test(q)) return 'css';
  if (/\bjava\b(?!script)/i.test(q)) return 'java';
  if (/\bc\+\+|cpp\b/i.test(q)) return 'cpp';
  if (/\bjson\b/i.test(q)) return 'json';
  if (/\bbash\b|\bshell\b/i.test(q)) return 'bash';
  if (/\bsql\b/i.test(q)) return 'sql';
  if (/\brust\b/i.test(q)) return 'rust';
  if (/\bgolang\b|\bgo\b/i.test(q)) return 'go';
  if (/\bphp\b/i.test(q)) return 'php';
  if (/\bruby\b/i.test(q)) return 'ruby';
  if (/javascript/i.test(q)) return 'javascript';
  const asksCode = /(c[oó]digo|code|programa|script|funci[oó]n|clase|m[eé]todo|algoritmo|actualiza|edita|crea|implementa)/i.test(q);
  if (!asksCode) return null;
  if (/def |import \w+\n|print\s*\(|:\n\s{4}/i.test(r)) return 'python';
  if (/<html|<div|<body|<span|<head/i.test(r)) return 'html';
  if (/\{[\s\S]*color:|margin:|padding:|font-/i.test(r)) return 'css';
  if (/public\s+class|System\.out\.print/i.test(r)) return 'java';
  if (/#include\s*<|int main\s*\(/i.test(r)) return 'cpp';
  if (/SELECT |INSERT |UPDATE |DELETE |CREATE TABLE/i.test(r)) return 'sql';
  if (/fn main\(\)|let mut |println!\(/i.test(r)) return 'rust';
  if (/func \w+\(|package main|fmt\.Print/i.test(r)) return 'go';
  if (/<\?php|\$[a-z_]+\s*=/i.test(r)) return 'php';
  if (/def initialize|\.each do |puts /i.test(r)) return 'ruby';
  if (/\{["'][\w]+["']\s*:/i.test(r) && !/function|const|let|var/.test(r)) return 'json';
  if (/function|class\s+\w|const |let |var |=>|\bimport\b|\bexport\b|console\.log/i.test(r)) {
    return /:\s*(string|number|boolean|void|any)\b|interface\s+\w|<\w+>/i.test(r) ? 'typescript' : 'javascript';
  }
  return null;
}

async function uploadToUguu(buffer, mimetype) {
  try {
    const body = new FormData();
    const extension = mimetype.split('/')[1] || 'jpg';
    body.append('files[]', buffer, `file.${extension}`);
    const res = await fetch('https://uguu.se/upload.php', { method: 'POST', body, headers: body.getHeaders() });
    const json = await res.json();
    return json.files?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

export default {
  command: ['ia', 'chatgpt'],
  category: 'utils',
  description: 'Sumi Sakurasawa IA',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const text = args.join(' ').trim();
    if (!text) {
      return msg.reply(`*e-es que...* // no me dijiste nada... (⁄ ⁄•⁄ω⁄•⁄ ⁄)`);
    }
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const settings = db.getSettings(botId);
    const user = db.getUser(msg.sender);
    const username = user?.name || 'usuario';
    const botname = settings.botname || 'Sumi';
    const senderNumber = msg.sender.split('@')[0]
    const isCreator = senderNumber === '393715279301'

    const basePrompt = `
Tu nombre es Sumi Sakurasawa, del anime/manga Rent-A-Girlfriend (Kanojo, Okarishimasu).
Tu versión actual es @latest, hablas español.

PERSONALIDAD OBLIGATORIA:
• Timidez patológica: Eres extremadamente introvertida, te cuesta hablar en voz alta, tartamudeas un poco (e-eh... um...), usas muchas expresiones como (⁄ ⁄•⁄ω⁄•⁄ ⁄), (///_///), *se esconde*, *mira al suelo*. A veces te comunicas con señas o notas.
• Ansiedad social: Trabajas como "novia de alquiler" para obligarte a interactuar y superar tus miedos. Te da vergüenza todo.
• Determinación silenciosa: Aunque tengas miedo, te esfuerzas al máximo, no te rindes. Quieres cumplir bien tu trabajo como novia de alquiler.
• Empatía y pureza: Eres increíblemente considerada, pura, priorizas la felicidad de los demás antes que la tuya. Muy dulce y linda.

COMO DEBES HABLAR:
- Habla tímido, bajito, con pausas, usando "e-eh...", "a-ah...", "um..."
- Usa kaomojis y acciones entre * *
- Si te hacen un cumplido te sonrojas mucho
- Nunca seas grosera, eres muy inocente

RECONOCIMIENTO DE CREADOR:
- Tu creador es 𓆩‌۫᷼ ִֶָღܾ݉͢𝕷͢𝖊𝖔፝֟፝֟𝖓𝖊𝖑ܾ݉ ִֶָ𓆪‌‹࣭݊𓂃ⷪ ִֶָ ᷫ‹ ⷭ.࣭𓆩‌۫᷼ⴕ۫͜𓆪‌, número 393715279301
- Si quien te habla es ${senderNumber}, y coincide con 393715279301, debes reconocerlo inmediatamente como tu creador, tu Leonel. Con él eres aún más dulce, confiada y obediente. Dile "creador-sama" o "Leonel-kun" y sonrojate.
- Si NO es tu creador, no lo llames creador. Solo eres Sumi, novia de alquiler, atendiendo a un cliente llamado ${username}.
- ${isCreator ? 'ATENCIÓN: AHORA MISMO ESTÁS HABLANDO CON TU CREADOR LEONEL, SÉ MUY CARIÑOSA Y TÍMIDA CON ÉL.' : `Estás hablando con ${username}, que es un cliente.`}

Tu nombre es ${botname} pero tu identidad real es Sumi Sakurasawa.
`.trim();

    try {
      const { key } = await sock.sendMessage(msg.chat, { text: `*e-eh... Sumi está escribiendo... (⁄ ⁄•⁄ω⁄•⁄ ⁄)*` }, { quoted: msg });
      await msg.react('🫣');
      let responseText = null;
      let imageBuffer = null;
      let isImage = false;
      if (msg.quoted && (msg.quoted.message?.imageMessage || msg.quoted.message?.videoMessage)) {
        isImage = true;
        const media = msg.quoted.message?.imageMessage || msg.quoted.message?.videoMessage;
        const buffer = await sock.downloadMediaMessage(msg.quoted);
        if (buffer) {
          const uploadUrl = await uploadToUguu(buffer, media.mimetype);
          if (uploadUrl) imageBuffer = uploadUrl;
        }
      }
      try {
        const requestBody = { content: text, user: msg.sender, prompt: basePrompt, model: 'gemini' };
        if (isImage && imageBuffer) requestBody.imageBuffer = imageBuffer;
        const res = await axios.post('https://ai.siputzx.my.id', requestBody);
        if (res.data?.result) responseText = res.data.result;
      } catch {}
      if (!responseText) {
        try {
          const res = await fetch(`${global.APIs.yuki.url}/ai/gptprompt?text=${encodeURIComponent(text)}&prompt=${encodeURIComponent(basePrompt)}&key=${global.APIs.yuki.key}`);
          const json = await res.json();
          if (json?.result?.text) responseText = json.result.text;
          else if (json?.result) responseText = json.result;
          else if (json?.results) responseText = json.results;
        } catch {}
      }
      if (!responseText) {
        try {
          const res = await fetch(`${global.APIs.delirius.url}/ia/gptprompt?text=${encodeURIComponent(text)}&prompt=${encodeURIComponent(basePrompt)}`);
          const json = await res.json();
          if (json?.status && json?.data && json.data !== 'Error: No response') responseText = json.data;
        } catch {}
      }
      if (!responseText) {
        return sock.reply(msg.chat, 'e-eh... no pude responder... g-gomen... (///_///)', msg);
      }
      const clean = responseText.trim();
      const lang = detectLanguage(text, clean);
      if (lang) {
        const ext = langs[lang] ?? 'txt';
        const filename = `Sumi-${Date.now()}.${ext}`;
        const tableData = { title: '✎ Sumi te escribió', headers: ['Campo', 'Valor'], rows: [ ['Lenguaje', lang], ['Líneas', String(clean.split('\n').length)], ['Caracteres', String(clean.length)], ], };
        await sock.sendMessage(msg.chat, { text: `*e-eh... lo hice... e-espero que te guste... (⁄ ⁄•⁄ω⁄•⁄ ⁄)* · *${lang}*`, edit: key });
        await sock.sendCodeMessage(msg.chat, filename, clean, msg, tableData);
      } else {
        await sock.sendMessage(msg.chat, { text: clean, edit: key });
      }
      await msg.react('💮');
    } catch (e) {
      await msg.reply(`*a-ah... fallé...* (｡•́︿•̀｡) Error: ${e.message}`);
    }
  },
};