import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Função para dividir mensagens longas
function dividirMensagem(texto, limite = 1900) {
  const partes = [];
  while (texto.length > 0) {
    partes.push(texto.slice(0, limite));
    texto = texto.slice(limite);
  }
  return partes;
}

client.on("clientReady", () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  console.log("Mensagem recebida:", msg.content);

  // Verifica se foi mencionado
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
    const texto = result.response.text();

    const partes = dividirMensagem(texto);

    for (const parte of partes) {
      await msg.reply(parte);
    }

  } catch (error) {
    console.error("Erro na Gemini:", error);
    msg.reply("❌ Ocorreu um erro ao acessar a API do Gemini.");
  }
});

client.login(process.env.DISCORD_TOKEN);
