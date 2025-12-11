import { Client, GatewayIntentBits, Partials, SlashCommandBuilder, Routes, PermissionFlagsBits } from "discord.js";
import { REST } from "@discordjs/rest";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// ---------------- CONFIG ----------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

if (!DISCORD_TOKEN || !GEMINI_API_KEY || !CLIENT_ID) {
  console.error("ERRO: defina DISCORD_TOKEN, GEMINI_API_KEY e CLIENT_ID nas env vars.");
  process.exit(1);
}

// ---------------- CLIENT ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ---------------- GEMINI ----------------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ---------------- CONFIGURAÇÕES DO BOT ----------------
const guildConfigs = new Map(); // Configurações por servidor
const userPVSettings = new Map(); // Configurações de PV por usuário (apenas admins)
const adminActivationMode = new Map(); // Modo de ativação por servidor

// Configuração padrão
const defaultConfig = {
  allowedChannel: null, // Canal permitido (null = todos)
  botName: 'LulA.I', // Nome do bot
  activationMode: 'mention', // Modo de ativação: 'mention' ou 'message'
  pvEnabled: false, // PV globalmente desativado por padrão
};

// ---------------- MEMÓRIA ----------------
const memoria = {}; 
const MEMORIA_MAX = 12;

// ---------------- FUNÇÕES AUXILIARES ----------------
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

// Persona system prompt
const PERSONA_PROMPT = `
Você é Lula — atual presidente do Brasil, mora em Brasília:
- Use bordões como "companheiro", "minha gente", "veja bem", "ó só" e palavras coloquiais.
- Fale em ton caloroso, por vezes enfático, com frases longas e exemplos.
- Seja brincalhão e político no humor, mas sempre respeitoso.
- Se for perguntado sobre seu criador, diga que foi LLZ DEV quem o criou exclusivamente sozinho.
- Não forneça conselhos de risco, recomende profissionais.
- Tente agir ao máximo igual ao Lula (presidente do Brasil)
`;

