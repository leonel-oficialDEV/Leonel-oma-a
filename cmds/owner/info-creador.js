const OWNERS = [
  {
    number: '584164137403',
    name: '👑 Staff owner',
    org: '👑 𝕷͢𝖊𝖔፝֟፝֟𝖓𝖊𝖑 👑',
    role: 'Desarrollador',
    email: 'correo@example.com',
    location: 'MX',
    website: 'https://youtube.com/',
    bioJid: '584164137403@s.whatsapp.net'
  },
  {
    number: '50558124470',
    name: '💻 Staff zahpkiel',
    org: 'ⁱᵃᵐzahpkiel𒆜 Sss+',
    role: 'Soporte Técnico',
    email: 'enderjosueasevedotorrez@gmail.com',
    location: 'NI',
    website: 'https://github.com/EnderJs-CreatorGL',
    bioJid: '50558124470@s.whatsapp.net'
  },
  // --- AGREGAS NUEVA PERSONA AQUÍ ---
  // {
  //   number: '51999999999',
  //   name: 'Nuevo Staff',
  //   org: 'Mi equipo',
  //   role: 'Moderador',
  //   email: 'nuevo@ejemplo.com',
  //   location: 'PE',
  //   website: 'https://github.com',
  //   bioJid: '51999999999@s.whatsapp.net'
  // },
]

async function sendContactArray(sock, jid, data, quoted) {
    let contacts = []
    for (let [number, name, isi, isi1, isi2, isi3, isi4, isi5] of data) {
        number = number.replace(/[^0-9]/g, '')
        let vcard = `BEGIN:VCARD
VERSION:3.0
N:${name};;;
FN:${name}
ORG:${isi}
TEL;type=CELL;type=VOICE;waid=${number}:+${number}
X-ABLabel:${isi1}
EMAIL;type=INTERNET:${isi2}
X-ABLabel:Email
ADR:;;${isi3};;;;
X-ABLabel:Ubicacion
URL:${isi4}
X-ABLabel:Website
NOTE:${isi5}
END:VCARD`.trim()
        contacts.push({ vcard, displayName: name })
    }
    return await sock.sendMessage(jid, {
        contacts: {
            displayName: `${contacts.length} contactos`,
            contacts,
        }
    }, { quoted })
}

export default {
  command: ['owner', 'creador'],
  category: 'info',
  run: async ({ sock, msg }) => {
    const chatId = msg.chat
    try {
        let contactsData = []
        for (let owner of OWNERS) {
            let bio = await sock.fetchStatus(owner.bioJid).catch(() => ({ status: 'Sin Biografía' }))
            contactsData.push([
                owner.number,
                owner.name,
                owner.org,
                owner.role,
                owner.email,
                owner.location,
                owner.website,
                bio.status?.toString() || 'Sin Biografía'
            ])
        }

        let botNumber = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        let botBio = await sock.fetchStatus(`${botNumber}@s.whatsapp.net`).catch(() => ({ status: 'Sin Biografía' }))
        contactsData.push([
            botNumber,
            '🌸 Es el Bot',
            'Bot Oficial',
            '📵 No Hacer Spam',
            'bot@ejemplo.com',
            'MX',
            'https://github.com',
            botBio.status?.toString() || 'Sin Biografía'
        ])

        await sendContactArray(sock, chatId, contactsData, msg)
    } catch (e) {
        console.log(e)
        await sock.sendMessage(chatId, { text: `Error: ${e.message}` }, { quoted: msg })
    }
  }
}