import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Inicializa Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Inicializa o bot Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  // Ignorar mensagens do próprio bot
  if (msg.author.bot) return;

  // Só responde mensagens que começam com "!"
  if (!msg.content.startsWith("!")) return;

  try {
    const userMessage = msg.content.slice(1); // remove "!"

    const result = await model.generateContent(userMessage);
    const response = result.response.text();

    msg.reply(response);
  } catch (error) {
    console.error(error);
    msg.reply("❌ Ocorreu um erro ao falar com o Gemini.");
  }
});

client.login(process.env.DISCORD_TOKEN);