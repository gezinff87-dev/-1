import { Client, GatewayIntentBits, Partials } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// -------- CONFIG --------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// MODELO CORRETO — QUALQUER OUTRO MODELO = BOT NÃO RESPONDE
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// -------- CLIENT --------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// -------- MEMÓRIA --------
const memoria = {};
const MEMORIA_MAX = 10;

function dividirMensagem(texto, limite = 1900) {
  const partes = [];
  let i = 0;
  while (i < texto.length) {
    partes.push(texto.slice(i, i + limite));
    i += limite;
  }
  return partes;
}

// -------- STATUS --------
client.on("clientReady", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  const atualizarStatus = () => {
    const servidores = client.guilds.cache.size;

    const statusList = [
      { name: "🤖 Surprise Applications", type: 1, url: "https://twitch.tv/twitch" },
      { name: "🚀 Automatizeso aqui!...", type: 3 },
      { name: `📊 Em ${servidores} Servers...`, type: 3 }
    ];

    const status = statusList[Math.floor(Math.random() * statusList.length)];

    client.user.setPresence({
      status: "online",
      activities: [status],
    });
  };

  atualizarStatus();
  setInterval(atualizarStatus, 15000);
});

// -------- MENSAGENS --------
client.on("messageCreate", async (message) => {
  try {
    if (!message || message.author.bot) return;

    const isDM = !message.guild;
    const mentioned = message.mentions?.has(client.user);

    // DM → sempre responde
    // Servidor → só responde quando marcado
    if (!isDM && !mentioned) return;

    const userId = message.author.id;
    const textoUsuario = isDM
      ? message.content
      : message.content.replace(`<@${client.user.id}>`, "").replace(`<@!${client.user.id}>`, "").trim();

    if (!textoUsuario) return;

    await message.channel.sendTyping();

    if (!memoria[userId]) memoria[userId] = [];
    memoria[userId].push({ role: "user", text: textoUsuario });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    const prompt = memoria[userId]
      .map(m => `${m.role === "user" ? "Usuário" : ""}: ${m.text}`)
      .join("\n");

    const result = await model.generateContent(prompt);
    const resposta = result.response.text();

    memoria[userId].push({ role: "bot", text: resposta });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    const partes = dividirMensagem(resposta);

    let ultima = message;

    for (const parte of partes) {
      await message.channel.sendTyping();

      if (isDM) {
        ultima = await message.channel.send(parte);
      } else {
        ultima = await ultima.reply(parte);
      }
    }

  } catch (e) {
    console.error("Erro:", e);
    try {
      await message.channel.send("❌ Ocorreu um erro ao gerar a resposta.");
    } catch (_) {}
  }
});

client.login(DISCORD_TOKEN);
