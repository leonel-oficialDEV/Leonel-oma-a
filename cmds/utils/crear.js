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
      
      let buffer;
      const cType = res.headers.get('content-type') || '';
      if (cType.includes('json')) {
        const json = await res.json();
        const imgUrl = json.url || json.image || json.result;
        const imgRes = await fetch(imgUrl);
        buffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        buffer = Buffer.from(await res.arrayBuffer());
      }

      // LO MANDAMOS COMO IMAGEN NORMAL, SIN VIEWONCE Y COMO JPG
      await sock.sendMessage(msg.chat, {
        image: buffer,
        caption: `🖼️ *${text}*`,
        mimetype: 'image/jpeg'
      }, { quoted: msg });

    } catch (e) {
      // Si falla como imagen, lo manda como documento que SIEMPRE abre
      try {
        const apiUrl = `https://eliasar-yt-api.vercel.app/api/ai/text2img?prompt=${encodeURIComponent(text)}`;
        const res = await fetch(apiUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        await sock.sendMessage(msg.chat, {
          document: buffer,
          mimetype: 'image/jpeg',
          fileName: `${text.slice(0,20)}.jpg`,
          caption: `🖼️ *${text}* (ábrelo, WhatsApp no deja verlo como foto por el formato webp)`
        }, { quoted: msg });
      } catch (e2) {
        await sock.sendMessage(msg.chat, { text: `❌ Error: ${e.message}` }, { quoted: msg });
      }
    }
  }
};