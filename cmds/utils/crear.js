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
      return sock.sendMessage(msg.chat, {
        text: `❗ *Por favor ingresa un prompt para crear la imagen.*\n\n*Ejemplo:* ${usedPrefix}crear carros realistas`,
      }, { quoted: msg });
    }

    await sock.sendMessage(msg.chat, { text: `🔨 *SUMI BOT-Ai está creando tu imagen... Por favor espera...*` }, { quoted: msg });

    let filePath = null;
    try {
      await fs.promises.mkdir(TMP_DIR, { recursive: true });
      
      const encodedApiUrl = "aHR0cHM6Ly9lbGlhc2FyLXl0LWFwaS52ZXJjZWwuYXBwL2FwaS9haS90ZXh0MmltZw==";
      const apiUrl = `${Buffer.from(encodedApiUrl, "base64").toString()}?prompt=${encodeURIComponent(text)}`;

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error(`API error ${response.status}`);

      // Algunas veces la API devuelve JSON con url, otras veces la imagen directa
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        const json = await response.json();
        // Si la API devuelve { url: ... } o { image: ... }
        const imageUrl = json.url || json.image || json.result;
        if (!imageUrl) throw new Error('La API no devolvió imagen');
        
        const imgRes = await fetch(imageUrl);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        filePath = path.join(TMP_DIR, `crear_${Date.now()}.jpg`);
        await fs.promises.writeFile(filePath, buffer);
      } else {
        const buffer = Buffer.from(await response.arrayBuffer());
        filePath = path.join(TMP_DIR, `crear_${Date.now()}.jpg`);
        await fs.promises.writeFile(filePath, buffer);
      }

      await sock.sendMessage(msg.chat, {
        image: { url: filePath },
        caption: `🖼️ *Aquí está tu imagen generada por SUMI-Ai:*\n\n*Prompt:* ${text}`,
      }, { quoted: msg });

    } catch (error) {
      console.error("Error crear:", error);
      await sock.sendMessage(msg.chat, { text: `❌ *Error al generar la imagen:*\n${error.message}` }, { quoted: msg });
    } finally {
      if (filePath) fs.promises.unlink(filePath).catch(()=>{});
    }
  }
};