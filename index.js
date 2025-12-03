import { Client, GatewayIntentBits, Partials } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// -------- CONFIG --------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error("ERRO: defina DISCORD_TOKEN e GEMINI_API_KEY no .env");
  process.exit(1);
}

// -------- CLIENT DISCORD --------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel],
});

// -------- GEMINI --------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// modelo recomendado (ajuste se precisar)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// -------- MEMÓRIA (em RAM) --------
const memoria = {}; // { userId: [ { role: 'user'|'bot', text }, ... ] }
const MEMORIA_MAX = 10;

// -------- AUX: dividir mensagens longas --------
function dividirMensagem(texto, limite = 1900) {
  const partes = [];
  if (!texto || typeof texto !== "string") return partes;
  let i = 0;
  while (i < texto.length) {
    partes.push(texto.slice(i, i + limite));
    i += limite;
  }
  return partes;
}

// -------- STATUS ROTATIVO (ready event é 'ready' na v14) --------
client.on("ready", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  const atualizarStatus = () => {
    const servidores = client.guilds.cache.size;
    const statusList = [
      { name: "🤖 Surprise Applications", type: 1, url: "https://twitch.tv/twitch" }, // STREAMING
      { name: "🚀 Automatizeso aqui!...", type: 3 }, // WATCHING
      { name: `📊 Em ${servidores} Servers...`, type: 3 } // WATCHING
    ];
    const status = statusList[Math.floor(Math.random() * statusList.length)];
    client.user.setPresence({
      status: "online",
      activities: [status],
    }).catch(err => console.warn("Erro setPresence:", err));
  };

  atualizarStatus();
  setInterval(atualizarStatus, 15000); // 15s
});

// -------- HANDLER DE MENSAGENS --------
client.on("messageCreate", async (message) => {
  try {
    if (message.author?.bot) return;

    // Detecta DM: message.guild === null para DMs
    const isDM = message.guild === null;

    // função que prepara/salva memória e obtém prompt
    const saveAndBuildPrompt = (userId, userText) => {
      if (!memoria[userId]) memoria[userId] = [];
      memoria[userId].push({ role: "user", text: userText });
      if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();
      return memoria[userId]
        .map(m => (m.role === "user" ? `Usuário: ${m.text}` : `Bot: ${m.text}`))
        .join("\n");
    };

    // função que salva bot response
    const pushBotToMemory = (userId, botText) => {
      if (!memoria[userId]) memoria[userId] = [];
      memoria[userId].push({ role: "bot", text: botText });
      if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();
    };

    // prepare userId and raw text
    const userId = message.author.id;
    const rawText = (isDM ? message.content : message.content.replace(`<@${client.user.id}>`, "").replace(`<@!${client.user.id}>`, "")).trim();

    if (!rawText) {
      // opcional: ignora mensagens vazias ou só menção
      return;
    }

    // SERVER: só responde se mencionado
    if (!isDM && !message.mentions.has(client.user)) return;

    // typing indicator
    try { message.channel.sendTyping(); } catch (e) { /* non-fatal */ }

    // monta prompt com memória
    const prompt = saveAndBuildPrompt(userId, rawText);

    // chama Gemini
    const result = await model.generateContent(prompt);

    // extrai texto de forma robusta (algumas libs retornam .response.text() ou .response.text)
    let textoResposta = "";
    if (result?.response) {
      if (typeof result.response.text === "function") {
        textoResposta = result.response.text();
      } else if (typeof result.response.text === "string") {
        textoResposta = result.response.text;
      } else if (typeof result.response === "string") {
        textoResposta = result.response;
      } else {
        textoResposta = JSON.stringify(result.response).slice(0, 8000);
      }
    } else {
      textoResposta = String(result).slice(0, 8000);
    }

    if (!textoResposta) textoResposta = "Desculpe, não consegui gerar uma resposta.";

    // salvar na memória
    pushBotToMemory(userId, textoResposta);

    // dividir e enviar em replies encadeadas
    const partes = dividirMensagem(textoResposta, 1900);
    let ultima = message; // começar respondendo a mensagem original

    for (const parte of partes) {
      // typing antes de cada parte (opcional)
      try { message.channel.sendTyping(); } catch (e) { /* ignore */ }

      // enviar: em DMs podemos usar channel.send; em server vamos reply encadeado
      let enviada;
      if (isDM) {
        enviada = await message.channel.send(parte);
      } else {
        enviada = await ultima.reply(parte);
      }
      ultima = enviada;
    }

  } catch (err) {
    console.error("Erro geral no handler:", err);
    try {
      if (message && !message.replied) {
        await message.reply("❌ Ocorreu um erro ao processar sua mensagem.");
      }
    } catch (e) { /* não explode */ }
  }
});

// -------- LOGIN --------
client.login(DISCORD_TOKEN).catch(err => {
  console.error("Erro ao logar no Discord:", err);
  process.exit(1);
});
