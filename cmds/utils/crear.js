import fetch from "node-fetch";

export default {
  command: ['crear'],
  category: 'ai',
  description: 'Crear imagen con IA',
  run: async ({ msg, sock, args, usedPrefix }) => {
    const text = args.join(' ').trim();
    if (!text) return sock.sendMessage(msg.chat, { text: `❗ Usa: ${usedPrefix}crear un gato realista` }, { quoted: msg });

    try {
      await sock.sendMessage(msg.chat, { text: `🔨 Generando: ${text}` }, { quoted: msg });

      // Pollinations - API estable, no se cae
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&model=flux&seed=${Math.floor(Math.random()*999999)}&nologo=true&enhance=true`;

      // Mandamos directo el link, WhatsApp lo descarga y lo muestra HD sin cuadro negro
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