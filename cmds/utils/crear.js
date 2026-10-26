import fetch from "node-fetch";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.resolve(__dirname, '../../tmp');

export default {
  command: ['crear'],
  category: 'ai',
  description: 'Crear imagen con IA',
  run: async ({ msg, sock, args, usedPrefix }) => {
    const text = args.join(' ').trim();
    if (!text) return sock.sendMessage(msg.chat, { text: `❗ Usa: ${usedPrefix}crear un gato` }, { quoted: msg });

    const debug = [];
    const log = (t) => debug.push(t);

    try {
      await fs.promises.mkdir(TMP_DIR, { recursive: true });
      
      const apiUrl = `https://eliasar-yt-api.vercel.app/api/ai/text2img?prompt=${encodeURIComponent(text)}`;
      log(`📡 Pidiendo API...`);

      const res = await fetch(apiUrl);
      log(`Status: ${res.status}\nContent-Type: ${res.headers.get('content-type')}`);

      let buffer;
      const cType = res.headers.get('content-type') || '';

      if (cType.includes('application/json')) {
        const json = await res.json();
        log(`JSON: ${JSON.stringify(json).slice(0,500)}`);
        const finalImageUrl = json.url || json.image || json.result;
        if (!finalImageUrl) throw new Error('API no dio url');
        const imgRes = await fetch(finalImageUrl);
        log(`Img Status: ${imgRes.status}`);
        buffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        buffer = Buffer.from(await res.arrayBuffer());
      }

      log(`Buffer: ${buffer.length} bytes`);
      if (buffer.length < 1000) throw new Error('Buffer muy pequeño, API caída');

      const filePath = path.join(TMP_DIR, `crear_${Date.now()}.jpg`);
      await fs.promises.writeFile(filePath, buffer);
      log(`Guardado en tmp`);

      // Intento de envío
      try {
        await sock.sendMessage(msg.chat, { image: { url: filePath }, caption: `🖼️ ${text}` }, { quoted: msg });
        fs.promises.unlink(filePath).catch(()=>{});
        return;
      } catch (e1) {
        log(`❌ Fallo imagen url: ${e1.message}`);
      }

      try {
        await sock.sendMessage(msg.chat, { image: buffer, caption: `🖼️ ${text}` }, { quoted: msg });
        return;
      } catch (e2) {
        log(`❌ Fallo imagen buffer: ${e2.message}`);
      }

      try {
        await sock.sendMessage(msg.chat, { document: buffer, mimetype: 'image/jpeg', fileName: 'imagen.jpg', caption: `🖼️ ${text}` }, { quoted: msg });
        return;
      } catch (e3) {
        log(`❌ Fallo documento: ${e3.message}`);
        throw new Error(e3.message);
      }

    } catch (e) {
      log(`\n💥 ERROR FINAL: ${e.message}`);
      await sock.sendMessage(msg.chat, { text: `*DEBUG CREAR:*\n\n${debug.join('\n')}\n\n${e.stack?.slice(0,500)}` }, { quoted: msg });
    }
  }
};