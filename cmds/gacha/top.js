function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export default {
  command: ['top'],
  category: 'fun',
  description: 'Top 10 aleatorio',
  group: true,
  run: async ({ msg, sock, args, usedPrefix }) => {
    const text = args.join(' ').trim();
    if (!text) return sock.sendMessage(msg.chat, { text: `Ejemplo de uso:\n${usedPrefix}top guapos` }, { quoted: msg });

    try {
      const metadata = await sock.groupMetadata(msg.chat);
      let ps = metadata.participants.map(v => v.id);

      if (ps.length < 10) {
        return sock.sendMessage(msg.chat, { text: `❗ Necesito al menos 10 personas en el grupo` }, { quoted: msg });
      }

      ps = ps.sort(() => Math.random() - 0.5);
      let [a,b,c,d,e,f,g,h,i,j] = ps.slice(0, 10);

      let x = pickRandom(['🤓','😅','😂','😳','😎','🥵','😱','🤑','🙄','💩','🍑','🤨','🥴','🔥','👇🏻','😔','👀','🌚']);
      let user = jid => '@' + jid.split('@')[0];

      let top = `*${x} Top 10 ${text} ${x}*\n
*1. ${user(a)}*
*2. ${user(b)}*
*3. ${user(c)}*
*4. ${user(d)}*
*5. ${user(e)}*
*6. ${user(f)}*
*7. ${user(g)}*
*8. ${user(h)}*
*9. ${user(i)}*
*10. ${user(j)}*`;

      await sock.sendMessage(msg.chat, {
        text: top,
        mentions: [a, b, c, d, e, f, g, h, i, j]
      }, { quoted: msg });

    } catch (e) {
      await sock.sendMessage(msg.chat, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
};