import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChannelType } from "discord.js";

import { TicketPanel } from "../models/ticketPanel.js";
import { StaffStats } from "../models/staffStats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

export async function startWebServer({
  client,
  logger,
  ticketService,
  port,
  host,
}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });


  app.get("/api/guilds", async (req, res) => {
    try {
      const guilds = client.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
      }));
      res.json(guilds);
    } catch (err) {
      res.status(500).json({ message: "فشل جلب السيرفرات" });
    }
  });

  app.get("/api/guilds/:guildId/resources", async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);

      const channels = guild.channels.cache
        .filter((ch) => ch.isTextBased())
        .map((ch) => ({ id: ch.id, name: ch.name }));

      const categories = guild.channels.cache
        .filter((ch) => ch.type === ChannelType.GuildCategory)
        .map((cat) => ({ id: cat.id, name: cat.name }));

      const roles = guild.roles.cache.map((role) => ({
        id: role.id,
        name: role.name,
      }));

      res.json({ channels, categories, roles });
    } catch (err) {
      logger.error("❌ resources error:", err);
      res.status(500).json({ message: "فشل تحميل البيانات" });
    }
  });

  app.get("/api/guilds/:guildId/panel", async (req, res) => {
    try {
      const panel = await TicketPanel.findOne({
        guildId: req.params.guildId,
      });

      res.json(panel || null);
    } catch (err) {
      res.status(500).json({ message: "خطأ في جلب اللوحة" });
    }
  });

  app.post("/api/guilds/:guildId/panel", async (req, res) => {
    try {
      const panel = await ticketService.savePanel(
        req.params.guildId,
        req.body
      );

      res.json(panel);
    } catch (err) {
      logger.error("❌ save panel:", err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/guilds/:guildId/panel/publish", async (req, res) => {
    try {
      await ticketService.postPanel(req.params.guildId);
      res.json({ success: true });
    } catch (err) {
      logger.error("❌ publish error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/guilds/:guildId/total-stats", async (req, res) => {
    try {
      const panel = await TicketPanel.findOne({
        guildId: req.params.guildId,
      });

      res.json({
        total: panel?.totalTicketsOpened || 0,
      });
    } catch (err) {
      logger.error("❌ total-stats error:", err);
      res.status(500).json({ message: "خطأ داخلي" });
    }
  });

  app.post("/api/guilds/:guildId/total-stats/reset", async (req, res) => {
    try {
      const { guildId } = req.params;
      await TicketPanel.findOneAndUpdate(
        { guildId }, 
        { $set: { totalTicketsOpened: 0 } }
      );
      res.json({ success: true });
    } catch (err) {
      logger.error("❌ reset total stats error:", err);
      res.status(500).json({ success: false, message: "فشل تصفير العداد" });
    }
  });

  app.get("/api/guilds/:guildId/stats/top", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "10"), 50);

      const statsData = await StaffStats.find({
        guildId: req.params.guildId,
      })
        .sort({ claimedCount: -1 })
        .limit(limit)
        .lean();

      const formattedData = await Promise.all(
        statsData.map(async (stat) => {
          try {
            const user = await client.users.fetch(stat.userId);
            return {
              ...stat,
              username: user.username,
              avatar: user.displayAvatarURL({ extension: 'png', size: 128 }),
            };
          } catch (fetchErr) {
            return {
              ...stat,
              username: `Unknown (${stat.userId})`,
              avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
            };
          }
        })
      );

      res.json(formattedData);
    } catch (err) {
      logger.error("❌ top stats error:", err);
      res.status(500).json({ message: "خطأ في الإحصائيات" });
    }
  });

  app.post("/api/guilds/:guildId/stats/reset", async (req, res) => {
    try {
      const { userId } = req.body;

      if (userId) {
        await StaffStats.updateOne(
          { guildId: req.params.guildId, userId },
          { $set: { claimedCount: 0 } }
        );
      } else {
        await StaffStats.updateMany(
          { guildId: req.params.guildId },
          { $set: { claimedCount: 0 } }
        );
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "فشل التصفير" });
    }
  });

  app.use(express.static(publicDir));

  app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });



  return new Promise((resolve) => {
    app.listen(port, host, () => {
      console.log(`[INFO] Server running on http://localhost:${port}`);
      resolve();
    });
  });
}