import { Telegraf, session, type Context } from "telegraf";
import { db } from "@workspace/db";
import { usersTable, ordersTable, cardsTable, settingsTable } from "@workspace/db";
import { eq, desc, and, sql, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { calcPrice, generateUniqueAmount, formatPrice } from "./prices";
import {
  mainMenuKb,
  nakrutkaMenuKb,
  backMenuKb,
  nakrutkaBackMenuKb,
  adminMenu,
  botSettingsMenu,
  memberManageMenu,
  langSelectKeyboard,
  premiumChoiceKeyboard,
  nakrutkaCatsKeyboard,
  servicesKeyboard,
  serviceDetailKeyboard,
  confirmPaymentInline,
  confirmTopupInline,
  topupButtonInline,
  userManageInline,
  serviceToggleKeyboard,
} from "./keyboards";
import * as smmApi from "./smm-api";
import {
  ensureServicesLoaded,
  getCategories,
  getCategoriesByType,
  getServiceById,
  calcSmmPrice,
  formatSmmPriceInfo,
  classifyCategory,
  type NakrutkaType,
} from "./smm-services";
import { T, type Lang } from "./translations";
import type { SessionData } from "./session";

interface BotContext extends Context {
  session: SessionData;
}

const BOT_TOKEN = process.env["BOT_TOKEN"];
const ADMIN_ID = Number(process.env["ADMIN_ID"] || "0");
if (!BOT_TOKEN) throw new Error("BOT_TOKEN required");

export const bot = new Telegraf<BotContext>(BOT_TOKEN);
bot.use(session({ defaultSession: (): SessionData => ({}) }));

// =================== SETTINGS HELPERS ===================

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

async function getHiddenCatIds(): Promise<number[]> {
  const v = await getSetting("hidden_cat_ids");
  if (!v) return [];
  try { return JSON.parse(v) as number[]; } catch { return []; }
}

// =================== HELPERS ===================

function isAdmin(ctx: BotContext) {
  return ctx.from?.id === ADMIN_ID;
}

async function getUser(telegramId: number) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  return rows[0] ?? null;
}

async function getUserLang(ctx: BotContext): Promise<Lang> {
  if (!ctx.from) return "uz";
  const u = await getUser(ctx.from.id);
  return (u?.language ?? "uz") as Lang;
}

async function ensureUser(ctx: BotContext) {
  if (!ctx.from) return;
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, ctx.from.id)).limit(1);
  if (existing.length === 0) {
    await db.insert(usersTable).values({
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name ?? null,
    });
  } else if (ctx.from.username && existing[0]!.username !== ctx.from.username) {
    await db.update(usersTable).set({ username: ctx.from.username }).where(eq(usersTable.telegramId, ctx.from.id));
  }
}

async function getActiveCard() {
  const cards = await db.select().from(cardsTable).where(eq(cardsTable.isActive, true)).limit(1);
  return cards[0] ?? null;
}

async function notifyAdmin(text: string, extra?: Parameters<typeof bot.telegram.sendMessage>[2]) {
  try { await bot.telegram.sendMessage(ADMIN_ID, text, extra); }
  catch (err) { logger.error({ err }, "Admin notify failed"); }
}

async function checkMembership(ctx: BotContext, lang: Lang): Promise<boolean> {
  const channelId = await getSetting("channel_id");
  if (!channelId) return true;
  try {
    const member = await ctx.telegram.getChatMember(channelId, ctx.from!.id);
    if (["member", "administrator", "creator"].includes(member.status)) return true;
    await ctx.reply(
      lang === "uz"
        ? `📢 Botdan foydalanish uchun kanalga a'zo bo'ling:\n${channelId}\n\nA'zo bo'lgach, /start bosing.`
        : lang === "ru"
          ? `📢 Подпишитесь на канал:\n${channelId}\n\nПосле подписки нажмите /start.`
          : `📢 Join our channel:\n${channelId}\n\nAfter joining, press /start.`,
    );
    return false;
  } catch {
    return true;
  }
}

async function isBotActive(): Promise<boolean> {
  const v = await getSetting("bot_active");
  return v !== "false";
}

async function checkAndDeduct(ctx: BotContext, price: number, lang: Lang): Promise<boolean> {
  const user = await getUser(ctx.from!.id);
  const balance = user?.balance ?? 0;
  if (balance < price) {
    const deficit = price - balance;
    await ctx.reply(
      T[lang].balanceInsufficient(formatPrice(balance), formatPrice(price), formatPrice(deficit)),
      { parse_mode: "HTML", ...topupButtonInline(deficit, lang) },
    );
    return false;
  }
  await db.update(usersTable).set({ balance: sql`balance - ${price}` }).where(eq(usersTable.telegramId, ctx.from!.id));
  return true;
}

// =================== AUTO CONFIRM PAYMENT ===================
// Admin types /pay AMOUNT → bot finds matching order and confirms
export async function autoConfirmByAmount(amount: number): Promise<{ success: boolean; message: string }> {
  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.uniqueAmount, amount), eq(ordersTable.status, "pending")))
    .limit(1);
  const order = orders[0];
  if (!order) return { success: false, message: `❌ ${amount} so'mlik pending buyurtma topilmadi.` };

  if (order.serviceType === "topup") {
    await db.update(ordersTable).set({ status: "paid", confirmedAt: new Date() }).where(eq(ordersTable.id, order.id));
    await db.update(usersTable).set({ balance: sql`balance + ${order.price}` }).where(eq(usersTable.telegramId, order.telegramId));
    const lang = ((await getUser(order.telegramId))?.language ?? "uz") as Lang;
    await bot.telegram.sendMessage(
      order.telegramId,
      `<blockquote>✅ ${formatPrice(order.price)} balansingizga qo'shildi! 🎉\n💰 Buyurtma #${order.id}</blockquote>`,
      { parse_mode: "HTML" },
    );
    return { success: true, message: `✅ #${order.id} — Balans +${formatPrice(order.price)} (user: ${order.telegramId})` };
  } else {
    await db.update(ordersTable).set({ status: "paid", confirmedAt: new Date() }).where(eq(ordersTable.id, order.id));
    const lang = ((await getUser(order.telegramId))?.language ?? "uz") as Lang;
    await bot.telegram.sendMessage(
      order.telegramId,
      `<blockquote>${T[lang].orderSuccess(order.id, order.serviceName, order.quantity, formatPrice(order.price))}\nAdmin tasdiqlaydi.</blockquote>`,
      { parse_mode: "HTML" },
    );
    await notifyAdmin(
      `<blockquote>🔔 Avtomatik tasdiqlandi!\n#${order.id} | ${order.serviceName}\n👤 <code>${order.telegramId}</code> | 💰 ${formatPrice(order.price)}\n🔗 ${order.link ?? "—"}</blockquote>`,
      { parse_mode: "HTML", ...confirmPaymentInline(order.id) },
    );
    return { success: true, message: `✅ #${order.id} tasdiqlandi — ${order.serviceName}` };
  }
}

