
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  PermissionFlagsBits, SlashCommandBuilder, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  REST, Routes, Collection, AuditLogEvent,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState,
  StreamType
} = require("@discordjs/voice");

const ytdl = require("@distube/ytdl-core");
const SpotifyWebApi = require("spotify-web-api-node");
const ytSearch = require("yt-search");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────
//  CONFIG — tüm ayarları buradan yapabilirsiniz
// ─────────────────────────────────────────────
const CONFIG = {
  TOKEN: "BOT_TOKEN_BURAYA",
  CLIENT_ID: "1512168521856188537",
  PREFIX: "!",

  // Spotify (opsiyonel)
  SPOTIFY_CLIENT_ID: "ffb86dfb74cd470b968fe66a4e99d6b4",
  SPOTIFY_CLIENT_SECRET: "1fab54ceb12b41b5924a4d9415bc053b",

  // Renkler
  COLORS: {
    PRIMARY: 0x5865f2,
    SUCCESS: 0x57f287,
    ERROR: 0xed4245,
    WARNING: 0xfee75c,
    INFO: 0x00b0f4,
    TICKET: 0x5865f2,
    GUARD: 0xff4444,
    KAYIT: 0x43b581,
    JAIL: 0xff6b35,
    MUSIC: 0x9b59b6,
  },

  // Guard ayarları
  GUARD: {
    MAX_CHANNEL_DELETE: 3,
    MAX_ROLE_DELETE: 3,
    MAX_BAN: 3,
    MAX_KICK: 5,
    TIME_WINDOW: 10000, // ms
    SPAM_LIMIT: 7,
    SPAM_TIME: 5000,
    URL_WHITELIST: ["discord.gg", "discord.com"],
  },
};

