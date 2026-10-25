const handler = async (m, {conn, command}) => {
  if (!db.data.chats[m.chat].nsfw && m.isGroup) throw '🚩 *¡Estos comandos están desactivados!*';

  const distinct = (arr, n) => {
    let unique = [...new Set(arr)];
    return unique.sort(() => Math.random() - 0.5).slice(0, Math.min(n, unique.length));
  };

   switch (command) {
    case 'pack':
      for (let url of distinct(global.pack, 5)) {
        await conn.sendMessage(m.chat, { image: { url }, caption: `*🥵 Pack 🥵*` }, { quoted: m });
      }
      break;
    case 'pack2':
      for (let url of distinct(global.packgirl, 5)) {
        await conn.sendMessage(m.chat, { image: { url }, caption: `*🥵 Pack 2 🥵*` }, { quoted: m });
      }
      break;
    case 'pack3':
      for (let url of distinct(global.packmen, 5)) {
        await conn.sendMessage(m.chat, { image: { url }, caption: `*🥵 Pack 3 🥵*` }, { quoted: m });
      }
      break;
    case 'videoxxx': case 'vídeoxxx':
      for (let url of distinct(global.videosxxxc, 3)) {
        await conn.sendMessage(m.chat, { video: { url }, caption: `*ᴅɪsғʀᴜᴛᴀ ᴅᴇʟ ᴠɪᴅᴇᴏ 🥵*` }, { quoted: m });
      }
      break;
    case 'videoxxxlesbi': case 'videolesbixxx': case 'pornolesbivid': case 'pornolesbianavid': case 'pornolesbiv': case 'pornolesbianav': case 'pornolesv':
      for (let url of distinct(global.videosxxxc2, 3)) {
        await conn.sendMessage(m.chat, { video: { url }, caption: `*ᴅɪsғʀᴜᴛᴀ ᴅᴇʟ ᴠɪᴅᴇᴏ 🥵*` }, { quoted: m });
      }
      break;
  }
};
handler.help = ['pack', 'pack2', 'pack3', 'videoxxx'];
handler.command = ['pack', 'pack2', 'pack3', 'videoxxx', 'vídeoxxx', 'videoxxxlesbi', 'videolesbixxx', 'pornolesbivid', 'pornolesbianavid', 'pornolesbiv', 'pornolesbianav', 'pornolesv'];
handler.tags = ['nsfw'];
export default handler;

global.pack = [
  'https://telegra.ph/file/957fe4031132ef90b66ec.jpg',
  'https://telegra.ph/file/c4b85bd53030cb648382f.jpg',
  'https://telegra.ph/file/df56f8a76145df9c923ad.jpg',
  'https://telegra.ph/file/d5d1c2c710c4b5ee8bc6c.jpg',
  'https://telegra.ph/file/d0c0cd47e87535373ab68.jpg',
];
global.packgirl = [
  'https://telegra.ph/file/c0da7289bee2d97048feb.jpg',
  'https://telegra.ph/file/b8564166f9cac4d843db3.jpg',
  'https://telegra.ph/file/fdefd621a17712be15e0e.jpg',
];
global.packmen = [
  'https://telegra.ph/file/bf303b19b9834f90e9617.jpg',
  'https://telegra.ph/file/36ef2b807251dfccd17c2.jpg',
];
global.videosxxxc = [
  'https://telegra.ph/file/4a270d9945ac46f42d95c.mp4',
  'https://telegra.ph/file/958c11e84d271e783ea3f.mp4',
  'https://telegra.ph/file/f753759342337c4012b3f.mp4',
];
global.videosxxxc2 = [
"https://telegra.ph/file/2dfb1ad0cab22951e30d1.mp4",
"https://telegra.ph/file/c430651857023968d3a76.mp4",
"https://telegra.ph/file/1ba17f6230dd1ea2de48c.mp4",
];