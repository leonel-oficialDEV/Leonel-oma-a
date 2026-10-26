import fetch from "node-fetch";

export default {
  command: ['crear'],
  category: 'ai',
  description: 'Crear imagen con IA',
  run: async ({ msg, sock, args, usedPrefix }) => {
    const text = args.join(' ').trim();
    if (!text) return sock.sendMessage(msg.chat, { text: `❗ Usa: ${usedPrefix}crear un gato` }, { quoted: msg });

    try {
      await sock.sendMessage(msg.chat, { text: `🔨 Generando: ${text}` }, { quoted: msg });

      const apiUrl = `https://eliasar-yt-api.vercel.app/api/ai/text2img?prompt=${encodeURIComponent(text)}`;
      const res = await fetch(apiUrl);
      const json = await res.json();
      
      console.log(json);

      const imageUrl = json.url || json.image || json.result || json.data?.url;

      if (!imageUrl) {
        return sock.sendMessage(msg.chat, { text: `❌ La API no devolvió imagen:\n${JSON.stringify(json).slice(0,500)}` }, { quoted: msg });
      }

      // Mandamos directo la URL que da la API, WhatsApp la descarga sola y no da cuadro negro
      await sock.sendMessage(msg.chat, {
        image: { url: imageUrl },
        caption: `🖼️ *${text}*`
      }, { quoted: msg });

    } catch (e) {
      console.log(e);
      await sock.sendMessage(msg.chat, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
};