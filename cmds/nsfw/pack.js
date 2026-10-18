const handler = async (m, { conn, command, usedPrefix }) => {
  // Verificación segura de la base de datos
  const chat = global.db?.data?.chats?.[m.chat];
  if (chat && !chat.nsfw && m.isGroup) {
    return m.reply('🚩 *¡Estos comandos están desactivados en este grupo!*');
  }

  try {
    switch (command) {
      case 'pack': {
        const url = global.pack[Math.floor(Math.random() * global.pack.length)];
        await conn.sendMessage(m.chat, {
          image: { url: url },
          caption: `*🥵 Pack 🥵*`,
          viewOnce: true
        }, { quoted: m });
        break;
      }

      case 'pack2': {
        const url2 = global.packgirl[Math.floor(Math.random() * global.packgirl.length)];
        await conn.sendMessage(m.chat, {
          image: { url: url2 },
          caption: `*🥵 Pack 2 🥵*`,
          viewOnce: true
        }, { quoted: m });
        break;
      }

      case 'pack3': {
        const url3 = global.packmen[Math.floor(Math.random() * global.packmen.length)];
        await conn.sendMessage(m.chat, {
          image: { url: url3 },
          caption: `*🥵 Pack 3 🥵*`,
          viewOnce: true
        }, { quoted: m });
        break;
      }

      case 'videoxxx':
      case 'vídeoxxx': {
        const url4 = global.videosxxxc[Math.floor(Math.random() * global.videosxxxc.length)];
        await conn.sendMessage(m.chat, {
          video: { url: url4 },
          caption: `*ᴅɪsғʀᴜᴛᴀ ᴅᴇʟ ᴠɪᴅᴇᴏ 🥵*`,
          viewOnce: true
        }, { quoted: m });
        break;
      }

      case 'videoxxxlesbi':
      case 'videolesbixxx':
      case 'pornolesbivid':
      case 'pornolesbianavid':
      case 'pornolesbiv':
      case 'pornolesbianav':
      case 'pornolesv': {
        const url5 = global.videosxxxc2[Math.floor(Math.random() * global.videosxxxc2.length)];
        await conn.sendMessage(m.chat, {
          video: { url: url5 },
          caption: `*ᴅɪsғʀᴜᴛᴀ ᴅᴇʟ ᴠɪᴅᴇᴏ 🥵*`,
          viewOnce: true
        }, { quoted: m });
        break;
      }
    }
  } catch (error) {
    console.error(error);
    m.reply('❌ *Ocurrió un error al enviar el archivo. Es muy probable que el enlace esté caído.*');
  }
};

handler.help = ['pack', 'pack2', 'pack3', 'videoxxx', 'videoxxxlesbi'];
handler.command = ['pack', 'pack2', 'pack3', 'videoxxx', 'vídeoxxx', 'videoxxxlesbi', 'videolesbixxx', 'pornolesbivid', 'pornolesbianavid', 'pornolesbiv', 'pornolesbianav', 'pornolesv'];
handler.tags = ['nsfw'];

// Solución al error cmdData.run is not a function:
handler.run = handler;

export default handler;

// (Aquí debajo mantén todas tus listas de global.pack, global.packgirl, etc. tal como estaban)