import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelo universal (garantido funcionar)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("clientReady", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  console.log("Mensagem recebida:", msg.content);

  const mentioned =
    msg.content.includes(`<@${client.user.id}>`) ||
    msg.content.includes(`<@!${client.user.id}>`);

  if (!mentioned) return;

  console.log("Bot foi mencionado!");

  const prompt = msg.content
    .replace(`<@${client.user.id}>`, "")
    .replace(`<@!${client.user.id}>`, "")
    .trim();

  const finalPrompt = prompt || "Olá! Como posso ajudar?";

  try {
    const result = await model.generateContent(finalPrompt);
    msg.reply(result.response.text());
  } catch (error) {
    console.error("Erro na Gemini:", error);
    msg.reply("❌ Ocorreu um erro ao acessar a API do Gemini.");
  }
});

client.login(process.env.DISCORD_TOKEN);
