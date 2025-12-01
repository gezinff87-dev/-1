import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Inicializa a API Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// Inicializa o bot do Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  // Ignora mensagens de bots
  if (msg.author.bot) return;

  console.log("Mensagem recebida:", msg.content);

  // Verifica se o bot foi mencionado
  const mentioned = msg.content.includes(`<@${client.user.id}>`);

  if (!mentioned) return;

  console.log("Bot foi mencionado!");

  // Remove a menção da mensagem
  const prompt = msg.content
    .replace(`<@${client.user.id}>`, "")
    .replace(`<@!${client.user.id}>`, "") // alguns clientes usam esta forma
    .trim();

  const finalPrompt = prompt || "Olá! Como posso ajudar?";

  try {
    console.log("Enviando para Gemini:", finalPrompt);

    const result = await model.generateContent(finalPrompt);
    const response = result.response.text();

    msg.reply(response);
  } catch (error) {
    console.error("Erro na Gemini:", error);
    msg.reply("❌ Ocorreu um erro ao acessar a API do Gemini.");
  }
});

client.login(process.env.DISCORD_TOKEN);