// =================== /start ===================

bot.start(async (ctx) => {
  await ensureServicesLoaded();
  if (!await isBotActive() && !isAdmin(ctx)) {
    await ctx.reply("🔴 Bot hozircha o'chirilgan. Tez orada qayta ishga tushadi.");
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, ctx.from!.id)).limit(1);
  if (existing.length > 0 && existing[0]!.language) {
    const lang = existing[0]!.language as Lang;
    const ok = await checkMembership(ctx, lang);
    if (!ok) return;
    await ctx.reply(T[lang].welcome(ctx.from!.first_name || "👋"), { parse_mode: "HTML", ...mainMenuKb(lang) });
    return;
  }
  await ctx.reply(
    `🌐 <b>Tilni tanlang / Выберите язык / Choose language:</b>`,
    { parse_mode: "HTML", ...langSelectKeyboard() },
  );
});

// Language pick
bot.action(/^lang:(uz|ru|en)$/, async (ctx) => {
  const lang = ctx.match[1] as Lang;
  const tgId = ctx.from!.id;
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, tgId)).limit(1);
  if (existing.length === 0) {
    await db.insert(usersTable).values({
      telegramId: tgId, username: ctx.from?.username ?? null,
      firstName: ctx.from?.first_name ?? "", lastName: ctx.from?.last_name ?? null, language: lang,
    });
  } else {
    await db.update(usersTable).set({ language: lang }).where(eq(usersTable.telegramId, tgId));
  }
  await ensureServicesLoaded();
  const ok = await checkMembership(ctx, lang);
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  if (!ok) return;
  await ctx.reply(T[lang].welcome(ctx.from?.first_name || "👋"), { parse_mode: "HTML", ...mainMenuKb(lang) });
});

// =================== STARS ===================

async function handleStarsTrigger(ctx: BotContext) {
  const lang = await getUserLang(ctx);
  await ensureUser(ctx);
  const starsPriceStr = await getSetting("stars_price");
  const starsPrice = starsPriceStr ? parseInt(starsPriceStr) : 200;
  ctx.session = { step: "stars_qty" };
  await ctx.reply(
    `${T[lang].starsTitle}\n\n${T[lang].starsDesc(50, starsPrice)}\n\n${T[lang].starsAsk}`,
    { parse_mode: "HTML", ...backMenuKb(lang) },
  );
}
bot.hears("⭐ Stars sotib olish", handleStarsTrigger);
bot.hears("⭐ Купить Stars", handleStarsTrigger);
bot.hears("⭐ Buy Stars", handleStarsTrigger);

// =================== PREMIUM ===================

async function handlePremiumTrigger(ctx: BotContext) {
  const lang = await getUserLang(ctx);
  await ensureUser(ctx);
  ctx.session = { step: "premium_choose" };
  await ctx.reply(
    `💎 <b>Telegram Premium</b>\n\nDavomiylikni tanlang 👇`,
    { parse_mode: "HTML", ...premiumChoiceKeyboard() },
  );
}
bot.hears("💎 Premium sotib olish", handlePremiumTrigger);
bot.hears("💎 Купить Premium", handlePremiumTrigger);
bot.hears("💎 Buy Premium", handlePremiumTrigger);

const premiumOptions: Record<string, { days: number; price: number; name: string }> = {
  "30":  { days: 30,  price: 75000,  name: "💎 Premium 30 kun" },
  "90":  { days: 90,  price: 155000, name: "🌟 Premium 3 oy" },
  "180": { days: 180, price: 200000, name: "🌟 Premium 6 oy" },
  "365": { days: 365, price: 380000, name: "🌟 Premium 12 oy" },
};

bot.action(/^prem:(\d+)$/, async (ctx) => {
  const key = ctx.match[1];
  const opt = premiumOptions[key];
  if (!opt) { await ctx.answerCbQuery(); return; }
  const lang = await getUserLang(ctx);
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  ctx.session = { step: "premium_link", serviceKey: key };
  await ctx.reply(
    `${opt.name}\n💰 Narx: <b>${formatPrice(opt.price)}</b>\n\n${T[lang].premiumAsk}`,
    { parse_mode: "HTML", ...backMenuKb(lang) },
  );
});

bot.action("prem_back", async (ctx) => {
  const lang = await getUserLang(ctx);
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  ctx.session = {};
  await ctx.reply(T[lang].chooseService, mainMenuKb(lang));
});

// =================== NAKRUTKA ===================

async function handleNakrutkaTrigger(ctx: BotContext) {
  const lang = await getUserLang(ctx);
  await ensureUser(ctx);
  ctx.session = {};
  await ctx.reply(
    `${T[lang].nakrutkaTitle}\n\n${T[lang].nakrutkaDesc}`,
    { parse_mode: "HTML", ...nakrutkaMenuKb(lang) },
  );
}
bot.hears("📊 Nakrutka xizmatlari", handleNakrutkaTrigger);
bot.hears("📊 Накрутка", handleNakrutkaTrigger);
bot.hears("📊 SMM Services", handleNakrutkaTrigger);

const nakrutkaConfig: Record<NakrutkaType, { emoji: string; title: string }> = {
  premium:  { emoji: "💜", title: "Premium NAK" },
  oddiy:    { emoji: "📊", title: "Oddiy NAK" },
  garantli: { emoji: "🛡", title: "Garantli NAK" },
  bot:      { emoji: "🤖", title: "Bot NAK" },
};

async function showNakrutkaType(ctx: BotContext, type: NakrutkaType) {
  await ensureServicesLoaded();
  const lang = await getUserLang(ctx);
  const cfg = nakrutkaConfig[type];
  const cats = getCategoriesByType(type);
  ctx.session = {};
  await ctx.reply(
    `${cfg.emoji} <b>${cfg.title}</b>\n\nKategoriyani tanlang 👇 (${cats.length} ta)`,
    { parse_mode: "HTML", ...nakrutkaCatsKeyboard(type, 0) },
  );
}

bot.hears("💜 Premium NAK",  (ctx) => showNakrutkaType(ctx, "premium"));
bot.hears("📊 Oddiy NAK",    (ctx) => showNakrutkaType(ctx, "oddiy"));
bot.hears("🛡 Garantli NAK", (ctx) => showNakrutkaType(ctx, "garantli"));
bot.hears("🤖 Bot NAK",      (ctx) => showNakrutkaType(ctx, "bot"));

