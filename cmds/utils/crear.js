import fetch from "node-fetch";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '#db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.resolve(__dirname, '../../tmp');

export default {
  command: ['crear'],
  category: 'ai',
  description: 'Crear imagen con IA',
  run: async ({ msg, sock, args, usedPrefix }) => {
    const text = args.join(' ').trim();
    if (!text) {
      return sock.sendMessage(msg.chat, { text: `❗ *Usa:* ${usedPrefix}crear carros realistas` }, { quoted: msg });
    }

    await sock.sendMessage(msg.chat, { text: `🔨 *Generando...*` }, { quoted: msg });

    try {
      await fs.promises.mkdir(TMP_DIR, { recursive: true });
      
      const encodedApiUrl = "aHR0cHM6Ly9lbGlhc2FyLXl0LWFwaS52ZXJjZWwuYXBwL2FwaS9haS90ZXh0MmltZw==";
      const apiUrl = `${Buffer.from(encodedApiUrl, "base64").toString()}?prompt=${encodeURIComponent(text)}`;

      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`API ${res.status}`);

      let buffer;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const json = await res.json();
        const imageUrl = json.url || json.image || json.result || json.data;
        if (!imageUrl) throw new Error(JSON.stringify(json).slice(0,200));
        const imgRes = await fetch(imageUrl);
        buffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        buffer = Buffer.from(await res.arrayBuffer());
      }

      await sock.sendMessage(msg.chat, {
        image: buffer,
        mimetype: 'image/jpeg',
        caption: `🖼️ *Imagen:* ${text}`,
        fileName: 'imagen.jpg'
      }, { quoted: msg });

    } catch (e) {
      console.error(e);
      await sock.sendMessage(msg.chat, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
};