// ─────────────────────────────────────────────
//  VERİ DEPOLAMA (JSON tabanlı, DB gerekmez)
// ─────────────────────────────────────────────
const DATA_DIR = "./data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadData(file) {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, "{}");
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); }
  catch { return {}; }
}
function saveData(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// Veri dosyaları
let serverSettings = loadData("settings.json");
let ticketData     = loadData("tickets.json");
let jailData       = loadData("jail.json");
let warnData       = loadData("warns.json");
let nameHistory    = loadData("nameHistory.json");
let guardLogs      = loadData("guardLogs.json");
let whitelist      = loadData("whitelist.json");

// ─────────────────────────────────────────────
//  CLIENT
// ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildAuditLog,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// Müzik kuyruğu (guild bazlı)
const musicQueues = new Map();
// Guard rate-limit takibi
const guardTracker = new Map();
// Spam takibi
const spamTracker = new Map();

// ─────────────────────────────────────────────
//  SLASH KOMUTLAR
// ─────────────────────────────────────────────
const commands = [
  // SETUP
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Sunucu için TRI-VORTEX sistemlerini kur")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // TİCKET
  new SlashCommandBuilder()
    .setName("ticket-kur")
    .setDescription("Ticket sistemini kur")
    .addChannelOption(o => o.setName("kanal").setDescription("Ticket butonunun gönderileceği kanal").setRequired(true))
    .addRoleOption(o => o.setName("yetkili-rol").setDescription("Ticket yetkili rolü").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("ticket-kapat")
    .setDescription("Mevcut ticketi kapat"),

  new SlashCommandBuilder()
    .setName("ticket-sil")
    .setDescription("Mevcut ticket kanalını sil")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // KAYIT
  new SlashCommandBuilder()
    .setName("kayit")
    .setDescription("Üyeyi sunucuya kayıt et")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kayıt edilecek kullanıcı").setRequired(true))
    .addStringOption(o => o.setName("isim").setDescription("Kullanıcının ismi").setRequired(true))
    .addStringOption(o => o.setName("yas").setDescription("Yaş (opsiyonel)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  new SlashCommandBuilder()
    .setName("isim")
    .setDescription("Üyenin ismini değiştir")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .addStringOption(o => o.setName("isim").setDescription("Yeni isim").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  // JAIL
  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Üyeyi jail'e al")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .addStringOption(o => o.setName("sebep").setDescription("Sebep").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("unjail")
    .setDescription("Üyeyi jail'den çıkar")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  // MODERASYON
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Üyeyi banla")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .addStringOption(o => o.setName("sebep").setDescription("Sebep"))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Üyeyi at")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .addStringOption(o => o.setName("sebep").setDescription("Sebep"))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Üyeyi sustur")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .addIntegerOption(o => o.setName("süre").setDescription("Süre (dakika)").setRequired(true))
    .addStringOption(o => o.setName("sebep").setDescription("Sebep"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Üyenin timeout'unu kaldır")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("temizle")
    .setDescription("Mesajları temizle")
    .addIntegerOption(o => o.setName("miktar").setDescription("Silinecek mesaj sayısı (1-100)").setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("uvar")
    .setDescription("Üyeyi uyar")
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı").setRequired(true))
    .addStringOption(o => o.setName("sebep").setDescription("Sebep").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  // MÜZİK
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Müzik çal (YouTube/Spotify)")
    .addStringOption(o => o.setName("sorgu").setDescription("Şarkı adı veya URL").setRequired(true)),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Mevcut şarkıyı geç"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Müziği durdur ve kanaldan çık"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Müzik kuyruğunu göster"),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Müziği duraklat"),

  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Müziği devam ettir"),

  // GUARD
  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Guard whitelist yönetimi")
    .addStringOption(o =>
      o.setName("işlem").setDescription("ekle / çıkar / liste").setRequired(true)
        .addChoices({ name: "ekle", value: "ekle" }, { name: "çıkar", value: "cikar" }, { name: "liste", value: "liste" })
    )
    .addUserOption(o => o.setName("kullanıcı").setDescription("Kullanıcı (ekle/çıkar için)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

// ─────────────────────────────────────────────
//  YARDIMCI FONKSİYONLAR
// ─────────────────────────────────────────────
function getSettings(guildId) {
  if (!serverSettings[guildId]) serverSettings[guildId] = {};
  return serverSettings[guildId];
}
function saveSettings() { saveData("settings.json", serverSettings); }

async function sendLog(guild, type, embed) {
  const s = getSettings(guild.id);
  const logChannelId = s.logs?.[type] || s.logs?.general;
  if (!logChannelId) return;
  const ch = guild.channels.cache.get(logChannelId);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

function errorEmbed(msg) {
  return new EmbedBuilder().setColor(CONFIG.COLORS.ERROR).setDescription(`❌ ${msg}`);
}
function successEmbed(msg) {
  return new EmbedBuilder().setColor(CONFIG.COLORS.SUCCESS).setDescription(`✅ ${msg}`);
}

// ─────────────────────────────────────────────
//  READY
// ─────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`\n╔══════════════════════════════════╗`);
  console.log(`║  TRI-VORTE online: ${client.user.tag}`);
  console.log(`╚══════════════════════════════════╝\n`);

  client.user.setActivity("TRI-VORTEX | /setup", { type: 3 });

  const rest = new REST({ version: "10" }).setToken(CONFIG.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
    console.log("✅ Slash komutlar kaydedildi.");
  } catch (e) {
    console.error("❌ Slash komut hatası:", e);
  }
});

// ─────────────────────────────────────────────
//  INTERACTION HANDLER
// ─────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  // ── Slash Komutlar ──
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // ══ SETUP ══
    if (commandName === "setup") {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;

      try {
        // Kategoriler & kanallar oluştur
        const logCategory = await guild.channels.create({ name: "📋 TRI-VORTEX LOGS", type: ChannelType.GuildCategory });
        const ticketCategory = await guild.channels.create({ name: "🎫 TİCKETLAR", type: ChannelType.GuildCategory });

        const banLog     = await guild.channels.create({ name: "ban-log",     type: ChannelType.GuildText, parent: logCategory });
        const kickLog    = await guild.channels.create({ name: "kick-log",    type: ChannelType.GuildText, parent: logCategory });
        const guardLog   = await guild.channels.create({ name: "guard-log",   type: ChannelType.GuildText, parent: logCategory });
        const kayitLog   = await guild.channels.create({ name: "kayit-log",   type: ChannelType.GuildText, parent: logCategory });
        const jailLog    = await guild.channels.create({ name: "jail-log",    type: ChannelType.GuildText, parent: logCategory });
        const ticketLog  = await guild.channels.create({ name: "ticket-log",  type: ChannelType.GuildText, parent: logCategory });

        // Roller oluştur
        const kayitliRole = await guild.roles.create({ name: "✅ Kayıtlı",  color: 0x43b581, reason: "TRI-VORTEX Setup" });
        const kayitsizRole = await guild.roles.create({ name: "❓ Kayıtsız", color: 0x747f8d, reason: "TRI-VORTEX Setup" });
        const jailRole     = await guild.roles.create({ name: "⛓️ Jail",     color: 0xff6b35, reason: "TRI-VORTEX Setup" });

        serverSettings[guild.id] = {
          logs: {
            ban: banLog.id, kick: kickLog.id, guard: guardLog.id,
            kayit: kayitLog.id, jail: jailLog.id, ticket: ticketLog.id
          },
          roles: {
            kayitli: kayitliRole.id,
            kayitsiz: kayitsizRole.id,
            jail: jailRole.id,
          },
          ticketCategory: ticketCategory.id,
          guard: true,
        };
        saveSettings();

        const embed = new EmbedBuilder()
          .setColor(CONFIG.COLORS.SUCCESS)
          .setTitle("⚙️ TRI-VORTEX Kurulum Tamamlandı")
          .setDescription("Tüm sistem kanalları ve rolleri oluşturuldu!")
          .addFields(
            { name: "📋 Log Kanalları", value: `${banLog} ${kickLog} ${guardLog}\n${kayitLog} ${jailLog} ${ticketLog}`, inline: false },
            { name: "🎭 Roller", value: `${kayitliRole} ${kayitsizRole} ${jailRole}`, inline: false },
          )
          .setTimestamp()
          .setFooter({ text: "TRI-VORTEX" });

        await interaction.editReply({ embeds: [embed] });
      } catch (e) {
        await interaction.editReply({ embeds: [errorEmbed("Kurulum sırasında hata oluştu: " + e.message)] });
      }
    }

    // ══ TİCKET KUR ══
    else if (commandName === "ticket-kur") {
      const kanal = interaction.options.getChannel("kanal");
      const yetkiliRol = interaction.options.getRole("yetkili-rol");
      const s = getSettings(interaction.guild.id);

      s.ticketChannel = kanal.id;
      s.ticketStaffRole = yetkiliRol.id;
      saveSettings();

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.TICKET)
        .setTitle("🎫 Destek Talebi")
        .setDescription("Bir sorunuz mu var? Destek almak için aşağıdaki butona tıklayın.\n\n> Ticketlar yetkili ekibimiz tarafından incelenecektir.")
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({ text: "TRI-VORTEX Ticket Sistemi" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_aç").setLabel("📩 Ticket Aç").setStyle(ButtonStyle.Primary)
      );

      await kanal.send({ embeds: [embed], components: [row] });
      await interaction.reply({ embeds: [successEmbed(`Ticket sistemi ${kanal} kanalına kuruldu!`)], ephemeral: true });
    }

    // ══ TİCKET KAPAT ══
    else if (commandName === "ticket-kapat") {
      const ch = interaction.channel;
      const ticketInfo = ticketData[ch.id];
      if (!ticketInfo) return interaction.reply({ embeds: [errorEmbed("Bu kanal bir ticket değil!")], ephemeral: true });

      // Transcript oluştur
      const messages = await ch.messages.fetch({ limit: 100 });
      let transcript = `=== TRI-VORTEX Ticket Transcript ===\n`;
      transcript += `Ticket: ${ch.name}\nAçan: ${ticketInfo.opener}\nTarih: ${new Date().toLocaleString("tr-TR")}\n\n`;
      messages.reverse().forEach(m => {
        transcript += `[${new Date(m.createdTimestamp).toLocaleString("tr-TR")}] ${m.author.tag}: ${m.content}\n`;
      });

      const transcriptPath = `./data/transcript_${ch.id}.txt`;
      fs.writeFileSync(transcriptPath, transcript);

      const s = getSettings(interaction.guild.id);
      if (s.logs?.ticket) {
        const logCh = interaction.guild.channels.cache.get(s.logs.ticket);
        if (logCh) {
          const logEmbed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.TICKET)
            .setTitle("🎫 Ticket Kapatıldı")
            .addFields(
              { name: "Kanal", value: ch.name },
              { name: "Kapatan", value: interaction.user.tag },
              { name: "Açan", value: ticketInfo.opener },
            )
            .setTimestamp();
          await logCh.send({ embeds: [logEmbed], files: [transcriptPath] });
        }
      }

      // Kanal izinlerini güncelle (görünmez yap)
      const opener = await interaction.guild.members.fetch(ticketInfo.openerId).catch(() => null);
      if (opener) await ch.permissionOverwrites.edit(opener, { ViewChannel: false });

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.WARNING)
        .setDescription("🔒 Bu ticket kapatıldı. Silmek için `/ticket-sil` kullanın.");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_sil_btn").setLabel("🗑️ Kanalı Sil").setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // ══ TİCKET SİL ══
    else if (commandName === "ticket-sil") {
      const ch = interaction.channel;
      if (!ticketData[ch.id]) return interaction.reply({ embeds: [errorEmbed("Bu kanal bir ticket değil!")], ephemeral: true });
      await interaction.reply({ embeds: [successEmbed("Kanal siliniyor...")] });
      delete ticketData[ch.id];
      saveData("tickets.json", ticketData);
      setTimeout(() => ch.delete().catch(() => {}), 2000);
    }

    // ══ KAYIT ══
    else if (commandName === "kayit") {
      const target = interaction.options.getMember("kullanıcı");
      const isim   = interaction.options.getString("isim");
      const yas    = interaction.options.getString("yas") || "";
      const s      = getSettings(interaction.guild.id);

      if (!target) return interaction.reply({ embeds: [errorEmbed("Kullanıcı bulunamadı!")], ephemeral: true });

      const nickname = yas ? `${isim} | ${yas}` : isim;
      await target.setNickname(nickname).catch(() => {});

      if (s.roles?.kayitli)  await target.roles.add(s.roles.kayitli).catch(() => {});
      if (s.roles?.kayitsiz) await target.roles.remove(s.roles.kayitsiz).catch(() => {});

      // İsim geçmişi
      if (!nameHistory[target.id]) nameHistory[target.id] = [];
      nameHistory[target.id].push({ name: nickname, date: Date.now(), by: interaction.user.id });
      saveData("nameHistory.json", nameHistory);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.KAYIT)
        .setTitle("📝 Kayıt Başarılı")
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: "Kullanıcı", value: `${target}`, inline: true },
          { name: "İsim", value: nickname, inline: true },
          { name: "Kaydeden", value: `${interaction.user}`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: "TRI-VORTEX Kayıt" });

      await interaction.reply({ embeds: [embed] });

      // Log
      await sendLog(interaction.guild, "kayit", embed);
    }

    // ══ İSİM ══
    else if (commandName === "isim") {
      const target = interaction.options.getMember("kullanıcı");
      const isim   = interaction.options.getString("isim");

      await target.setNickname(isim).catch(() => {});

      if (!nameHistory[target.id]) nameHistory[target.id] = [];
      nameHistory[target.id].push({ name: isim, date: Date.now(), by: interaction.user.id });
      saveData("nameHistory.json", nameHistory);

      await interaction.reply({ embeds: [successEmbed(`${target} kullanıcısının ismi **${isim}** olarak değiştirildi.`)] });
    }

    // ══ JAIL ══
    else if (commandName === "jail") {
      const target = interaction.options.getMember("kullanıcı");
      const sebep  = interaction.options.getString("sebep");
      const s      = getSettings(interaction.guild.id);

      if (!target) return interaction.reply({ embeds: [errorEmbed("Kullanıcı bulunamadı!")], ephemeral: true });
      if (!s.roles?.jail) return interaction.reply({ embeds: [errorEmbed("Jail rolü ayarlanmamış! `/setup` çalıştırın.")], ephemeral: true });

      // Mevcut rolleri kaydet
      const roles = target.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.id);
      jailData[target.id] = { roles, reason: sebep, by: interaction.user.id, date: Date.now(), guildId: interaction.guild.id };
      saveData("jail.json", jailData);

      // Tüm rolleri kaldır, jail rolü ekle
      await target.roles.set([s.roles.jail]).catch(() => {});
      await target.setNickname(`[JAIL] ${target.user.username}`).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.JAIL)
        .setTitle("⛓️ Kullanıcı Jail'e Alındı")
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: "Kullanıcı", value: `${target}`, inline: true },
          { name: "Yetkili", value: `${interaction.user}`, inline: true },
          { name: "Sebep", value: sebep, inline: false },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, "jail", embed);
    }

    // ══ UNJAIL ══
    else if (commandName === "unjail") {
      const target = interaction.options.getMember("kullanıcı");
      const jailInfo = jailData[target.id];

      if (!jailInfo) return interaction.reply({ embeds: [errorEmbed("Bu kullanıcı jail'de değil!")], ephemeral: true });

      // Önceki rolleri geri ver
      await target.roles.set(jailInfo.roles).catch(() => {});
      await target.setNickname(null).catch(() => {});

      delete jailData[target.id];
      saveData("jail.json", jailData);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.SUCCESS)
        .setTitle("✅ Kullanıcı Jail'den Çıkarıldı")
        .addFields(
          { name: "Kullanıcı", value: `${target}`, inline: true },
          { name: "Çıkaran", value: `${interaction.user}`, inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, "jail", embed);
    }

    // ══ BAN ══
    else if (commandName === "ban") {
      const target = interaction.options.getUser("kullanıcı");
      const sebep  = interaction.options.getString("sebep") || "Sebep belirtilmedi";

      await interaction.guild.members.ban(target, { reason: sebep }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.ERROR)
        .setTitle("🔨 Kullanıcı Banlandı")
        .addFields(
          { name: "Kullanıcı", value: `${target.tag}`, inline: true },
          { name: "Yetkili", value: `${interaction.user.tag}`, inline: true },
          { name: "Sebep", value: sebep },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, "ban", embed);
    }

    // ══ KICK ══
    else if (commandName === "kick") {
      const target = interaction.options.getMember("kullanıcı");
      const sebep  = interaction.options.getString("sebep") || "Sebep belirtilmedi";

      await target.kick(sebep).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.WARNING)
        .setTitle("👢 Kullanıcı Atıldı")
        .addFields(
          { name: "Kullanıcı", value: `${target.user.tag}`, inline: true },
          { name: "Yetkili", value: `${interaction.user.tag}`, inline: true },
          { name: "Sebep", value: sebep },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, "kick", embed);
    }

    // ══ TIMEOUT ══
    else if (commandName === "timeout") {
      const target = interaction.options.getMember("kullanıcı");
      const süre   = interaction.options.getInteger("süre");
      const sebep  = interaction.options.getString("sebep") || "Sebep belirtilmedi";

      await target.timeout(süre * 60 * 1000, sebep).catch(() => {});

      await interaction.reply({ embeds: [successEmbed(`${target} kullanıcısı ${süre} dakika susturuldu. Sebep: ${sebep}`)] });
    }

    // ══ UNTIMEOUT ══
    else if (commandName === "untimeout") {
      const target = interaction.options.getMember("kullanıcı");
      await target.timeout(null).catch(() => {});
      await interaction.reply({ embeds: [successEmbed(`${target} kullanıcısının timeout'u kaldırıldı.`)] });
    }

    // ══ TEMİZLE ══
    else if (commandName === "temizle") {
      const miktar = interaction.options.getInteger("miktar");
      await interaction.channel.bulkDelete(miktar, true).catch(() => {});
      const msg = await interaction.reply({ embeds: [successEmbed(`${miktar} mesaj silindi.`)], fetchReply: true });
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    // ══ UVAR ══
    else if (commandName === "uvar") {
      const target = interaction.options.getUser("kullanıcı");
      const sebep  = interaction.options.getString("sebep");

      if (!warnData[target.id]) warnData[target.id] = [];
      warnData[target.id].push({ reason: sebep, by: interaction.user.id, date: Date.now(), guild: interaction.guild.id });
      saveData("warns.json", warnData);

      const count = warnData[target.id].filter(w => w.guild === interaction.guild.id).length;

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.WARNING)
        .setTitle("⚠️ Uyarı")
        .addFields(
          { name: "Kullanıcı", value: `<@${target.id}>`, inline: true },
          { name: "Toplam Uyarı", value: `${count}`, inline: true },
          { name: "Sebep", value: sebep },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    // ══ WHITELIST ══
    else if (commandName === "whitelist") {
      const işlem = interaction.options.getString("işlem");
      const user  = interaction.options.getUser("kullanıcı");
      const gId   = interaction.guild.id;

      if (!whitelist[gId]) whitelist[gId] = [];

      if (işlem === "ekle" && user) {
        if (!whitelist[gId].includes(user.id)) whitelist[gId].push(user.id);
        saveData("whitelist.json", whitelist);
        await interaction.reply({ embeds: [successEmbed(`${user} guard whitelist'e eklendi.`)] });
      } else if (işlem === "cikar" && user) {
        whitelist[gId] = whitelist[gId].filter(id => id !== user.id);
        saveData("whitelist.json", whitelist);
        await interaction.reply({ embeds: [successEmbed(`${user} guard whitelist'ten çıkarıldı.`)] });
      } else if (işlem === "liste") {
        const list = whitelist[gId].map(id => `<@${id}>`).join("\n") || "Liste boş";
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(CONFIG.COLORS.INFO).setTitle("🛡️ Whitelist").setDescription(list)] });
      }
    }

    // ══ MÜZİK: PLAY ══
    else if (commandName === "play") {
      const sorgu = interaction.options.getString("sorgu");
      const voiceChannel = interaction.member.voice.channel;

      if (!voiceChannel) return interaction.reply({ embeds: [errorEmbed("Önce bir ses kanalına gir!")], ephemeral: true });

      await interaction.deferReply();

      try {
        let videoUrl = sorgu;

        // Spotify link kontrolü
        if (sorgu.includes("spotify.com")) {
          await interaction.editReply({ embeds: [errorEmbed("Spotify linki için şarkı adı YouTube'da aranıyor...")] });
          // Spotify track ID'den isim al (basit)
          const trackName = sorgu.split("/track/")[1]?.split("?")[0] || sorgu;
          const results = await ytSearch(trackName);
          videoUrl = results.videos[0]?.url;
        } else if (!sorgu.includes("youtube.com") && !sorgu.includes("youtu.be")) {
          // Arama sorgusu
          const results = await ytSearch(sorgu);
          if (!results.videos.length) return interaction.editReply({ embeds: [errorEmbed("Şarkı bulunamadı!")] });
          videoUrl = results.videos[0].url;
        }

        if (!musicQueues.has(interaction.guild.id)) {
          musicQueues.set(interaction.guild.id, { queue: [], playing: false, connection: null, player: null });
        }
        const serverQueue = musicQueues.get(interaction.guild.id);

        const info = await ytdl.getInfo(videoUrl);
        const song = {
          title: info.videoDetails.title,
          url: videoUrl,
          duration: info.videoDetails.lengthSeconds,
          thumbnail: info.videoDetails.thumbnails[0]?.url,
          requestedBy: interaction.user.tag,
        };

        serverQueue.queue.push(song);

        if (!serverQueue.playing) {
          // Bağlan ve çal
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
          });
          serverQueue.connection = connection;
          playNext(interaction.guild.id);
        }

        const embed = new EmbedBuilder()
          .setColor(CONFIG.COLORS.MUSIC)
          .setTitle(serverQueue.playing ? "📋 Kuyruğa Eklendi" : "🎵 Şimdi Çalıyor")
          .setDescription(`**[${song.title}](${song.url})**`)
          .addFields(
            { name: "Süre", value: formatDuration(song.duration), inline: true },
            { name: "İsteyen", value: song.requestedBy, inline: true },
            { name: "Kuyruk", value: `${serverQueue.queue.length} şarkı`, inline: true },
          )
          .setThumbnail(song.thumbnail)
          .setFooter({ text: "TRI-VORTEX Müzik" });

        await interaction.editReply({ embeds: [embed] });
      } catch (e) {
        await interaction.editReply({ embeds: [errorEmbed("Şarkı çalınırken hata: " + e.message)] });
      }
    }

    // ══ MÜZİK: SKIP ══
    else if (commandName === "skip") {
      const q = musicQueues.get(interaction.guild.id);
      if (!q || !q.playing) return interaction.reply({ embeds: [errorEmbed("Şu an çalan şarkı yok!")] });
      q.player?.stop();
      await interaction.reply({ embeds: [successEmbed("⏭️ Şarkı geçildi.")] });
    }

    // ══ MÜZİK: STOP ══
    else if (commandName === "stop") {
      const q = musicQueues.get(interaction.guild.id);
      if (q) {
        q.queue = [];
        q.player?.stop();
        q.connection?.destroy();
        musicQueues.delete(interaction.guild.id);
      }
      await interaction.reply({ embeds: [successEmbed("⏹️ Müzik durduruldu ve kanaldan çıkıldı.")] });
    }

    // ══ MÜZİK: QUEUE ══
    else if (commandName === "queue") {
      const q = musicQueues.get(interaction.guild.id);
      if (!q || !q.queue.length) return interaction.reply({ embeds: [errorEmbed("Kuyruk boş!")] });

      const list = q.queue.slice(0, 10).map((s, i) => `**${i + 1}.** [${s.title}](${s.url}) - ${formatDuration(s.duration)}`).join("\n");

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.MUSIC)
        .setTitle("🎵 Müzik Kuyruğu")
        .setDescription(list)
        .setFooter({ text: `Toplam ${q.queue.length} şarkı` });

      await interaction.reply({ embeds: [embed] });
    }

    // ══ MÜZİK: PAUSE ══
    else if (commandName === "pause") {
      const q = musicQueues.get(interaction.guild.id);
      q?.player?.pause();
      await interaction.reply({ embeds: [successEmbed("⏸️ Müzik duraklatıldı.")] });
    }

    // ══ MÜZİK: RESUME ══
    else if (commandName === "resume") {
      const q = musicQueues.get(interaction.guild.id);
      q?.player?.unpause();
      await interaction.reply({ embeds: [successEmbed("▶️ Müzik devam ediyor.")] });
    }
  }

  // ── Button Interactions ──
  else if (interaction.isButton()) {
    // Ticket Aç
    if (interaction.customId === "ticket_aç") {
      const s = getSettings(interaction.guild.id);
      const ticketCategoryId = s.ticketCategory;

      const ticketName = `ticket-${interaction.user.username.toLowerCase().replace(/\s/g, "-")}-${Date.now().toString().slice(-4)}`;
      const staffRoleId = s.ticketStaffRole;

      const permissionOverwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      if (staffRoleId) permissionOverwrites.push({
        id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      });

      const ticketChannel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: ticketCategoryId || null,
        permissionOverwrites,
      });

      ticketData[ticketChannel.id] = { opener: interaction.user.tag, openerId: interaction.user.id, date: Date.now() };
      saveData("tickets.json", ticketData);

      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.TICKET)
        .setTitle("🎫 Ticket Oluşturuldu")
        .setDescription(`Merhaba ${interaction.user}!\n\nYetkili ekibimiz en kısa sürede size yardımcı olacaktır.\n\nTicket'ı kapatmak için \`/ticket-kapat\` komutunu kullanın.`)
        .setTimestamp()
        .setFooter({ text: "TRI-VORTEX Ticket" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_kapat_btn").setLabel("🔒 Ticket Kapat").setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `${interaction.user} ${staffRoleId ? `<@&${staffRoleId}>` : ""}`, embeds: [embed], components: [row] });
      await interaction.reply({ content: `✅ Ticket açıldı: ${ticketChannel}`, ephemeral: true });
    }

    // Ticket Kapat Button
    if (interaction.customId === "ticket_kapat_btn" || interaction.customId === "ticket_sil_btn") {
      const ch = interaction.channel;
      if (interaction.customId === "ticket_sil_btn") {
        delete ticketData[ch.id];
        saveData("tickets.json", ticketData);
        await interaction.reply({ content: "Siliniyor..." });
        setTimeout(() => ch.delete().catch(() => {}), 1500);
      } else {
        await interaction.reply({ embeds: [successEmbed("Ticket kapatılıyor...")], ephemeral: true });
        // Basit kapat
        const opener = ticketData[ch.id];
        if (opener) {
          const m = await interaction.guild.members.fetch(opener.openerId).catch(() => null);
          if (m) await ch.permissionOverwrites.edit(m, { ViewChannel: false });
        }
      }
    }
  }
});