bot.action("nak_back", async (ctx) => {
  const lang = await getUserLang(ctx);
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply(
    `${T[lang].nakrutkaTitle}\n\n${T[lang].nakrutkaDesc}`,
    { parse_mode: "HTML", ...nakrutkaMenuKb(lang) },
  );
});

bot.action(/^ncat:(premium|oddiy|garantli|bot):(\d+)$/, async (ctx) => {
  await ensureServicesLoaded();
  const type = ctx.match[1] as NakrutkaType;
  const page = parseInt(ctx.match[2]);
  const cfg = nakrutkaConfig[type];
  const cats = getCategoriesByType(type);
  await ctx.editMessageText(
    `${cfg.emoji} <b>${cfg.title}</b>\n\nKategoriyani tanlang 👇 (${cats.length} ta)`,
    { parse_mode: "HTML", ...nakrutkaCatsKeyboard(type, page) },
  );
  await ctx.answerCbQuery();
});

bot.action("noop", (ctx) => ctx.answerCbQuery());

bot.action(/^cat:(\d+):(\d+)$/, async (ctx) => {
  await ensureServicesLoaded();
  const catIndex = parseInt(ctx.match[1]);
  const page = parseInt(ctx.match[2]);
  const cats = getCategories();
  const catName = cats[catIndex] ?? "Kategoriya";
  await ctx.editMessageText(
    `📂 <b>${catName}</b>\n\nXizmatni tanlang 👇`,
    { parse_mode: "HTML", ...servicesKeyboard(catIndex, page) },
  );
  await ctx.answerCbQuery();
});

bot.action(/^svc:(\d+)$/, async (ctx) => {
  await ensureServicesLoaded();
  const svcId = parseInt(ctx.match[1]);
  const svc = getServiceById(svcId);
  if (!svc) { await ctx.answerCbQuery("❌ Topilmadi"); return; }
  const nakType = classifyCategory(svc.category);
  await ctx.answerCbQuery();
  await ctx.editMessageText(buildServiceText(svc), { parse_mode: "HTML", ...serviceDetailKeyboard(svc.service, nakType) });
});

bot.action(/^cat_back:(\d+)$/, async (ctx) => {
  await ensureServicesLoaded();
  const svcId = parseInt(ctx.match[1]);
  const svc = getServiceById(svcId);
  await ctx.answerCbQuery();
  if (svc) {
    const cats = getCategories();
    const catIdx = cats.findIndex((c) => c === svc.category);
    if (catIdx >= 0) {
      await ctx.editMessageText(`📂 <b>${svc.category}</b>\n\nXizmatni tanlang 👇`, { parse_mode: "HTML", ...servicesKeyboard(catIdx, 0) });
      return;
    }
  }
  const type: NakrutkaType = svc ? classifyCategory(svc.category) : "oddiy";
  const cfg = nakrutkaConfig[type];
  await ctx.editMessageText(`${cfg.emoji} <b>${cfg.title}</b>\n\nKategoriyani tanlang 👇`, { parse_mode: "HTML", ...nakrutkaCatsKeyboard(type, 0) });
});

bot.action(/^order:(\d+)$/, async (ctx) => {
  await ensureServicesLoaded();
  const svcId = parseInt(ctx.match[1]);
  const svc = getServiceById(svcId);
  if (!svc) { await ctx.answerCbQuery("❌ Topilmadi"); return; }
  await ctx.answerCbQuery();
  const lang = await getUserLang(ctx);
  ctx.session = { step: "smm_link", smmServiceId: svc.service, smmServiceMin: svc.min, smmServiceMax: svc.max, smmServiceRate: svc.rate };
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply(`📦 <b>${svc.name}</b>\n\n${T[lang].linkAsk}`, { parse_mode: "HTML", ...nakrutkaBackMenuKb(lang) });
});

bot.action("go_topup", async (ctx) => {
  const lang = await getUserLang(ctx);
  await ctx.answerCbQuery();
  ctx.session = { step: "topup_amount" };
  await ctx.reply(
    `💵 <b>${lang === "uz" ? "Balansni to'ldirish" : lang === "ru" ? "Пополнение баланса" : "Top Up Balance"}</b>\n\n${T[lang].balanceAsk}`,
    { parse_mode: "HTML", ...backMenuKb(lang) },
  );
});

// =================== BALANCE ===================

async function handleBalanceTrigger(ctx: BotContext) {
  await ensureUser(ctx);
  const lang = await getUserLang(ctx);
  const user = await getUser(ctx.from!.id);
  await ctx.reply(`${T[lang].balanceTitle(formatPrice(user?.balance ?? 0))}\n\n${T[lang].balanceFill}`, { parse_mode: "HTML", ...mainMenuKb(lang) });
}
bot.hears("💰 Balans",   handleBalanceTrigger);
bot.hears("💰 Баланс",   handleBalanceTrigger);
bot.hears("💰 Balance",  handleBalanceTrigger);

async function handleTopupTrigger(ctx: BotContext) {
  await ensureUser(ctx);
  const lang = await getUserLang(ctx);
  ctx.session = { step: "topup_amount" };
  await ctx.reply(
    `💵 <b>${lang === "uz" ? "Balansni to'ldirish" : lang === "ru" ? "Пополнение баланса" : "Top Up"}</b>\n\n${T[lang].balanceAsk}`,
    { parse_mode: "HTML", ...backMenuKb(lang) },
  );
}
bot.hears("💵 Balans to'ldirish", handleTopupTrigger);
bot.hears("💵 Пополнить баланс",  handleTopupTrigger);
bot.hears("💵 Top Up Balance",    handleTopupTrigger);

// =================== ORDERS ===================

async function handleOrdersTrigger(ctx: BotContext) {
  await ensureUser(ctx);
  const lang = await getUserLang(ctx);
  const orders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.telegramId, ctx.from!.id), sql`${ordersTable.serviceType} != 'topup'`))
    .orderBy(desc(ordersTable.createdAt)).limit(10);
  if (orders.length === 0) { await ctx.reply(T[lang].noOrders, mainMenuKb(lang)); return; }
  const em: Record<string, string> = { pending: "⏳", paid: "✅", processing: "🔄", completed: "✔️", cancelled: "❌" };
  const text = orders.map((o, i) =>
    `${i + 1}. ${em[o.status] ?? "❓"} <b>${o.serviceName}</b>\n   ${o.quantity.toLocaleString()} ta | ${formatPrice(o.price)}${o.smmOrderId ? ` | SMM #${o.smmOrderId}` : ""}`,
  ).join("\n\n");
  await ctx.reply(`${T[lang].ordersTitle}\n\n${text}`, { parse_mode: "HTML", ...mainMenuKb(lang) });
}
bot.hears("📦 Buyurtmalarim", handleOrdersTrigger);
bot.hears("📦 Мои заказы",    handleOrdersTrigger);
bot.hears("📦 My Orders",     handleOrdersTrigger);

