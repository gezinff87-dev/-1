import { Client, GatewayIntentBits, Partials } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// ---------------- CONFIG ----------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error("ERRO: defina DISCORD_TOKEN e GEMINI_API_KEY nas env vars.");
  process.exit(1);
}

// ---------------- CLIENT ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ---------------- GEMINI ----------------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ---------------- MEMÓRIA ----------------
const memoria = {}; 
const MEMORIA_MAX = 12;

// ---------------- AJUDAS ----------------
function dividirMensagem(texto, limite = 1900) {
  if (!texto || typeof texto !== "string") return [];
  const partes = [];
  let i = 0;
  while (i < texto.length) {
    partes.push(texto.slice(i, i + limite));
    i += limite;
  }
  return partes;
}

// ---------------- PERSONA ----------------
const PERSONA_PROMPT = `
Você é Lula — atual presidente do Brasil, mora em Brasília:
- Use bordões como "companheiro", "minha gente", "veja bem", "ó só".
- Humor leve, político e coloquial.
- NÃO diga ser o Lula real; diga ser "LulA.I", uma imitação humorística.
- Siga sempre o estilo de fala típico dele.
`;

// ---------------- STATUS ----------------
client.on("ready", () => {
  console.log(`🤖 LulA.I online como ${client.user.tag}`);

  // Status normais rotativos
  function statusBase() {
    const servidores = client.guilds.cache.size;
    return [
      { name: "🤖 Surprise Applications", type: 1, url: "https://twitch.tv/twitch" },
      { name: "🚀 Automatizeso aqui!...", type: 3 },
      { name: `📊 Em ${servidores} Servers...`, type: 3 }
    ];
  }

  // Status animado (pensando)
  const pensandoAnimacao = ["🤔 Pensando.", "🤔 Pensando..", "🤔 Pensando...", "🤔 Pensando...."];
  let p = 0;

  function atualizarStatus() {
    const base = statusBase();
    const escolhido = base[Math.floor(Math.random() * base.length)];

    client.user.setPresence({
      status: "online",
      activities: [escolhido]
    });
  }

  atualizarStatus();
  setInterval(atualizarStatus, 15000);

  // Animação de pensamento rodando sempre
  setInterval(() => {
    client.user.setPresence({
      status: "online",
      activities: [
        {
          name: pensandoAnimacao[p],
          type: 3 // WATCHING
        }
      ]
    });

    p = (p + 1) % pensandoAnimacao.length;
  }, 2500);
});

// ---------------- HANDLER DE MENSAGENS ----------------
client.on("messageCreate", async (message) => {
  try {
    if (!message || message.author?.bot) return;
    const isDM = !message.guild;
    const mentioned = message.mentions?.has(client.user);

    if (!isDM && !mentioned) return;

    const textoUsuario = isDM
      ? message.content.trim()
      : message.content
          .replace(`<@${client.user.id}>`, "")
          .replace(`<@!${client.user.id}>`, "")
          .trim();

    if (!textoUsuario) return;

    try { await message.channel.sendTyping(); } catch {}

    const userId = message.author.id;
    if (!memoria[userId]) memoria[userId] = [];

    memoria[userId].push({ role: "user", text: textoUsuario });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    const historico = memoria[userId]
      .map(m => (m.role === "user" ? `Usuário: ${m.text}` : `LulA.I: ${m.text}`))
      .join("\n");

    const fullPrompt = `${PERSONA_PROMPT}\n\nHistórico:\n${historico}\n\nResponda como LulA.I.`;

    const result = await model.generateContent(fullPrompt);

    let respostaText = "";
    if (result?.response?.text) respostaText = result.response.text();
    if (!respostaText) respostaText = "Companheiro... não consegui raciocinar direito agora.";

    memoria[userId].push({ role: "bot", text: respostaText });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    const partes = dividirMensagem(respostaText);
    let ultima = message;

    for (const parte of partes) {
      try { await message.channel.sendTyping(); } catch {}

      if (isDM) {
        ultima = await message.channel.send(parte);
      } else {
        ultima = await ultima.reply(parte);
      }
    }
  } catch (err) {
    console.error("Erro no handler:", err);
    try {
      await message.channel.send("❌ Erro ao processar sua mensagem.");
    } catch {}
  }
});

// ---------------- LOGIN ----------------
client.login(DISCORD_TOKEN).catch((err) => {
  console.error("Erro ao logar:", err);
  process.exit(1);
});
