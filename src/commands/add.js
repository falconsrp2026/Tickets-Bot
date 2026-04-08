import { PermissionFlagsBits, MessageFlags, ContainerBuilder } from "discord.js";

export default {
  name: "add",
  description: "إضافة عضو للتذكرة",
  aliases: ["ad"],

  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply("ليس لديك صلاحيات كافية لتنفيذ الأمر");
    }

    if (!message.channel.name.startsWith("ticket-")) {
      return message.reply("عفواً ، هذا الامر مخصص لتذاكر فقط");
    }

    const targetId = args[0]?.replace(/[<@!>]/g, "");
    if (!targetId) return message.reply("يجب عمل منشن للشخص او إضافة اليوزر ديسكورد الخاص بحسابه");

    try {
      const member = await message.guild.members.fetch(targetId);

      await message.channel.permissionOverwrites.edit(member.user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });

      const addContainer = new ContainerBuilder().addTextDisplayComponents((text) =>
        text.setContent(`✅ تمت إضافة العضو ${member}`)
      );

      return message.channel.send({
        components: [addContainer],
        flags: [MessageFlags.IsComponentsV2],
      });

    } catch (error) {
      console.error(error);
      return message.reply("لم يتم العثور علي الشخص المراد اضافته");
    }
  },
};