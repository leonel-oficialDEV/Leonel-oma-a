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

      // API 1 - Pollinations gratis sin model (sin 402)
      let imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
      let res = await fetch(imageUrl);
      
      // Si falla, probamos API 2
      if (!res.ok) {
        console.log('Pollinations fallo:', res.status, 'probando respaldo');
        imageUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(text)}`;
        res = await fetch(imageUrl);
      }

      if (!res.ok) throw new Error(`Ambas APIs fallaron: ${res.status}`);
      
      const buffer = Buffer.from(await res.arrayBuffer());
      console.log('Buffer:', buffer.length);

      await sock.sendMessage(msg.chat, {
        image: buffer,
        mimetype: 'image/jpeg',
        caption: `🖼️ *${text}*`
      }, { quoted: msg });

    } catch (e) {
      console.log(e);
      await sock.sendMessage(msg.chat, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
};