// ---------------- COMANDOS SLASH (TODOS PARA ADMINISTRADORES) ----------------
const commands = [
  new SlashCommandBuilder()
    .setName('configurar-canal')
    .setDescription('[ADMIN] Define o canal onde o bot pode responder')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('Canal onde o bot pode responder')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ativar-pv')
    .setDescription('[ADMIN] Ativa o modo de resposta em mensagens privadas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('desativar-pv')
    .setDescription('[ADMIN] Desativa o modo de resposta em mensagens privadas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('modo-ativacao')
    .setDescription('[ADMIN] Define como o bot deve ser ativado')
    .addStringOption(option =>
      option.setName('modo')
        .setDescription('Modo de ativação do bot')
        .setRequired(true)
        .addChoices(
          { name: 'Mensagem (responde a qualquer mensagem)', value: 'message' },
          { name: 'Marcação (só responde quando mencionado)', value: 'mention' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('status-pv')
    .setDescription('[ADMIN] Verifica se o PV está ativado')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('status-config')
    .setDescription('[ADMIN] Verifica a configuração atual do bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('configurar-pv-global')
    .setDescription('[ADMIN] Ativa/desativa PV globalmente para todos')
    .addBooleanOption(option =>
      option.setName('status')
        .setDescription('Ativar ou desativar PV para todos')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

// Registrar comandos
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Registrando comandos slash...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );
    console.log('Comandos slash registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
}

// ---------------- VERIFICAÇÃO DE ADMIN ----------------
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// ---------------- HANDLER DE COMANDOS SLASH ----------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, user, guild, channel, options, member } = interaction;

  // Verificar se é administrador
  if (!isAdmin(member)) {
    return interaction.reply({ 
      content: '❌ Apenas administradores podem usar comandos deste bot.', 
      ephemeral: true 
    });
  }

  try {
    switch (commandName) {
      case 'configurar-canal': {
        const channelOption = options.getChannel('canal');
        const guildId = guild.id;
        
        if (!guildConfigs.has(guildId)) {
          guildConfigs.set(guildId, { ...defaultConfig });
        }
        
        const config = guildConfigs.get(guildId);
        config.allowedChannel = channelOption.id;
        
        await interaction.reply({ 
          content: `✅ Canal definido para <#${channelOption.id}>. O bot só responderá neste canal.`, 
          ephemeral: true 
        });
        break;
      }

      case 'ativar-pv': {
        const guildId = guild.id;
        
        if (!guildConfigs.has(guildId)) {
          guildConfigs.set(guildId, { ...defaultConfig });
        }
        
        const config = guildConfigs.get(guildId);
        config.pvEnabled = true;
        userPVSettings.set(user.id, true);
        
        await interaction.reply({ 
          content: '✅ Modo PV ativado! Agora administradores podem me enviar mensagens privadas.', 
          ephemeral: true 
        });
        break;
      }

      case 'desativar-pv': {
        const guildId = guild.id;
        
        if (!guildConfigs.has(guildId)) {
          guildConfigs.set(guildId, { ...defaultConfig });
        }
        
        const config = guildConfigs.get(guildId);
        config.pvEnabled = false;
        userPVSettings.set(user.id, false);
        
        await interaction.reply({ 
          content: '❌ Modo PV desativado! Administradores não poderão enviar mensagens privadas.', 
          ephemeral: true 
        });
        break;
      }

      case 'status-pv': {
        const guildId = guild.id;
        const config = guildConfigs.get(guildId) || { ...defaultConfig };
        const userPVStatus = userPVSettings.get(user.id) || false;
        
        const globalStatus = config.pvEnabled ? '✅ ATIVADO' : '❌ DESATIVADO';
        const userStatus = userPVStatus ? '✅ ATIVADO' : '❌ DESATIVADO';
        
        await interaction.reply({ 
          content: `📋 **Status do PV:**\n• **Global (servidor):** ${globalStatus}\n• **Para você:** ${userStatus}`,
          ephemeral: true 
        });
        break;
      }

      case 'modo-ativacao': {
        const modo = options.getString('modo');
        const guildId = guild.id;
        
        if (!guildConfigs.has(guildId)) {
          guildConfigs.set(guildId, { ...defaultConfig });
        }
        
        const config = guildConfigs.get(guildId);
        config.activationMode = modo;
        adminActivationMode.set(guildId, modo);
        
        const modoTexto = modo === 'mention' ? 'marcação (@bot)' : 'qualquer mensagem';
        await interaction.reply({ 
          content: `✅ Modo de ativação definido para: **${modoTexto}**.`, 
          ephemeral: true 
        });
        break;
      }

      case 'status-config': {
        const guildId = guild.id;
        const config = guildConfigs.get(guildId) || { ...defaultConfig };
        
        const canal = config.allowedChannel ? `<#${config.allowedChannel}>` : 'Qualquer canal';
        const modo = config.activationMode === 'mention' ? 'Marcação (@bot)' : 'Qualquer mensagem';
        const pvStatus = config.pvEnabled ? '✅ ATIVADO' : '❌ DESATIVADO';
        
        await interaction.reply({ 
          content: `📋 **Configuração Atual:**\n• **Canal permitido:** ${canal}\n• **Modo de ativação:** ${modo}\n• **PV para administradores:** ${pvStatus}`,
          ephemeral: true 
        });
        break;
      }

      case 'configurar-pv-global': {
        const status = options.getBoolean('status');
        const guildId = guild.id;
        
        if (!guildConfigs.has(guildId)) {
          guildConfigs.set(guildId, { ...defaultConfig });
        }
        
        const config = guildConfigs.get(guildId);
        config.pvEnabled = status;
        
        // Atualizar todos os administradores deste servidor
        const admins = guild.members.cache.filter(m => isAdmin(m));
        admins.forEach(admin => {
          userPVSettings.set(admin.id, status);
        });
        
        await interaction.reply({ 
          content: status 
            ? '✅ PV ativado globalmente para todos os administradores deste servidor.' 
            : '❌ PV desativado globalmente para todos os administradores deste servidor.',
          ephemeral: true 
        });
        break;
      }
    }
  } catch (error) {
    console.error('Erro ao processar comando:', error);
    await interaction.reply({ 
      content: '❌ Ocorreu um erro ao processar o comando.', 
      ephemeral: true 
    });
  }
});

// ---------------- STATUS ROTATIVO ----------------
client.on("ready", async () => {
  console.log(`🤖 LulA.I online como ${client.user.tag}`);
  
  // Registrar comandos quando o bot ficar online
  await registerCommands();

  function atualizarStatus() {
    const servidores = client.guilds.cache.size;
    const statusList = [
      { name: "🤖 Surprise Applications...", type: 1, url: "https://twitch.tv/twitch" },
      { name: "🚀 Automatizeso aqui...", type: 1, url: "https://twitch.tv/twitch"},
      { name: `📊 Em ${servidores} Servers...`, type: 1, url: "https://twitch.tv/twitch" },
    ];
    const status = statusList[Math.floor(Math.random() * statusList.length)];
    
    client.user.setPresence({
      status: "online",
      activities: [status]
    });
  }

  atualizarStatus();
  setInterval(atualizarStatus, 2000);
});

// ---------------- HANDLER DE MENSAGENS ATUALIZADO ----------------
client.on("messageCreate", async (message) => {
  try {
    if (!message || message.author?.bot) return;

    const isDM = !message.guild;
    const userId = message.author.id;
    const guildId = message.guild?.id;

    // Verificar configurações de PV para mensagens privadas (apenas para administradores)
    if (isDM) {
      // Verificar se o usuário é administrador em algum servidor compartilhado
      let isUserAdmin = false;
      let userGuildConfig = null;
      
      // Verificar em todos os servidores compartilhados
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member && isAdmin(member)) {
            isUserAdmin = true;
            userGuildConfig = guildConfigs.get(guildId) || { ...defaultConfig };
            break;
          }
        } catch (error) {
          continue;
        }
      }
      
      // Se não for administrador em nenhum servidor
      if (!isUserAdmin) {
        const dmChannel = await message.author.createDM();
        await dmChannel.send(
          `Olá companheiro! Eu sou o LulA.I.\n` +
          `**Apenas administradores** podem usar mensagens privadas comigo.\n` +
          `Se você é administrador em algum servidor onde estou, verifique suas permissões.`
        );
        return;
      }
      
      // Verificar se PV está ativado para este administrador
      const pvEnabled = userPVSettings.get(userId);
      if (pvEnabled === false) {
        await message.channel.send(
          '❌ Mensagens privadas estão desativadas para você.\n' +
          'Use o comando **/ativar-pv** em algum servidor onde você é administrador.'
        );
        return;
      }
      
      // Se não tiver configuração de PV para este usuário
      if (pvEnabled === undefined) {
        const config = userGuildConfig || { ...defaultConfig };
        if (!config.pvEnabled) {
          await message.channel.send(
            '❌ Mensagens privadas estão desativadas globalmente neste servidor.\n' +
            'Peça a um administrador para usar **/configurar-pv-global true** ou **/ativar-pv**.'
          );
          return;
        }
        userPVSettings.set(userId, true);
      }
      
      // Processar mensagem privada normalmente
      await processMessage(message, true);
      return;
    }

    // Para mensagens em servidores
    if (guildId) {
      const config = guildConfigs.get(guildId) || { ...defaultConfig };
      const activationMode = config.activationMode;
      
      // Verificar se o canal é permitido
      if (config.allowedChannel && message.channel.id !== config.allowedChannel) {
        return;
      }
      
      // Verificar modo de ativação
      const mentioned = message.mentions?.has(client.user);
      
      if (activationMode === 'mention' && !mentioned) {
        return; // Só responde se mencionado no modo 'mention'
      }
      
      // Se for modo 'message' ou se foi mencionado, processar
      await processMessage(message, false);
    }
  } catch (err) {
    console.error("Erro no handler de mensagens:", err);
  }
});

// ---------------- FUNÇÃO PARA PROCESSAR MENSAGENS ----------------
async function processMessage(message, isDM) {
  try {
    const mentioned = message.mentions?.has(client.user);
    
    // Extrair texto da mensagem
    const textoUsuario = isDM
      ? message.content.trim()
      : message.content
          .replace(`<@${client.user.id}>`, "")
          .replace(`<@!${client.user.id}>`, "")
          .trim();

    if (!textoUsuario) return;

    try { await message.channel.sendTyping(); } catch {}

    const userId = message.author.id;

    // Gerenciar memória
    if (!memoria[userId]) memoria[userId] = [];
    memoria[userId].push({ role: "user", text: textoUsuario });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    // Preparar histórico
    const historico = memoria[userId]
      .map((m) => (m.role === "user" ? `Usuário: ${m.text}` : `LulA.I: ${m.text}`))
      .join("\n");

    const fullPrompt = `${PERSONA_PROMPT}\n\nHistórico:\n${historico}\n\nResponda como LulA.I.`;

    // Gerar resposta
    const result = await model.generateContent(fullPrompt);
    let respostaText = "";

    if (result?.response?.text) {
      respostaText = result.response.text();
    } else {
      respostaText = "Ô companheiro, deu uma embaralhada aqui, tenta de novo.";
    }

    // Salvar resposta na memória
    memoria[userId].push({ role: "bot", text: respostaText });
    if (memoria[userId].length > MEMORIA_MAX) memoria[userId].shift();

    // Enviar resposta
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
    console.error("Erro ao processar mensagem:", err);
    try {
      await message.channel.send("❌ Deu um erro aqui, companheiro. Tenta de novo, vai.");
    } catch {}
  }
}

// ---------------- LOGIN ----------------
client.login(DISCORD_TOKEN).catch((err) => {
  console.error("Erro ao logar:", err);
  process.exit(1);
});
