async function getPpBuffer(sock, jid) {
  try {
    let url = await sock.profilePictureUrl(jid, 'image').catch(() => null)
    if (!url) return null
    const res = await fetch(url)
    return Buffer.from(await res.arrayBuffer())
  } catch { return null }
}

export default {
  command: ['owner', 'creador'],
  category: 'info',
  run: async ({ sock, msg }) => {
    const chatId = msg.chat
    try {
        const ownerNumber = '393715279301'
        const ownerJid = '393715279301@s.whatsapp.net'
        const ownerName = 'ī.am/𝕷͢𝖊𝖔፝֟፝֟𝖓𝖊𝖑ܾ݉ ִֶָ‹࣭݊𓂃ⷪ ִֶָ ᷫ‹ ⷭ.𓆩‌۫᷼Ⴕ۫͜𓆪‌'
        
        let bio = await sock.fetchStatus(ownerJid).catch(() => ({ status: 'Sin Biografía' }))
        let ppBuf = await getPpBuffer(sock, ownerJid)
        let ppBase64 = ppBuf ? ppBuf.toString('base64') : ''
        let photoLine = ppBase64 ? `PHOTO;BASE64:${ppBase64}\n` : ''

        let vcard = `BEGIN:VCARD
VERSION:3.0
N:${ownerName};;;
FN:${ownerName}
ORG:Owner Principal
${photoLine}TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}
X-ABLabel:Owner
NOTE:${bio.status?.toString() || 'Sin Biografía'}
END:VCARD`.trim()

        if (ppBuf) {
          try {
            await sock.sendMessage(chatId, { 
              image: ppBuf, 
              caption: `👑 *${ownerName}*\n📱 +${ownerNumber}\n\n> Owner del Bot` 
            }, { quoted: msg })
          } catch {}
        }

        await sock.sendMessage(chatId, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard, displayName: ownerName }],
            }
        }, { quoted: msg })

    } catch (e) {
        console.log(e)
        await sock.sendMessage(chatId, { text: `Error: ${e.message}` }, { quoted: msg })
    }
  }
}