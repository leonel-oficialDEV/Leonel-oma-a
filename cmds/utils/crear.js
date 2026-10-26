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

      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&model=flux&seed=${Math.floor(Math.random()*999999)}&nologo=true`;

      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Pollinations ${res.status}`);
      
      const buffer = Buffer.from(await res.arrayBuffer());

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