// =================== HELP ===================

async function handleHelpTrigger(ctx: BotContext) {
  const lang = await getUserLang(ctx);
  await ctx.reply(T[lang].help, { parse_mode: "HTML", ...mainMenuKb(lang) });
}
bot.hears("📞 Yordam",   handleHelpTrigger);
bot.hears("📞 Помощь",   handleHelpTrigger);
bot.hears("📞 Help",     handleHelpTrigger);

// =================== BACK BUTTONS ===================

bot.hears(["🔙 Orqaga", "🔙 Назад", "🔙 Back"], async (ctx) => {
  ctx.session = {};
  const lang = await getUserLang(ctx);
  await ctx.reply(T[lang].chooseService, mainMenuKb(lang));
});

bot.hears(["🔙 Nakrutka", "🔙 Накрутка", "🔙 Services"], async (ctx) => {
  ctx.session = {};
  const lang = await getUserLang(ctx);
  await ctx.reply(`${T[lang].nakrutkaTitle}\n\n${T[lang].nakrutkaDesc}`, { parse_mode: "HTML", ...nakrutkaMenuKb(lang) });
});

bot.hears("🔙 Admin panel", async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = {};
  await ctx.reply("👨‍💼 Admin panel:", adminMenu);
});

// =================== ADMIN PANEL ===================

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) { await ctx.reply("❌ Ruxsat yo'q."); return; }
  await ctx.reply("👨‍💼 Admin panel:", adminMenu);
});

// Admin /pay AMOUNT — avtomatik to'lov tasdiqlash
bot.command("pay", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = ctx.message.text.split(" ")[1];
  const amount = parseInt(text?.replace(/\s/g, "") ?? "");
  if (!amount || isNaN(amount)) {
    await ctx.reply("❌ Foydalanish: <code>/pay 50023</code>", { parse_mode: "HTML" }); return;
  }
  const result = await autoConfirmByAmount(amount);
  await ctx.reply(result.message);
});

// Statistika
bot.hears("📊 Statistikani ko'rish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const [allOrders, users, topups] = await Promise.all([
    db.select().from(ordersTable).where(sql`${ordersTable.serviceType} != 'topup'`),
    db.select().from(usersTable),
    db.select().from(ordersTable).where(and(eq(ordersTable.serviceType, "topup"), eq(ordersTable.status, "paid"))),
  ]);
  const paid = allOrders.filter((o) => ["paid","processing","completed"].includes(o.status));
  const pending = allOrders.filter((o) => o.status === "pending");
  const revenue = paid.reduce((s, o) => s + o.price, 0);
  await ctx.reply(
    `📊 <b>Statistika</b>\n\n` +
    `👥 Foydalanuvchilar: <b>${users.length}</b>\n` +
    `📦 Buyurtmalar: <b>${allOrders.length}</b> (⏳${pending.length} ✅${paid.length})\n` +
    `💰 Tushum: <b>${formatPrice(revenue)}</b>\n` +
    `💵 To'ldirishlar: <b>${formatPrice(topups.reduce((s,o)=>s+o.price,0))}</b>\n\n` +
    `💡 To'lovni tasdiqlash: <code>/pay SUMMA</code>`,
    { parse_mode: "HTML", ...adminMenu },
  );
});

// Xabar yuborish
bot.hears("📨 Xabar yuborish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = { step: "admin_broadcast" };
  await ctx.reply("📨 Yubormoqchi bo'lgan xabarni kiriting.\n\n/cancel — bekor qilish");
});

// Bot sozlamalari
bot.hears("🔧 Bot sozlamalari", async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = {};
  const starsId = await getSetting("stars_smm_id");
  const channel = await getSetting("channel_id");
  const active = await isBotActive();
  const starsPrice = await getSetting("stars_price");
  await ctx.reply(
    `🔧 <b>Bot sozlamalari</b>\n\n` +
    `⭐ Stars SMM ID: <code>${starsId ?? "sozlanmagan"}</code>\n` +
    `📢 Kanal: <code>${channel ?? "yo'q"}</code>\n` +
    `💵 Stars narxi: <code>${starsPrice ?? "200"} so'm/ta</code>\n` +
    `🔘 Bot: ${active ? "🟢 Yoqilgan" : "🔴 O'chirilgan"}`,
    { parse_mode: "HTML", ...botSettingsMenu },
  );
});

// Foydalanuvchi boshqarish
bot.hears("👤 Foydalanuvchini boshqarish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = {};
  await ctx.reply("👤 <b>Foydalanuvchi boshqarish</b>", { parse_mode: "HTML", ...memberManageMenu });
});

// Chek yaratish (pending orders list)
bot.hears("💵 Chek yaratish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.status, "pending"))
    .orderBy(desc(ordersTable.createdAt)).limit(20);
  if (orders.length === 0) { await ctx.reply("✅ Kutayotgan buyurtmalar yo'q.", adminMenu); return; }
  for (const o of orders) {
    const isTopup = o.serviceType === "topup";
    await ctx.reply(
      `<blockquote>${isTopup ? "💵" : "📦"} #${o.id} | ${o.serviceName}\n👤 <code>${o.telegramId}</code>\n💰 ${formatPrice(o.price)} | 💳 ${formatPrice(o.uniqueAmount)}${o.link ? `\n🔗 ${o.link}` : ""}</blockquote>`,
      {
        parse_mode: "HTML",
        ...(isTopup ? confirmTopupInline(o.id) : confirmPaymentInline(o.id)),
      },
    );
  }
});

// Majburiy obuna
bot.hears("📋 Majburiy obuna", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const current = await getSetting("channel_id");
  ctx.session = { step: "admin_set_channel" };
  await ctx.reply(
    `📋 <b>Majburiy obuna</b>\n\nJoriy kanal: <code>${current ?? "sozlanmagan"}</code>\n\n` +
    `Kanal username yoki ID yuboring:\nMasalan: <code>@mychannel</code> yoki <code>-1001234567890</code>\n\n` +
    `O'chirish uchun: <code>off</code>`,
    { parse_mode: "HTML" },
  );
});

// Admin sozlash
bot.hears("⚙️ Admin sozlash", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const card = await getActiveCard();
  await ctx.reply(
    `⚙️ <b>Admin sozlash</b>\n\n` +
    `💳 Karta: <code>${card?.cardNumber ?? "sozlanmagan"}</code>\n` +
    `👤 Egasi: ${card?.cardHolder ?? "—"}\n\n` +
    `💡 <code>/pay SUMMA</code> — to'lovni tasdiqlash`,
    { parse_mode: "HTML", ...adminMenu },
  );
});

// =================== BOT SETTINGS SUBMENU ===================

