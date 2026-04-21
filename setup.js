import { PermissionFlagsBits } from "discord.js";

function extractId(raw) {
  if (!raw) return "";
  return String(raw).replace(/[<@#&!>]/g, "").trim();
}

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

async function ask(message, prompt, { timeoutMs = 120000 } = {}) {
  await message.channel.send(prompt);
  const collected = await message.channel.awaitMessages({
    filter: (m) => m.author.id === message.author.id,
    max: 1,
    time: timeoutMs,
  });
  const first = collected.first();
  return first ? String(first.content || "").trim() : "";
}

export default {
  name: "setup",
  aliases: ["wizard"],
  description: "إعداد سريع للوحة التذاكر (Wizard)",

  async execute(message, args, { ticketService } = {}) {
    if (!ticketService) {
      return message.reply("Internal error: ticketService is missing.");
    }

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply("هذا الأمر يحتاج صلاحية Administrator.");
    }

    const guildId = message.guild?.id;
    if (!guildId) return message.reply("هذا الأمر يعمل داخل سيرفر فقط.");

    await message.reply(
      "هنجهز لوحة التذاكر خطوة بخطوة. تقدر تكتب `cancel` في أي وقت للإلغاء."
    );

    const channelRaw = await ask(
      message,
      "1) منشن قناة نشر اللوحة (مثال: #tickets) أو اكتب ID القناة:"
    );
    if (!channelRaw || channelRaw.toLowerCase() === "cancel") return;
    const channelId = extractId(channelRaw);

    const rolesRaw = await ask(
      message,
      "2) منشن رتبة/رتب الستاف (مثال: @Support @Admin) أو اكتب IDs مفصولة بمسافة:"
    );
    if (!rolesRaw || rolesRaw.toLowerCase() === "cancel") return;
    const staffRoleIds = rolesRaw
      .split(/\s+/)
      .map(extractId)
      .filter(Boolean);

    const categoryRaw = await ask(
      message,
      "3) منشن Category للتذاكر أو اكتب `skip`:"
    );
    if (!categoryRaw || categoryRaw.toLowerCase() === "cancel") return;
    const ticketCategoryId =
      categoryRaw.toLowerCase() === "skip" ? undefined : extractId(categoryRaw);

    const claimLogRaw = await ask(
      message,
      "4) (اختياري) منشن قناة لوج الاستلام (Claim log) أو اكتب `skip`:"
    );
    if (!claimLogRaw || claimLogRaw.toLowerCase() === "cancel") return;
    const claimLogChannelId =
      claimLogRaw.toLowerCase() === "skip" ? undefined : extractId(claimLogRaw);

    const closeLogRaw = await ask(
      message,
      "5) (اختياري) منشن قناة لوج الإغلاق (Close log) أو اكتب `skip`:"
    );
    if (!closeLogRaw || closeLogRaw.toLowerCase() === "cancel") return;
    const closeLogChannelId =
      closeLogRaw.toLowerCase() === "skip" ? undefined : extractId(closeLogRaw);

    const embedTitle =
      (await ask(message, "6) اكتب عنوان اللوحة:")) || "نظام التذاكر";
    if (embedTitle.toLowerCase() === "cancel") return;

    const embedDescription =
      (await ask(message, "7) اكتب وصف اللوحة:")) ||
      "اختر القسم المناسب من القائمة لفتح تذكرة.";
    if (embedDescription.toLowerCase() === "cancel") return;

    await message.channel.send(
      "8) اكتب خيارات القائمة (كل سطر بالشكل: `العنوان | الوصف`).\nاكتب `done` لما تخلص."
    );

    const menuOptions = [];
    const usedValues = new Set();
    while (menuOptions.length < 25) {
      const line = await ask(message, "اكتب خيار أو `done`:", { timeoutMs: 180000 });
      if (!line) break;
      if (line.toLowerCase() === "cancel") return;
      if (line.toLowerCase() === "done") break;

      const parts = line.split("|").map((p) => p.trim());
      const label = parts[0];
      const description = parts.slice(1).join(" | ").trim();
      if (!label) continue;

      let value = slugify(label) || `option_${menuOptions.length + 1}`;
      let i = 2;
      while (usedValues.has(value)) value = `${value}_${i++}`;
      usedValues.add(value);

      menuOptions.push({
        label,
        value,
        description: description || undefined,
      });
    }

    if (menuOptions.length === 0) {
      menuOptions.push({
        label: "الدعم الفني",
        value: "support",
        description: "فتح تذكرة للدعم الفني",
      });
    }

    try {
      await ticketService.savePanel(guildId, {
        channelId,
        ticketCategoryId,
        claimLogChannelId,
        closeLogChannelId,
        staffRoleIds,
        embedTitle,
        embedDescription,
        embedColor: "#5865f2",
        selectPlaceholder: "اختر نوع التذكرة",
        ticketMessage: "يرجى وصف مشكلتك وسيقوم الفريق بمساعدتك قريبًا.",
        menuOptions,
      });

      await ticketService.postPanel(guildId);
      return message.reply("تم حفظ الإعدادات ونشر لوحة التذاكر بنجاح.");
    } catch (err) {
      return message.reply(`فشل الإعداد: ${err?.message || err}`);
    }
  },
};

