import { Client, GatewayIntentBits, Partials } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// ========= CONFIGURAÇÃO DISCORD =========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ========= CONFIGURAÇÃO GEMINI =========
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest"
});

// ========= MEMÓRIA POR USUÁRIO =========
const memoria = {}; // { userId: [ {role, text}, ... ] }


// ========= STATUS ROTATIVO =========
client.on("clientReady", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  function atualizarStatus() {
    const servidores = client.guilds.cache.size;

    const statusList = [
      {
        name: "🤖 Surprise Applications",
        type: 1, // STREAMING
        url: "https://twitch.tv/twitch"
      },
      {
        name: "🚀 Automatizeso aqui!...",
        type: 3 // WATCHING
      },
      {
        name: `📊 Em ${servidores} Servers...`,
        type: 3 // WATCHING
      }
    ];

    const status =
      statusList[Math.floor(Math.random() * statusList.length)];

    client.user.setPresence({
      status: "online",
      activities: [status]
    });
  }

  atualizarStatus();
  setInterval(atualizarStatus, 15000); // Atualiza a cada 15 segundos
});


// ========= RESPOSTA AO USUÁRIO =========
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // só responde quando mencionado
  if (!message.mentions.has(client.user)) return;

  message.channel.sendTyping();

  const userId = message.author.id;

  // cria memória automaticamente
  if (!memoria[userId]) memoria[userId] = [];

  const pergunta = message.content.replace(`<@${client.user.id}>`, "").trim();

  // salva pergunta na memória
  memoria[userId].push({
    role: "user",
    text: pergunta
  });

  // manter memória pequena (10 mensagens)
  if (memoria[userId].length > 10) memoria[userId].shift();

  try {
    const prompt = memoria[userId]
      .map(m => (m.role === "user" ? `Usuário: ${m.text}` : `Bot: ${m.text}`))
      .join("\n");

    const resposta = await model.generateContent(prompt);
    const texto = resposta.response.text();

    // salva resposta na memória
    memoria[userId].push({
      role: "bot",
      text: texto
    });

    // responde como reply
    await message.reply(texto);

  } catch (error) {
    console.error("Erro na Gemini:", error);
    await message.reply("❌ Ocorreu um erro ao acessar a API do Gemini.");
  }
});


// ========= LOGIN =========
client.login(process.env.TOKEN);
