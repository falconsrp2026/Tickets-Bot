import { AttachmentBuilder } from "discord.js";

/**
 * @param {TextChannel} channel
 * @param {Interaction} interaction
 */
export async function generateTextTranscript(channel, interaction) {
  try {
    const fetchedMessages = await channel.messages.fetch({ limit: 100 });

    const transcriptContent = [...fetchedMessages.values()]
      .reverse()
      .map((m) => {
        const time = m.createdAt.toLocaleString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        const author = m.author.tag;

        let content = m.content || "";
        if (m.attachments.size > 0) {
          const attachmentsList = m.attachments
            .map((a) => `[Link: ${a.name}]`)
            .join(" ");
          content += ` ${attachmentsList}`;
        }

        return `[${time}] ${author}: ${content}`;
      })
      .filter((line) => line.trim() !== "")
      .join("\n");

    const fileHeader = `==================================================
        TICKET TRANSCRIPT: ${channel.name.toUpperCase()}
==================================================
صاحب التذكرة    : ${interaction.user.username}
تم الإغلاق بواسطة : ${interaction.user.tag}
تاريخ الأرشفة    : ${new Date().toLocaleString("ar-EG")}
==================================================\n\n`;

    const finalBuffer = Buffer.from(fileHeader + transcriptContent, "utf-8");

    return new AttachmentBuilder(finalBuffer, {
      name: `falcons-rp-${channel.name}.txt`,
    });
  } catch (error) {
    console.error("[Transcript Model Error]:", error);
    return null;
  }
}
