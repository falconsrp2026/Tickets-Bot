import { ContainerBuilder, MessageFlags } from "discord.js";
import { Ticket, TicketPanel } from "../models/ticketPanel.js";

export default {
  name: 'info',
  aliases: ['inf'],
  async execute(message, args) {
    const channel = message.channel;
    const guildId = message.guild?.id;

    if (!guildId || !channel.name.startsWith('ticket-')) return;

    try {
      const [ticketData, panelData] = await Promise.all([
        Ticket.findOne({ channelId: channel.id }),
        TicketPanel.findOne({ guildId: guildId })
      ]);

      if (!ticketData) {
        return message.reply({ content: "بيانات التذكرة غير موجودة في القاعدة" });
      }

      const owner = `<@${ticketData.userId}>`;
      const createdAt = `<t:${Math.floor(ticketData.createdAt.getTime() / 1000)}:F>`;
      const claimer = ticketData.claimedBy ? `<@${ticketData.claimedBy}>` : "**غير مستلمة**";

      const infoContainer = new ContainerBuilder()
        .setAccentColor(panelData?.embedColor || null) 
        .addTextDisplayComponents((text) =>
          text.setContent(`# 📑 معلومات التذكرة`)
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((text) =>
          text.setContent(
            `**👤 صاحب التذكرة:** ${owner}\n` +
            `**⏰ تاريخ إنشاء التذكرة:** ${createdAt}\n` +
            `**🛠️ المستلم:** ${claimer}`
          )
        );

      return message.reply({
        components: [infoContainer],
        flags: [MessageFlags.IsComponentsV2]
      });

    } catch (error) {
      console.error("[INFO] Error:", error);
      return message.reply("[INFO] حدث خطأ أثناء جلب معلومات التذكرة");
    }
  }
};