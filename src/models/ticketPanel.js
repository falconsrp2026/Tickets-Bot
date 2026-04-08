import mongoose from "mongoose";

const menuOptionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const ticketPanelSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String },

    embedTitle: { type: String, required: true },
    embedDescription: { type: String, required: true },
    embedColor: { type: Number, default: 0x5865f2 },

    embedImageUrl: { type: String },
    embedThumbnailUrl: { type: String },

    ticketMessage: { type: String, default: "" },
    selectPlaceholder: { type: String },
    panelContent: { type: String },

    claimLogChannelId: { type: String },
    closeLogChannelId: { type: String },
    ticketCategoryId: { type: String },

    staffRoleIds: { type: [String], default: [] },
    menuOptions: { type: [menuOptionSchema], default: [] },

    totalTicketsOpened: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ticketSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    channelId: { type: String, required: true },
    panelId: { type: mongoose.Schema.Types.ObjectId, ref: "TicketPanel" },
    status: {
      type: String,
      default: "open",
      enum: ["open", "closed"],
    },
    claimedBy: { type: String, default: null },
  },
  { timestamps: true }
);

ticketPanelSchema.index({ guildId: 1, channelId: 1 });
ticketSchema.index({ userId: 1, guildId: 1, status: 1 });

export const TicketPanel = mongoose.model("TicketPanel", ticketPanelSchema);
export const Ticket = mongoose.model("Ticket", ticketSchema);
