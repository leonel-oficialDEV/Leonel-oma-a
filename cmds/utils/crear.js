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

      // 1. Generar
      const apiUrl = `https://eliasar-yt-api.vercel.app/api/ai/text2img?prompt=${encodeURIComponent(text)}`;
      let res = await fetch(apiUrl);
      let buffer;

      if ((res.headers.get('content-type')||'').includes('json')) {
        const json = await res.json();
        const imgUrl = json.url || json.image || json.result;
        if (!imgUrl) throw new Error('API sin url');
        const imgRes = await fetch(imgUrl);
        buffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        buffer = Buffer.from(await res.arrayBuffer());
      }

      // 2. Subir a catbox con FormData nativo (sin instalar nada)
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', new Blob([buffer], { type: 'image/jpeg' }), 'crear.jpg');

      const uploadRes = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
      const catboxUrl = (await uploadRes.text()).trim();
      
      if (!catboxUrl.startsWith('https://')) throw new Error('Fallo subida: ' + catboxUrl);

      // 3. Mandar como URL, así WhatsApp lo ve bien y no da "imagen no disponible"
      await sock.sendMessage(msg.chat, {
        image: { url: catboxUrl },
        caption: `🖼️ *${text}*`
      }, { quoted: msg });

    } catch (e) {
      console.log(e);
      await sock.sendMessage(msg.chat, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
};