// ─────────────────────────────────────────────
//  MÜZİK YARDIMCI FONKSİYONLARI
// ─────────────────────────────────────────────
function playNext(guildId) {
  const q = musicQueues.get(guildId);
  if (!q || !q.queue.length) {
    if (q) { q.playing = false; q.connection?.destroy(); musicQueues.delete(guildId); }
    return;
  }

  q.playing = true;
  const song = q.queue[0];

  const stream = ytdl(song.url, { filter: "audioonly", quality: "highestaudio", highWaterMark: 1 << 25 });
  const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
  const player = createAudioPlayer();

  q.player = player;
  q.connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    q.queue.shift();
    playNext(guildId);
  });

  player.on("error", (e) => {
    console.error("Müzik hatası:", e);
    q.queue.shift();
    playNext(guildId);
  });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─────────────────────────────────────────────
//  YENİ ÜYE — kayıtsız rolü otomatik ver
// ─────────────────────────────────────────────
client.on("guildMemberAdd", async (member) => {
  const s = getSettings(member.guild.id);
  if (s.roles?.kayitsiz) {
    await member.roles.add(s.roles.kayitsiz).catch(() => {});
  }

  // Hoşgeldin (opsiyonel)
  if (s.welcomeChannel) {
    const ch = member.guild.channels.cache.get(s.welcomeChannel);
    if (ch) {
      const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.PRIMARY)
        .setTitle("👋 Hoş Geldin!")
        .setDescription(`${member} sunucumuza hoş geldin!\nKayıt olmak için yetkililerden yardım iste.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      ch.send({ embeds: [embed] });
    }
  }
});

// ─────────────────────────────────────────────
//  GUARD SİSTEMİ
// ─────────────────────────────────────────────
function isWhitelisted(guildId, userId) {
  return whitelist[guildId]?.includes(userId) || false;
}

function trackGuardEvent(guildId, userId, type) {
  const key = `${guildId}_${userId}_${type}`;
  if (!guardTracker.has(key)) guardTracker.set(key, []);
  const times = guardTracker.get(key);
  const now = Date.now();
  const filtered = times.filter(t => now - t < CONFIG.GUARD.TIME_WINDOW);
  filtered.push(now);
  guardTracker.set(key, filtered);
  return filtered.length;
}

async function guardPunish(guild, userId, reason) {
  try {
    await guild.members.ban(userId, { reason: `[GUARD] ${reason}` });
    const s = getSettings(guild.id);
    if (s.logs?.guard) {
      const ch = guild.channels.cache.get(s.logs.guard);
      if (ch) {
        const embed = new EmbedBuilder()
          .setColor(CONFIG.COLORS.GUARD)
          .setTitle("🛡️ Guard — Otomatik Ban")
          .addFields({ name: "Kullanıcı ID", value: userId }, { name: "Sebep", value: reason })
          .setTimestamp();
        ch.send({ embeds: [embed] });
      }
    }
  } catch (e) { console.error("Guard punish error:", e); }
}

// Kanal silme koruması
client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;
  const s = getSettings(channel.guild.id);
  if (!s.guard) return;

  const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 }).catch(() => null);
  const entry = logs?.entries.first();
  if (!entry) return;
  const executor = entry.executor;
  if (executor.id === client.user.id) return;
  if (isWhitelisted(channel.guild.id, executor.id)) return;

  const count = trackGuardEvent(channel.guild.id, executor.id, "channelDelete");
  if (count >= CONFIG.GUARD.MAX_CHANNEL_DELETE) {
    await guardPunish(channel.guild, executor.id, `${count} kanal sildi`);
  }
});

// Rol silme koruması
client.on("roleDelete", async (role) => {
  const s = getSettings(role.guild.id);
  if (!s.guard) return;

  const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 }).catch(() => null);
  const entry = logs?.entries.first();
  if (!entry) return;
  const executor = entry.executor;
  if (executor.id === client.user.id) return;
  if (isWhitelisted(role.guild.id, executor.id)) return;

  const count = trackGuardEvent(role.guild.id, executor.id, "roleDelete");
  if (count >= CONFIG.GUARD.MAX_ROLE_DELETE) {
    await guardPunish(role.guild, executor.id, `${count} rol sildi`);
  }
});

// Bot ekleme koruması
client.on("guildMemberAdd", async (member) => {
  if (!member.user.bot) return;
  const s = getSettings(member.guild.id);
  if (!s.guard) return;

  const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 }).catch(() => null);
  const entry = logs?.entries.first();
  if (!entry) return;
  const executor = entry.executor;
  if (isWhitelisted(member.guild.id, executor.id)) return;

  await member.kick("Guard: İzinsiz bot eklendi").catch(() => {});
  await guardPunish(member.guild, executor.id, "İzinsiz bot ekledi");
});

// Spam & URL koruması
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  const s = getSettings(message.guild.id);
  if (!s.guard) return;
  if (isWhitelisted(message.guild.id, message.author.id)) return;

  // URL koruması
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = message.content.match(urlRegex) || [];
  for (const url of urls) {
    const allowed = CONFIG.GUARD.URL_WHITELIST.some(d => url.includes(d));
    if (!allowed) {
      await message.delete().catch(() => {});
      const warning = await message.channel.send({ embeds: [errorEmbed(`${message.author} izinsiz link gönderemezsin!`)] });
      setTimeout(() => warning.delete().catch(() => {}), 4000);
      return;
    }
  }

  // Spam koruması
  const key = `${message.guild.id}_${message.author.id}`;
  if (!spamTracker.has(key)) spamTracker.set(key, []);
  const times = spamTracker.get(key);
  const now = Date.now();
  const recent = times.filter(t => now - t < CONFIG.GUARD.SPAM_TIME);
  recent.push(now);
  spamTracker.set(key, recent);

  if (recent.length >= CONFIG.GUARD.SPAM_LIMIT) {
    const member = message.guild.members.cache.get(message.author.id);
    if (member) {
      await member.timeout(5 * 60 * 1000, "Guard: Spam").catch(() => {});
      await message.channel.send({ embeds: [errorEmbed(`${message.author} spam yaptığı için 5 dakika susturuldu.`)] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      spamTracker.delete(key);
    }
  }
});

// ─────────────────────────────────────────────
//  BOT BAŞLAT
// ─────────────────────────────────────────────
client.login(CONFIG.TOKEN);