bot.hears("💳 Karta", async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = { step: "admin_card_number" };
  await ctx.reply("💳 Yangi karta raqamini kiriting:\nMasalan: <code>9860 0121 1826 7017</code>", { parse_mode: "HTML" });
});

bot.hears("👤 Egasi", async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = { step: "admin_card_holder" };
  await ctx.reply("👤 Karta egasining ismini kiriting:\nMasalan: <code>Jaxongir Sadullayev</code>", { parse_mode: "HTML" });
});

bot.hears("⭐ Stars narxi", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const current = await getSetting("stars_price");
  ctx.session = { step: "admin_stars_price" };
  await ctx.reply(`⭐ <b>Stars narxi</b>\n\nJoriy: <b>${current ?? "200"} so'm/ta</b>\n\nYangi narx (so'm/ta):`, { parse_mode: "HTML" });
});

bot.hears("📢 Kanal", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const current = await getSetting("channel_id");
  ctx.session = { step: "admin_set_channel" };
  await ctx.reply(`📢 <b>Majburiy obuna kanali</b>\nJoriy: <code>${current ?? "yo'q"}</code>\n\n@username yoki <code>off</code>:`, { parse_mode: "HTML" });
});

bot.hears("🔑 API (Stars)", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const current = await getSetting("stars_smm_id");
  ctx.session = { step: "admin_stars_id" };
  await ctx.reply(`🔑 <b>Stars SMM xizmat ID</b>\nJoriy: <code>${current ?? "yo'q"}</code>\n\nsmmmain.com dagi Stars xizmatining ID sini kiriting:`, { parse_mode: "HTML" });
});

bot.hears("🎁 Referal", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply("🎁 Referal tizimi hozircha ishlanmoqda.", botSettingsMenu);
});

bot.hears("💎 Premium narxlar", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply(
    `💎 <b>Premium narxlar</b>\n\n` +
    `• 30 kun: 75,000 so'm\n• 3 oy: 155,000 so'm\n• 6 oy: 200,000 so'm\n• 12 oy: 380,000 so'm\n\n` +
    `O'zgartirish uchun: <code>/setprem 30 75000</code>`,
    { parse_mode: "HTML", ...botSettingsMenu },
  );
});

bot.hears("🟢 Bot holati", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const active = await isBotActive();
  await setSetting("bot_active", active ? "false" : "true");
  await ctx.reply(active ? "🔴 Bot o'chirildi." : "🟢 Bot yoqildi.", botSettingsMenu);
});

bot.hears("📋 Xizmatlar boshqaruv", async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ensureServicesLoaded();
  const cats = getCategories();
  const hidden = await getHiddenCatIds();
  await ctx.reply(
    `📋 <b>Kategoriyalar boshqaruvi</b>\n🟢 Ko'rinadi | 🔴 Yashirilgan\n\nKategoriyani bosib holatini o'zgartiring:`,
    { parse_mode: "HTML", ...serviceToggleKeyboard(hidden, 0, cats) },
  );
});

// Service toggle callback
bot.action(/^svctog:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) { await ctx.answerCbQuery(); return; }
  const idx = parseInt(ctx.match[1]);
  const hidden = await getHiddenCatIds();
  const newHidden = hidden.includes(idx) ? hidden.filter((i) => i !== idx) : [...hidden, idx];
  await setSetting("hidden_cat_ids", JSON.stringify(newHidden));
  const cats = getCategories();
  const page = Math.floor(idx / 6);
  await ctx.editMessageReplyMarkup(serviceToggleKeyboard(newHidden, page, cats).reply_markup);
  await ctx.answerCbQuery(hidden.includes(idx) ? "🟢 Ko'rinadi" : "🔴 Yashirildi");
});

bot.action(/^svcpage:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) { await ctx.answerCbQuery(); return; }
  const page = parseInt(ctx.match[1]);
  const cats = getCategories();
  const hidden = await getHiddenCatIds();
  await ctx.editMessageReplyMarkup(serviceToggleKeyboard(hidden, page, cats).reply_markup);
  await ctx.answerCbQuery();
});

// =================== MEMBER MANAGEMENT ===================

bot.hears("👥 Barcha azolar", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(15);
  if (users.length === 0) { await ctx.reply("📭 Yo'q.", memberManageMenu); return; }
  const text = users.map((u, i) =>
    `${i + 1}. ${u.isBlocked ? "🚫" : "✅"} <b>${u.firstName ?? ""}</b> (@${u.username ?? "—"}) | <code>${u.telegramId}</code> | ${formatPrice(u.balance)}`,
  ).join("\n");
  await ctx.reply(`👥 <b>Foydalanuvchilar (${users.length}):</b>\n\n${text}`, { parse_mode: "HTML", ...memberManageMenu });
});

bot.hears("🔍 Azo qidirish", async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = { step: "admin_search_user" };
  await ctx.reply("ID yuboring: <code>123456789</code>", { parse_mode: "HTML" });
});

// =================== CALLBACK: ADMIN CONFIRM ===================

bot.action(/^confirm_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const orderId = parseInt(ctx.match[1]);
  const rows = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending"))).limit(1);
  const order = rows[0];
  if (!order) { await ctx.answerCbQuery("❌ Topilmadi"); return; }
  await db.update(ordersTable).set({ status: "paid", confirmedAt: new Date() }).where(eq(ordersTable.id, orderId));
  const lang = ((await getUser(order.telegramId))?.language ?? "uz") as Lang;
  await bot.telegram.sendMessage(order.telegramId,
    `<blockquote>${T[lang].orderSuccess(orderId, order.serviceName, order.quantity, formatPrice(order.price))}\n✅ Admin tasdiqladi.</blockquote>`,
    { parse_mode: "HTML" });
  await ctx.answerCbQuery("✅ Tasdiqlandi");
  await ctx.editMessageReplyMarkup(undefined);
});

bot.action(/^cancel_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const orderId = parseInt(ctx.match[1]);
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0];
  if (order) {
    await db.update(usersTable).set({ balance: sql`balance + ${order.price}` }).where(eq(usersTable.telegramId, order.telegramId));
    await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, orderId));
    const lang = ((await getUser(order.telegramId))?.language ?? "uz") as Lang;
    await bot.telegram.sendMessage(order.telegramId,
      `<blockquote>❌ #${orderId} bekor qilindi. ${formatPrice(order.price)} qaytarildi.\n@isroilovich</blockquote>`,
      { parse_mode: "HTML" });
  }
  await ctx.answerCbQuery("❌ Bekor"); await ctx.editMessageReplyMarkup(undefined);
});

