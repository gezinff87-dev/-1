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

  const mentioned =
    msg.content.includes(`<@${client.user.id}>`) ||
    msg.content.includes(`<@!${client.user.id}>`);

  if (!mentioned) return;

  const prompt = msg.content
    .replace(`<@${client.user.id}>`, "")
    .replace(`<@!${client.user.id}>`, "")
    .trim();

  const finalPrompt = prompt || "Olá! Como posso ajudar?";

  try {
    await msg.channel.sendTyping();

    const result = await model.generateContent(finalPrompt);
    const texto = result.response.text();
    const partes = dividirMensagem(texto);

    let ultimaMensagem = msg; // começa respondendo o usuário

    for (const parte of partes) {
      await msg.channel.sendTyping();

      // 🔥 Responde sempre a mensagem anterior
      const enviada = await ultimaMensagem.reply(parte);

      // Atualiza para que a próxima resposta responda essa
      ultimaMensagem = enviada;
    }

  } catch (error) {
    console.error("Erro na Gemini:", error);
    msg.reply("❌ Ocorreu um erro ao acessar a API do Gemini.");
  }
});

client.login(process.env.DISCORD_TOKEN);
