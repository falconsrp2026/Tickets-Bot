import * as Discord from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  MessageFlags,
} from "discord.js";
import { TicketPanel, Ticket } from "../models/ticketPanel.js";
import { StaffStats } from "../models/staffStats.js";
import { generateTextTranscript } from "../models/ticketLog.js";

function hexToDecimalColor(hex) {
  if (!hex) return Colors.Blurple;
  const cleaned = hex.replace("#", "");
  return parseInt(cleaned, 16);
}

export function createTicketService({ client, logger }) {
  const ticketTopicRegex = /ticket:(\d+):panel:(.+)/;

  async function ensureManagePermission(channel) {
    const me = await channel.guild.members.fetchMe();
    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionsBitField.Flags.ManageChannels)) {
      throw new Error("البوت يحتاج صلاحية ManageChannels في السيرفر");
    }
  }

  function parseTicketTopic(topic) {
    if (!topic) return null;
    const match = topic.match(ticketTopicRegex);
    if (!match) return null;
    return { userId: match[1], panelId: match[2] };
  }

  async function getChannelContext(channel) {
    const meta = parseTicketTopic(channel.topic);
    if (!meta) throw new Error("لا يمكن تحديد مالك التذكرة من إعدادات القناة");
    const panel = await TicketPanel.findById(meta.panelId);
    if (!panel) throw new Error("تعذر العثور على إعداد اللوحة المرتبطة");
    return { ownerId: meta.userId, panel };
  }
  

  async function savePanel(guildId, data) {
    const payload = { ...data };
    if (payload.embedColor && typeof payload.embedColor === "string") {
      payload.embedColor = hexToDecimalColor(payload.embedColor);
    }
    payload.ticketCategoryId = payload.ticketCategoryId || undefined;
    payload.staffRoleIds = Array.isArray(payload.staffRoleIds)
      ? payload.staffRoleIds.filter(Boolean)
      : [];
    payload.menuOptions = Array.isArray(payload.menuOptions)
      ? payload.menuOptions
          .filter((opt) => opt && opt.label && opt.value)
          .map((opt) => {
            const desc =
              typeof opt.description === "string"
                ? opt.description.trim()
                : undefined;
            return {
              label: opt.label.trim(),
              value: opt.value.trim(),
              description: desc ? desc.slice(0, 100) : undefined,
            };
          })
      : [];

    const valueCounts = payload.menuOptions.reduce((acc, o) => {
      acc[o.value] = (acc[o.value] || 0) + 1;
      return acc;
    }, {});
    const duplicates = Object.keys(valueCounts).filter(
      (k) => valueCounts[k] > 1
    );
    if (duplicates.length) {
      throw new Error(
        `قيمة الخيار يجب أن تكون فريدة. القيم المكررة: ${duplicates.join(", ")}`
      );
    }
    if (typeof payload.embedImageUrl === "string") {
      payload.embedImageUrl = payload.embedImageUrl.trim() || undefined;
    }
    if (typeof payload.embedThumbnailUrl === "string") {
      payload.embedThumbnailUrl = payload.embedThumbnailUrl.trim() || undefined;
    }

    if (typeof payload.ticketMessage === "string") {
      payload.ticketMessage = payload.ticketMessage.trim().slice(0, 1024);
    }
    if (typeof payload.selectPlaceholder === "string") {
      const ph = payload.selectPlaceholder.trim();
      payload.selectPlaceholder = ph ? ph.slice(0, 100) : undefined;
    }
    if (typeof payload.panelContent === "string") {
      const pc = payload.panelContent.trim();
      payload.panelContent = pc ? pc.slice(0, 2000) : undefined;
    }

    const setFields = {
      guildId,
      channelId: payload.channelId,
      embedTitle: payload.embedTitle,
      embedDescription: payload.embedDescription,
      embedColor: payload.embedColor,
      staffRoleIds: payload.staffRoleIds,
      menuOptions: payload.menuOptions,
    };
    const unsetFields = {};
    for (const key of [
      "embedImageUrl",
      "embedThumbnailUrl",
      "ticketMessage",
      "selectPlaceholder",
      "panelContent",
      "ticketCategoryId",
      "claimLogChannelId",
      "closeLogChannelId",
    ]) {
      if (payload[key] === undefined) {
        unsetFields[key] = "";
      } else {
        setFields[key] = payload[key];
      }
    }

    const update = Object.keys(unsetFields).length
      ? { $set: setFields, $unset: unsetFields }
      : { $set: setFields };

    const panel = await TicketPanel.findOneAndUpdate({ guildId }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    logger.info?.(
      `[TicketPanel] Saved guild=${guildId}, options=${
        panel.menuOptions.length
      }, roles=${panel.staffRoleIds.length}, category=${
        panel.ticketCategoryId ?? "none"
      }`
    );
    return panel;
  }

  async function postPanel(guildId) {
    const panel = await TicketPanel.findOne({ guildId });
    if (!panel) throw new Error("لا يوجد إعداد للوحة التذاكر");

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(panel.channelId);

    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error("القناة المحددة غير صالحة أو ليست نصية");
    }

    await ensureManagePermission(channel);

    const ticketContainer = new Discord.ContainerBuilder();

    if (panel.embedColor) {
      ticketContainer.setAccentColor(panel.embedColor);
    }

    ticketContainer.addSectionComponents((section) => {
      section.addTextDisplayComponents((text) =>
        text.setContent(`## ${panel.embedTitle}\n${panel.embedDescription}`)
      );

      if (panel.embedThumbnailUrl) {
        section.setThumbnailAccessory((img) =>
          img.setURL(panel.embedThumbnailUrl)
        );
      }

      return section;
    });

    ticketContainer.addSeparatorComponents((separator) => separator);

    if (panel.embedImageUrl) {
      ticketContainer.addMediaGalleryComponents((media) =>
        media.addItems(
          new Discord.MediaGalleryItemBuilder().setURL(panel.embedImageUrl)
        )
      );
    }

    const options = panel.menuOptions.map((opt, idx) => ({
      label: opt.label || `خيار ${idx + 1}`,
      value: opt.value || `option_${idx + 1}`,
      description: opt.description?.slice(0, 100) || undefined,
    }));

    if (options.length > 0) {
      ticketContainer.addActionRowComponents((row) =>
        row.setComponents(
          new Discord.StringSelectMenuBuilder()
            .setCustomId(`ticket-panel:${panel.id}`)
            .setPlaceholder(panel.selectPlaceholder || "اختر نوع التذكرة")
            .addOptions(options)
        )
      );
    }

    const message = await channel.send({
      content: panel.panelContent || null,
      components: [ticketContainer],
      flags: [Discord.MessageFlags.IsComponentsV2],
    });

    panel.messageId = message.id;
    await panel.save();

    return panel;
  }

  async function handleSelectInteraction(interaction) {
    const existingTicket = await Ticket.findOne({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      status: "open",
    });

    if (existingTicket) {
      return interaction.reply({
        content: ` لايمكنك فتح اكثر من تذكرة، لديك تذكرة أخري: <#${existingTicket.channelId}>`,
        ephemeral: true,
      });
    }
    const panelId = interaction.customId.split(":")[1];
    const panel = await TicketPanel.findById(panelId);
    if (!panel) {
      await interaction.reply({
        content: "لوحة التذاكر غير موجودة.",
        flags: 64,
      });
      return;
    }

    const guild = interaction.guild;
    const parentId = panel.ticketCategoryId ?? null;
    const permissionOverwrites = [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      },
      ...(panel.staffRoleIds ?? []).map((roleId) => ({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      })),
    ];

    let ticketChannel;
    try {
      const createOptions = {
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites,
      };
    
      try {
        await TicketPanel.updateOne(
          { guildId: interaction.guild.id },
          { $inc: { totalTicketsOpened: 1 } }
        );
    
        logger.info(
          `تمت إضافة تذكرة أخري للموقع ${interaction.guild.id}`
        );
      } catch (err) {
        logger.error("فشل تحديث العداد:", err);
      }
    
      if (parentId) {
        createOptions.parent = parentId;
      }
            ticketChannel = await guild.channels.create(createOptions);
    } catch (err) {
      await interaction.reply({
        content:
          "تعذر فتح التذكرة. تأكد من صلاحية Manage Channels وصحة التصنيف.",
        flags: 64,
      });
      throw err;
    }

    await Ticket.create({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      channelId: ticketChannel.id,
      panelId: panel.id,
      status: "open",
    });

    await ticketChannel.setTopic(
      `ticket:${interaction.user.id}:panel:${panel.id}`
    );

    const selectedValue = interaction.values[0];
    const matchedOption = (panel.menuOptions || []).find(
      (o) => o.value === selectedValue
    );
    const displayText = matchedOption?.label || selectedValue;

    const staffRoles = panel.staffRoleIds ?? [];
    const staffMentions = staffRoles.map((roleId) => `<@&${roleId}>`).join(" ");
    const userMention = `<@${interaction.user.id}>`;

    await ticketChannel.send({
      content: `${staffMentions}${staffMentions ? " - " : ""}${userMention}`,
      allowedMentions: { roles: staffRoles, users: [interaction.user.id] },
    });

    const ticketContainer = new Discord.ContainerBuilder();
    if (panel.embedColor) ticketContainer.setAccentColor(panel.embedColor);

    ticketContainer.addTextDisplayComponents((text) =>
      text.setContent(
        `## 🎟️ ${displayText}\n${
          panel.ticketMessage ||
          "يرجى وصف مشكلتك وسيقوم الفريق بمساعدتك قريبًا."
        }`
      )
    );

    ticketContainer.addSeparatorComponents((s) => s);

    ticketContainer.addTextDisplayComponents((text) =>
      text.setContent(
        `**صاحب التذكرة:** ${userMention}\n**القسم:** \`${displayText}\``
      )
    );

    ticketContainer.addActionRowComponents((row) => {
      return row.addComponents(
        new Discord.ButtonBuilder()
          .setCustomId("ticket:close")
          .setLabel("اغلاق التذكرة")
          .setEmoji("🔐")
          .setStyle(Discord.ButtonStyle.Danger),
        new Discord.ButtonBuilder()
          .setCustomId("ticket:come")
          .setLabel("استدعاء مالك التذكرة")
          .setEmoji("📣")
          .setStyle(Discord.ButtonStyle.Primary),
        new Discord.ButtonBuilder()
          .setCustomId("ticket:claim")
          .setLabel("استلام التذكرة")
          .setEmoji("✅")
          .setStyle(Discord.ButtonStyle.Success)
      );
    });

    await ticketChannel.send({
      components: [ticketContainer],
      flags: [Discord.MessageFlags.IsComponentsV2],
    });
  }

  function memberHasStaffRole(member, panel) {
    return (panel.staffRoleIds ?? []).some((roleId) =>
      member.roles.cache.has(roleId)
    );
  }

  async function handleTicketButton(interaction) {
    if (
      !["ticket:close", "ticket:come", "ticket:claim"].includes(
        interaction.customId
      )
    )
      return;

    try {
      const channel = interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText) return;

      const { ownerId, panel } = await getChannelContext(channel);
      const isStaff = interaction.member
        ? memberHasStaffRole(interaction.member, panel)
        : false;
      const isOwner = interaction.user.id === ownerId;

      if (!isStaff && !isOwner) {
        return interaction.reply({
          content: "ليس لديك صلاحية لإدارة هذه التذكرة.",
          flags: [Discord.MessageFlags.Ephemeral],
        });
      }

      if (interaction.customId === "ticket:close") {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({
            flags: [Discord.MessageFlags.Ephemeral],
          });
        }

        await Ticket.deleteOne({ channelId: channel.id });

        let attachment = null;
        try {
          const { generateTextTranscript } = await import(
            "../models/ticketLog.js"
          );
          attachment = await generateTextTranscript(channel, interaction);
        } catch (err) {
          logger.error("فشل إنشاء الـ Transcript", err);
        }

        await channel.send(
          `تم إغلاق التذكرة بواسطة <@${interaction.user.id}>.`
        );
        await interaction.editReply({
          content: "سيتم أرشفة المحادثة وحذف التذكرة خلال 5 ثواني",
        });

        try {
          const logId = panel.closeLogChannelId;
          if (logId) {
            const logCh = await channel.guild.channels
              .fetch(logId)
              .catch(() => null);
            if (logCh) {
              await logCh.send({
                content: `**أرشيف تذكرة جديد**\n\n• **الاسم:** \`${channel.name}\`\n• **صاحب التذكرة:** <@${ownerId}>\n• **بواسطة:** <@${interaction.user.id}>`,
                files: attachment ? [attachment] : [],
              });
            }
          }
        } catch (e) {}
        setTimeout(() => {
          channel.delete().catch(() => {});
        }, 5000);
      } else if (interaction.customId === "ticket:come") {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({
            flags: [Discord.MessageFlags.Ephemeral],
          });
        }
        try {
          const user = await interaction.client.users.fetch(ownerId);
          await user.send(
            `⚠️ الطاقم يطلب حضورك فوراً في التذكرة: **${channel.name}**\nرابط التذكرة: ${channel.url}`
          );
          await interaction.editReply({
            content: "🔔 تم إرسال تنبيه للمستخدم في الخاص بنجاح.",
          });
        } catch (error) {
          await interaction.editReply({
            content: "تعذر إرسال رسالة خاصة (المستخدم قافل الخاص).",
          });
        }
      } else if (interaction.customId === "ticket:claim") {
        if (!isStaff)
          return interaction.reply({
            content: "هذه الخاصية مخصصة لطاقم العمل فقط.",
            flags: [Discord.MessageFlags.Ephemeral],
          });

        await interaction.deferUpdate();

        try {
          await Ticket.updateOne(
            { channelId: channel.id },
            { $set: { claimedBy: interaction.user.id } }
          );

          await StaffStats.findOneAndUpdate(
            { guildId: interaction.guild.id, userId: interaction.user.id },
            { $inc: { claimedCount: 1 } },
            { upsert: true }
          );
        } catch (dbErr) {
          logger.error("خطأ في تحديث إحصائيات الاستلام:", dbErr);
        }

        const oldContainerData = interaction.message.components[0].toJSON();

        oldContainerData.components = oldContainerData.components.map(
          (comp) => {
            if (comp.type === 1) {
              comp.components = comp.components.map((button) => {
                if (button.custom_id === "ticket:claim") {
                  return {
                    ...button,
                    disabled: true,
                  };
                }
                return button;
              });
            }
            return comp;
          }
        );

        await interaction.editReply({
          components: [oldContainerData],
          flags: [Discord.MessageFlags.IsComponentsV2],
        });

        await channel.send(`التذكرة مقبولة من قبل: <@${interaction.user.id}>`);

        try {
          const logId = panel.claimLogChannelId;
          if (logId) {
            const logCh = await channel.guild.channels.fetch(logId).catch(() => null);
            if (logCh) {
              await logCh.send({
                content:
                  `**تم استلام تذكرة جديدة**\n\n` +
                  `• **اسم التذكرة:** \`${channel.name}\`\n` +
                  `• **صاحب التذكرة:** <@${ownerId}>\n` +
                  `• **تم الاستلام بواسطة:** <@${interaction.user.id}>`,
              });
            }
          }
        } catch (logErr) {
          logger.error("فشل إرسال لوق الاستلام:", logErr);
        }
      }
    } catch (error) {
      logger.error("خطأ في معالجة أزرار التذكرة:", error);
    }
  }

  return {
    savePanel,
    postPanel,
    handleSelectInteraction,
    handleTicketButton,
  };
}

export const ticketService = createTicketService;
export default ticketService;