bot.action(/^topup_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const orderId = parseInt(ctx.match[1]);
  const rows = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending"))).limit(1);
  const order = rows[0];
  if (!order) { await ctx.answerCbQuery("❌ Topilmadi"); return; }
  await db.update(ordersTable).set({ status: "paid", confirmedAt: new Date() }).where(eq(ordersTable.id, orderId));
  await db.update(usersTable).set({ balance: sql`balance + ${order.price}` }).where(eq(usersTable.telegramId, order.telegramId));
  await bot.telegram.sendMessage(order.telegramId,
    `<blockquote>✅ ${formatPrice(order.price)} balansingizga qo'shildi! 🎉</blockquote>`, { parse_mode: "HTML" });
  await ctx.answerCbQuery("✅ To'ldirildi"); await ctx.editMessageReplyMarkup(undefined);
  await ctx.reply(`✅ #${orderId} — ${formatPrice(order.price)}`);
});

bot.action(/^topup_cancel_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const orderId = parseInt(ctx.match[1]);
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0];
  if (order) {
    await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, orderId));
    await bot.telegram.sendMessage(order.telegramId,
      `<blockquote>❌ Balans to'ldirish rad etildi.\n@isroilovich</blockquote>`, { parse_mode: "HTML" });
  }
  await ctx.answerCbQuery("❌ Rad"); await ctx.editMessageReplyMarkup(undefined);
});

bot.action(/^block_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = parseInt(ctx.match[1]);
  await db.update(usersTable).set({ isBlocked: true }).where(eq(usersTable.telegramId, id));
  await ctx.answerCbQuery("🚫 Bloklandi");
  await ctx.editMessageReplyMarkup(userManageInline(id, true).reply_markup);
});

bot.action(/^unblock_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = parseInt(ctx.match[1]);
  await db.update(usersTable).set({ isBlocked: false }).where(eq(usersTable.telegramId, id));
  await ctx.answerCbQuery("✅ Blokdan chiqarildi");
  await ctx.editMessageReplyMarkup(userManageInline(id, false).reply_markup);
});

bot.action(/^addbal_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = parseInt(ctx.match[1]);
  ctx.session = { step: "admin_add_balance", targetUserId: id };
  await ctx.answerCbQuery();
  await ctx.reply(`➕ Balans qo'shish — <code>${id}</code>\nNecha so'm?`, { parse_mode: "HTML" });
});

bot.action(/^deductbal_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = parseInt(ctx.match[1]);
  ctx.session = { step: "admin_deduct_balance", targetUserId: id };
  await ctx.answerCbQuery();
  await ctx.reply(`➖ Balans ayirish — <code>${id}</code>\nNecha so'm?`, { parse_mode: "HTML" });
});

