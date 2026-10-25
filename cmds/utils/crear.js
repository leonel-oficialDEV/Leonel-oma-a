import fetch from "node-fetch";
import db from '#db';

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

    await sock.sendMessage(msg.chat, {
      text: `🔨 *SUMI BOT-Ai está creando tu imagen... Por favor espera...*`,
    }, { quoted: msg });

    try {
      const encodedApiUrl = "aHR0cHM6Ly9lbGlhc2FyLXl0LWFwaS52ZXJjZWwuYXBwL2FwaS9haS90ZXh0MmltZw==";
      const apiUrl = `${Buffer.from(encodedApiUrl, "base64").toString()}?prompt=${encodeURIComponent(text)}`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Error en la API: ${response.status} ${response.statusText}`);
      }

      // buffer() ya no funciona en node-fetch v3, usamos arrayBuffer()
      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      await sock.sendMessage(msg.chat, {
        image: imageBuffer,
        caption: `🖼️ *Aquí está tu imagen generada por SUMI-Ai:*\n\n*Prompt:* ${text}`,
      }, { quoted: msg });

    } catch (error) {
      console.error("Error al generar la imagen:", error);
      await sock.sendMessage(msg.chat, {
        text: `❌ *Ocurrió un error al intentar generar la imagen:*\n${error.message || "Error desconocido"}`,
      }, { quoted: msg });
    }
  }
};