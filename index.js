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
  model: "gemini-2.5-flash"
});

// ========= STATUS DO BOT =========
client.on("clientReady", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "🤖 Surprise Applications...",
        type: 4 // Custom Status
      }
    ]
  });
});

// ========= RESPONDER MENSAGENS =========
client.on("messageCreate", async (message) => {
  // Ignora bots
  if (message.author.bot) return;

  // Verifica se o bot foi marcado
  if (!message.mentions.has(client.user)) return;

  console.log("Mensagem recebida:", message.content);
  console.log("Bot foi mencionado!");

  try {
    // efeito de digitação
    message.channel.sendTyping();

    // Remove a menção do texto
    const pergunta = message.content.replace(`<@${client.user.id}>`, "").trim();

    const resposta = await model.generateContent(pergunta);
    const texto = resposta.response.text();

    // responde como REPLY
    await message.reply(texto);

  } catch (erro) {
    console.error("Erro na Gemini:", erro);
    await message.reply("❌ Ocorreu um erro ao acessar a API do Gemini.");
  }
});

// ========= LOGIN =========
client.login(process.env.TOKEN);