// =================== TEXT HANDLER ===================

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const step = ctx.session?.step;
  const lang = await getUserLang(ctx);

  // BOT OFF guard
  if (!await isBotActive() && !isAdmin(ctx)) {
    await ctx.reply("🔴 Bot vaqtincha o'chirilgan.");
    return;
  }

  // ---- TOPUP AMOUNT ----
  if (step === "topup_amount") {
    const amount = parseInt(text.replace(/\s/g, ""));
    if (isNaN(amount) || amount < 5000) { await ctx.reply(T[lang].balanceMin, backMenuKb(lang)); return; }
    const uniqueAmt = generateUniqueAmount(amount);
    const card = await getActiveCard();
    if (!card) { await ctx.reply(T[lang].noCard, mainMenuKb(lang)); return; }
    const inserted = await db.insert(ordersTable).values({
      telegramId: ctx.from!.id, serviceType: "topup", serviceName: "💵 Balans to'ldirish",
      quantity: 1, price: amount, uniqueAmount: uniqueAmt, status: "pending",
    }).returning({ id: ordersTable.id });
    const orderId = inserted[0]!.id;
    await notifyAdmin(
      `<blockquote>💵 #${orderId} | Balans to'ldirish\n👤 ${ctx.from?.first_name} (@${ctx.from?.username ?? "—"}) | <code>${ctx.from!.id}</code>\n💰 ${formatPrice(amount)} | 💳 ${formatPrice(uniqueAmt)}</blockquote>\n<code>/pay ${uniqueAmt}</code>`,
      { parse_mode: "HTML", ...confirmTopupInline(orderId) },
    );
    ctx.session = {};
    await ctx.reply(
      T[lang].topupSent(formatPrice(amount), formatPrice(uniqueAmt), card.cardNumber, card.cardHolder),
      { parse_mode: "HTML", ...mainMenuKb(lang) },
    );
    return;
  }

  // ---- STARS QTY ----
  if (step === "stars_qty") {
    const qty = parseInt(text.replace(/\s/g, ""));
    const starsPrice = parseInt((await getSetting("stars_price")) ?? "200");
    if (isNaN(qty) || qty < 50) { await ctx.reply(T[lang].qtyMin(50), backMenuKb(lang)); return; }
    const price = starsPrice * qty;
    ctx.session = { step: "stars_link", quantity: qty };
    const user = await getUser(ctx.from!.id);
    const balance = user?.balance ?? 0;
    await ctx.reply(
      `⭐ <b>${qty} ta Stars</b>\n💰 Narx: <b>${formatPrice(price)}</b>\n💳 Balans: <b>${formatPrice(balance)}</b>\n\n${balance >= price ? "✅ Yetarli" : `❌ ${formatPrice(price - balance)} yetishmaydi`}\n\n${T[lang].premiumAsk}`,
      { parse_mode: "HTML", ...backMenuKb(lang) },
    );
    return;
  }

  // ---- STARS LINK ----
  if (step === "stars_link") {
    const qty = ctx.session.quantity!;
    const starsPrice = parseInt((await getSetting("stars_price")) ?? "200");
    const price = starsPrice * qty;
    const ok = await checkAndDeduct(ctx, price, lang);
    if (!ok) { ctx.session = {}; return; }
    const starsSmmId = await getSetting("stars_smm_id");
    const inserted = await db.insert(ordersTable).values({
      telegramId: ctx.from!.id, serviceType: "stars", serviceName: "⭐ Telegram Stars",
      quantity: qty, price, uniqueAmount: price, link: text, status: starsSmmId ? "processing" : "pending",
    }).returning({ id: ordersTable.id });
    const orderId = inserted[0]!.id;
    // Auto-place via SMM if Stars ID configured
    if (starsSmmId) {
      try {
        const result = await smmApi.createOrder({ service: parseInt(starsSmmId), link: text, quantity: qty });
        if (result?.order) {
          await db.update(ordersTable).set({ smmOrderId: String(result.order), status: "processing" }).where(eq(ordersTable.id, orderId));
          await ctx.reply(
            `<blockquote>✅ #${orderId} | ⭐ ${qty} Stars\n💰 ${formatPrice(price)} yechildi\n🔄 SMM ID: ${result.order}\n✨ Avtomatik bajarilmoqda</blockquote>`,
            { parse_mode: "HTML", ...mainMenuKb(lang) },
          );
          return;
        }
      } catch (err) {
        logger.error({ err }, "Stars SMM auto order failed");
      }
    }
    // Fallback — admin confirms manually
    await notifyAdmin(
      `<blockquote>⭐ #${orderId} | Stars\n👤 ${ctx.from?.first_name} | <code>${ctx.from!.id}</code>\n📊 ${qty} ta | 💰 ${formatPrice(price)}\n🔗 ${text}</blockquote>`,
      { parse_mode: "HTML", ...confirmPaymentInline(orderId) },
    );
    ctx.session = {};
    await ctx.reply(
      `<blockquote>${T[lang].orderSuccess(orderId, "⭐ Stars", qty, formatPrice(price))}\n⏳ Admin tasdiqlaydi.</blockquote>`,
      { parse_mode: "HTML", ...mainMenuKb(lang) },
    );
    return;
  }

  // ---- PREMIUM LINK ----
  if (step === "premium_link") {
    const pKey = ctx.session.serviceKey ?? "30";
    const opt = premiumOptions[pKey] ?? premiumOptions["30"]!;
    const price = opt.price;
    const ok = await checkAndDeduct(ctx, price, lang);
    if (!ok) { ctx.session = {}; return; }
    const inserted = await db.insert(ordersTable).values({
      telegramId: ctx.from!.id, serviceType: `premium${pKey}`, serviceName: opt.name,
      quantity: 1, price, uniqueAmount: price, link: text, status: "pending",
    }).returning({ id: ordersTable.id });
    const orderId = inserted[0]!.id;
    await notifyAdmin(
      `<blockquote>${opt.name}\n👤 ${ctx.from?.first_name} | <code>${ctx.from!.id}</code>\n💰 ${formatPrice(price)}\n🔗 ${text}</blockquote>`,
      { parse_mode: "HTML", ...confirmPaymentInline(orderId) },
    );
    ctx.session = {};
    await ctx.reply(
      `<blockquote>${T[lang].orderSuccess(orderId, opt.name, 1, formatPrice(price))}\n⏳ Admin tasdiqlaydi.</blockquote>`,
      { parse_mode: "HTML", ...mainMenuKb(lang) },
    );
    return;
  }

  // ---- SMM LINK ----
  if (step === "smm_link") {
    ctx.session.link = text;
    ctx.session.step = "smm_qty";
    const svcId = ctx.session.smmServiceId!;
    const svc = getServiceById(svcId);
    if (!svc) { ctx.session = {}; await ctx.reply("❌ Xizmat topilmadi.", mainMenuKb(lang)); return; }
    const examples = [svc.min, Math.min(svc.min * 5, 1000), 5000]
      .filter((q, i, a) => q <= svc.max && a.indexOf(q) === i).slice(0, 3)
      .map((q) => `• ${q.toLocaleString()} ta = ${formatPrice(calcSmmPrice(svc, q))}`);
    await ctx.reply(
      `📊 <b>${svc.name}</b>\n\n💵 ${formatSmmPriceInfo(svc)}\n${T[lang].qtyAsk(svc.min, svc.max)}\n\n${examples.join("\n")}`,
      { parse_mode: "HTML", ...nakrutkaBackMenuKb(lang) },
    );
    return;
  }

  // ---- SMM QTY ----
  if (step === "smm_qty") {
    const qty = parseInt(text.replace(/\s/g, ""));
    const svcId = ctx.session.smmServiceId!;
    const svc = getServiceById(svcId);
    if (!svc) { ctx.session = {}; await ctx.reply("❌ Xizmat topilmadi.", mainMenuKb(lang)); return; }
    if (isNaN(qty) || qty < svc.min || qty > svc.max) {
      await ctx.reply(T[lang].qtyRange(svc.min, svc.max), nakrutkaBackMenuKb(lang)); return;
    }
    const price = calcSmmPrice(svc, qty);
    const ok = await checkAndDeduct(ctx, price, lang);
    if (!ok) { ctx.session = {}; return; }
    const inserted = await db.insert(ordersTable).values({
      telegramId: ctx.from!.id, serviceType: `smm_${svcId}`, serviceName: svc.name,
      quantity: qty, price, uniqueAmount: price, link: ctx.session.link ?? null, status: "processing",
    }).returning({ id: ordersTable.id });
    const orderId = inserted[0]!.id;
    // Auto-place on SMM
    try {
      const result = await smmApi.createOrder({ service: svcId, link: ctx.session.link ?? "", quantity: qty });
      logger.info({ result, orderId }, "SMM createOrder");
      if (result?.order) {
        await db.update(ordersTable).set({ smmOrderId: String(result.order) }).where(eq(ordersTable.id, orderId));
        ctx.session = {};
        await ctx.reply(
          `<blockquote>${T[lang].orderSuccess(orderId, svc.name, qty, formatPrice(price))}\n🔄 SMM ID: ${result.order}</blockquote>`,
          { parse_mode: "HTML", ...mainMenuKb(lang) },
        );
      } else if (result?.error) {
        throw new Error(result.error);
      }
    } catch (err: any) {
      await db.update(usersTable).set({ balance: sql`balance + ${price}` }).where(eq(usersTable.telegramId, ctx.from!.id));
      await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, orderId));
      ctx.session = {};
      await ctx.reply(T[lang].orderFailed(err?.message ?? "Xato", formatPrice(price)), { parse_mode: "HTML", ...mainMenuKb(lang) });
    }
    return;
  }

  // ---- ADMIN: CARD NUMBER ----
  if (step === "admin_card_number" && isAdmin(ctx)) {
    const num = text.trim().replace(/[^\d\s]/g, "");
    if (num.replace(/\s/g,"").length < 16) { await ctx.reply("❌ To'g'ri karta raqami kiriting."); return; }
    ctx.session = { step: "admin_card_holder_save", serviceKey: num };
    const card = await getActiveCard();
    await ctx.reply(`✅ Raqam: <code>${num}</code>\n\nKarta egasi (eski: ${card?.cardHolder ?? "—"}):`, { parse_mode: "HTML" });
    return;
  }

  // ---- ADMIN: CARD HOLDER (after number) ----
  if (step === "admin_card_holder_save" && isAdmin(ctx)) {
    const num = ctx.session.serviceKey!;
    const holder = text.trim();
    await db.update(cardsTable).set({ isActive: false });
    await db.insert(cardsTable).values({ cardNumber: num, cardHolder: holder, isActive: true });
    ctx.session = {};
    await ctx.reply(`✅ Karta yangilandi:\n<code>${num}</code>\n${holder}`, { parse_mode: "HTML", ...botSettingsMenu });
    return;
  }

  // ---- ADMIN: CARD HOLDER direct ----
  if (step === "admin_card_holder" && isAdmin(ctx)) {
    const card = await getActiveCard();
    if (!card) { await ctx.reply("❌ Avval karta raqamini kiriting.", botSettingsMenu); return; }
    await db.update(cardsTable).set({ cardHolder: text.trim() }).where(eq(cardsTable.id, card.id));
    ctx.session = {};
    await ctx.reply(`✅ Egasi yangilandi: <b>${text.trim()}</b>`, { parse_mode: "HTML", ...botSettingsMenu });
    return;
  }

  // ---- ADMIN: STARS PRICE ----
  if (step === "admin_stars_price" && isAdmin(ctx)) {
    const price = parseInt(text.replace(/\s/g,""));
    if (isNaN(price) || price < 1) { await ctx.reply("❌ To'g'ri narx kiriting (so'm)."); return; }
    await setSetting("stars_price", String(price));
    ctx.session = {};
    await ctx.reply(`✅ Stars narxi: <b>${price} so'm/ta</b>`, { parse_mode: "HTML", ...botSettingsMenu });
    return;
  }

  // ---- ADMIN: STARS SMM ID ----
  if (step === "admin_stars_id" && isAdmin(ctx)) {
    const id = text.trim();
    await setSetting("stars_smm_id", id === "off" ? "" : id);
    ctx.session = {};
    await ctx.reply(`✅ Stars SMM ID: <code>${id}</code>`, { parse_mode: "HTML", ...botSettingsMenu });
    return;
  }

  // ---- ADMIN: SET CHANNEL ----
  if (step === "admin_set_channel" && isAdmin(ctx)) {
    const ch = text.trim();
    if (ch === "off" || ch === "0") {
      await setSetting("channel_id", "");
      ctx.session = {};
      await ctx.reply("✅ Majburiy obuna o'chirildi.", botSettingsMenu);
    } else {
      await setSetting("channel_id", ch);
      ctx.session = {};
      await ctx.reply(`✅ Kanal: <code>${ch}</code>`, { parse_mode: "HTML", ...botSettingsMenu });
    }
    return;
  }

  // ---- ADMIN: BROADCAST ----
  if (step === "admin_broadcast" && isAdmin(ctx)) {
    const users = await db.select({ telegramId: usersTable.telegramId }).from(usersTable).where(eq(usersTable.isBlocked, false));
    ctx.session = {};
    let sent = 0, fail = 0;
    for (const u of users) {
      try {
        await bot.telegram.copyMessage(u.telegramId, ctx.from!.id, ctx.message.message_id);
        sent++;
      } catch { fail++; }
    }
    await ctx.reply(`✅ Xabar yuborildi: ${sent} ta\n❌ Xato: ${fail} ta`, adminMenu);
    return;
  }

  // ---- ADMIN: SEARCH USER ----
  if (step === "admin_search_user" && isAdmin(ctx)) {
    const id = parseInt(text.trim());
    if (isNaN(id)) { await ctx.reply("❌ Raqamli ID:", memberManageMenu); return; }
    const user = await getUser(id);
    if (!user) { await ctx.reply(`❌ <code>${id}</code> topilmadi.`, { parse_mode: "HTML", ...memberManageMenu }); return; }
    const orderCount = (await db.select().from(ordersTable).where(eq(ordersTable.telegramId, id))).length;
    ctx.session = {};
    await ctx.reply(
      `👤 <b>${user.firstName ?? ""} ${user.lastName ?? ""}</b> (@${user.username ?? "—"})\nID: <code>${user.telegramId}</code>\n💰 ${formatPrice(user.balance)} | 📦 ${orderCount} ta\n${user.isBlocked ? "🚫 Bloklangan" : "✅ Faol"}`,
      { parse_mode: "HTML", ...userManageInline(user.telegramId, user.isBlocked) },
    );
    return;
  }

  // ---- ADMIN: ADD BALANCE ----
  if (step === "admin_add_balance" && isAdmin(ctx)) {
    const amount = parseInt(text.replace(/\s/g,""));
    const targetId = ctx.session.targetUserId!;
    if (isNaN(amount) || amount <= 0) { await ctx.reply("❌ To'g'ri summa:"); return; }
    await db.update(usersTable).set({ balance: sql`balance + ${amount}` }).where(eq(usersTable.telegramId, targetId));
    const user = await getUser(targetId);
    ctx.session = {};
    await ctx.reply(`✅ ${formatPrice(amount)} qo'shildi → <code>${targetId}</code>\nYangi: ${formatPrice(user?.balance ?? 0)}`, { parse_mode: "HTML", ...adminMenu });
    try { await bot.telegram.sendMessage(targetId, `<blockquote>💰 +${formatPrice(amount)} qo'shildi!\nBalans: ${formatPrice(user?.balance ?? 0)}</blockquote>`, { parse_mode: "HTML" }); } catch {}
    return;
  }

  // ---- ADMIN: DEDUCT BALANCE ----
  if (step === "admin_deduct_balance" && isAdmin(ctx)) {
    const amount = parseInt(text.replace(/\s/g,""));
    const targetId = ctx.session.targetUserId!;
    if (isNaN(amount) || amount <= 0) { await ctx.reply("❌ To'g'ri summa:"); return; }
    const user = await getUser(targetId);
    const newBalance = Math.max(0, (user?.balance ?? 0) - amount);
    await db.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.telegramId, targetId));
    ctx.session = {};
    await ctx.reply(`✅ ${formatPrice(amount)} ayirildi → <code>${targetId}</code>\nYangi: ${formatPrice(newBalance)}`, { parse_mode: "HTML", ...adminMenu });
    return;
  }
});

// =================== SERVICE TEXT BUILDER ===================

function buildServiceText(svc: { service: number; name: string; category: string; rate: string; min: number; max: number; refill: boolean; cancel: boolean }) {
  return (
    `📦 <b>${svc.name}</b>\n\n📂 ${svc.category}\n` +
    `💵 <b>${formatSmmPriceInfo(svc as any)}</b>\n` +
    `📌 Min: <b>${svc.min.toLocaleString()}</b> | Max: <b>${svc.max.toLocaleString()}</b>` +
    (svc.refill ? `\n♻️ Refill mavjud` : "") +
    (svc.cancel ? `\n❌ Bekor qilish mumkin` : "")
  );
}

// =================== BOT LAUNCH ===================

export async function startBot() {
  await ensureServicesLoaded();
  await bot.launch({ dropPendingUpdates: true });
  logger.info("Telegram bot started");
  // Refresh SMM services every hour
  setInterval(() => ensureServicesLoaded(), 60 * 60 * 1000);
}

export async function stopBot() {
  bot.stop("SIGTERM");
}
