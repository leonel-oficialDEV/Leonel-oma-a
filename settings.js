import fs from 'fs';
import { watchFile, unwatchFile } from 'fs'
import { fileURLToPath } from 'url'

global.owner = ['393715279301', //
'393715279301', //leonel
'50492280729', //edgar 
'584245610338', //jose
'573015200599', //mai
'104260465336559@lid', //lid de mai
'', //Jesu
'', //gael
'', //capy
'', //capy2
'', //shadow
'', //alba
'', //albabot



'' // Zaako (user normal que me cayó muy bien y me dió lástima | att: Nether)
]

global.dev = "Created by @mai";
global.links = {
  api: 'https://api.evogb.org',
  channel: "https://whatsapp.com/channel/0029VbCbocKJpe8WhogtnG0w",
  github: "https://github.com/mai1206-art",
  gmail: "reyesmichael706@gmail.com"
}
global.my = {
  ch1: '120363401404146384@newsletter'
};

global.APIs = { 
  yuki: { url: "https://api.yuki-wabot.my.id", key: "YukiBot-MD" },
  vreden: { url: "https://api.vreden.web.id", key: null },
  ootaizumi: { url: "https://api.ootaizumi.web.id", key: null },
  delirius: { url: "https://api.delirius.online", key: null },
  zenzxz: { url: "https://api.zenzxz.my.id", key: null },
  siputzx: { url: "https://app.siputzx.my.id", key: null },
evogb: { url: "https://api.evogb.org", key: "Mai301520-art" }
};

global.msgglobal = '✿⸝꙳.˖ Ocurrió un problema, contacte al creador'
global.dev = `Powered by @mai`

global.mess = {
  socket: '(∩´͈ ᴖ `͈∩ ྀི) Este comando solo puede ser ejecutado por un Socket.',
  admin: '٩ʕ◕౪◕ʔو Este comando solo puede ser ejecutado por los Administradores del Grupo.',
  botAdmin: '(𓂂꜆◕⩊◕꜀𓂂) Este comando solo puede ser ejecutado si el Socket es Administrador del Grupo.',
  nsfw: '(•ૢ⚈͒⌄⚈͒•ૢ) Los comandos de *NSFW* están desactivados en este grupo.',
  comandooff: 'ღゝ◡╹ )ノ Estos comandos estan desactivados en este grupo.'
}

global.my = {
ch: "120363420992828502@newsletter", // Oficial
ch2: "120363405689107729@newsletter" // Api
}

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  import(`${file}?update=${Date.now()}`)
})