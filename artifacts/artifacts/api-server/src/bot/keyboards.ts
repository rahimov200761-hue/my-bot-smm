import { Markup } from "telegraf";
import {
  getCategories,
  getServicesInCategory,
  getCategoriesByType,
  classifyCategory,
  type NakrutkaType,
} from "./smm-services";
import { type Lang, langName } from "./translations";

// =================== REPLY KEYBOARDS ===================

export function mainMenuKb(lang: Lang) {
  const labels = {
    uz: [
      ["⭐ Stars sotib olish", "💎 Premium sotib olish"],
      ["📊 Nakrutka xizmatlari", "📦 Buyurtmalarim"],
      ["💵 Balans to'ldirish", "💰 Balans"],
      ["📞 Yordam"],
    ],
    ru: [
      ["⭐ Купить Stars", "💎 Купить Premium"],
      ["📊 Накрутка", "📦 Мои заказы"],
      ["💵 Пополнить баланс", "💰 Баланс"],
      ["📞 Помощь"],
    ],
    en: [
      ["⭐ Buy Stars", "💎 Buy Premium"],
      ["📊 SMM Services", "📦 My Orders"],
      ["💵 Top Up Balance", "💰 Balance"],
      ["📞 Help"],
    ],
  };
  return Markup.keyboard(labels[lang]).resize();
}

export function nakrutkaMenuKb(lang: Lang) {
  const back = lang === "uz" ? "🔙 Orqaga" : lang === "ru" ? "🔙 Назад" : "🔙 Back";
  return Markup.keyboard([
    ["💜 Premium NAK", "📊 Oddiy NAK"],
    ["🛡 Garantli NAK", "🤖 Bot NAK"],
    [back],
  ]).resize();
}

export function backMenuKb(lang: Lang) {
  const label = lang === "uz" ? "🔙 Orqaga" : lang === "ru" ? "🔙 Назад" : "🔙 Back";
  return Markup.keyboard([[label]]).resize();
}

export function nakrutkaBackMenuKb(lang: Lang) {
  const label = lang === "uz" ? "🔙 Nakrutka" : lang === "ru" ? "🔙 Накрутка" : "🔙 Services";
  return Markup.keyboard([[label]]).resize();
}

// Admin menus — matching screenshot layout
export const adminMenu = Markup.keyboard([
  ["📊 Statistikani ko'rish"],
  ["📨 Xabar yuborish", "🔧 Bot sozlamalari"],
  ["👤 Foydalanuvchini boshqarish"],
  ["💵 Chek yaratish", "📋 Majburiy obuna"],
  ["⚙️ Admin sozlash"],
  ["🔙 Orqaga"],
]).resize();

export const botSettingsMenu = Markup.keyboard([
  ["💳 Karta", "👤 Egasi"],
  ["⭐ Stars narxi", "📢 Kanal"],
  ["🔑 API (Stars)", "🎁 Referal"],
  ["💎 Premium narxlar"],
  ["🟢 Bot holati"],
  ["📋 Xizmatlar boshqaruv"],
  ["🔙 Admin panel"],
]).resize();

export const memberManageMenu = Markup.keyboard([
  ["🔍 Azo qidirish", "👥 Barcha azolar"],
  ["🔙 Admin panel"],
]).resize();

export const adminSozlashMenu = Markup.keyboard([
  ["💳 Karta sozlash"],
  ["🔙 Admin panel"],
]).resize();

// =================== INLINE KEYBOARDS ===================

export function langSelectKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(langName.uz, "lang:uz")],
    [Markup.button.callback(langName.ru, "lang:ru")],
    [Markup.button.callback(langName.en, "lang:en")],
  ]);
}

export function premiumChoiceKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💎 30 kun — 75,000 so'm", "prem:30")],
    [Markup.button.callback("🌟 3 oy — 155,000 so'm", "prem:90")],
    [Markup.button.callback("🌟 6 oy — 200,000 so'm", "prem:180")],
    [Markup.button.callback("🌟 12 oy — 380,000 so'm", "prem:365")],
    [Markup.button.callback("🔙 Orqaga", "prem_back")],
  ]);
}

const PAGE_SIZE_CATS = 8;
const PAGE_SIZE_SVCS = 8;

export function nakrutkaCatsKeyboard(type: NakrutkaType, page: number) {
  const allCats = getCategories();
  const cats = getCategoriesByType(type).sort((a, b) => {
    // Star-related categories first
    const aStar = /star|member|premium.*mem/i.test(a) ? 0 : 1;
    const bStar = /star|member|premium.*mem/i.test(b) ? 0 : 1;
    return aStar - bStar || a.localeCompare(b);
  });
  const total = Math.ceil(cats.length / PAGE_SIZE_CATS);
  const slice = cats.slice(page * PAGE_SIZE_CATS, (page + 1) * PAGE_SIZE_CATS);
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  // 1 per row so full names show (wraps in Telegram UI)
  for (const cat of slice) {
    const globalIdx = allCats.indexOf(cat);
    rows.push([
      Markup.button.callback(
        cat.length > 55 ? cat.slice(0, 53) + "…" : cat,
        `cat:${globalIdx}:0`,
      ),
    ]);
  }
  const nav: ReturnType<typeof Markup.button.callback>[] = [];
  if (page > 0) nav.push(Markup.button.callback("⬅️", `ncat:${type}:${page - 1}`));
  nav.push(Markup.button.callback(`${page + 1}/${total || 1}`, "noop"));
  if (page < total - 1) nav.push(Markup.button.callback("➡️", `ncat:${type}:${page + 1}`));
  rows.push(nav);
  rows.push([Markup.button.callback("🔙 Orqaga", "nak_back")]);
  return Markup.inlineKeyboard(rows);
}

export function servicesKeyboard(catIndex: number, page: number) {
  const cats = getCategories();
  const catName = cats[catIndex] ?? "";
  const nakType = classifyCategory(catName);
  const svcs = getServicesInCategory(catIndex);
  const total = Math.ceil(svcs.length / PAGE_SIZE_SVCS);
  const slice = svcs.slice(page * PAGE_SIZE_SVCS, (page + 1) * PAGE_SIZE_SVCS);
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (const svc of slice) {
    rows.push([
      Markup.button.callback(
        svc.name.length > 55 ? svc.name.slice(0, 53) + "…" : svc.name,
        `svc:${svc.service}`,
      ),
    ]);
  }
  const nav: ReturnType<typeof Markup.button.callback>[] = [];
  if (page > 0) nav.push(Markup.button.callback("⬅️", `cat:${catIndex}:${page - 1}`));
  nav.push(Markup.button.callback(`${page + 1}/${total || 1}`, "noop"));
  if (page < total - 1) nav.push(Markup.button.callback("➡️", `cat:${catIndex}:${page + 1}`));
  rows.push(nav);
  rows.push([Markup.button.callback("🔙 Orqaga", `ncat:${nakType}:0`)]);
  return Markup.inlineKeyboard(rows);
}

export function serviceDetailKeyboard(svcId: number, nakType: NakrutkaType) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Buyurtma berish", `order:${svcId}`)],
    [Markup.button.callback("🔙 Orqaga", `cat_back:${svcId}`)],
  ]);
}

export const confirmPaymentInline = (orderId: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Tasdiqlash", `confirm_${orderId}`)],
    [Markup.button.callback("❌ Bekor", `cancel_${orderId}`)],
  ]);

export const confirmTopupInline = (orderId: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Balansga o'tkazish", `topup_${orderId}`)],
    [Markup.button.callback("❌ Rad etish", `topup_cancel_${orderId}`)],
  ]);

export const topupButtonInline = (needed: number, lang: Lang) => {
  const label =
    lang === "uz"
      ? `💵 Balans to'ldirish (+${needed.toLocaleString("uz-UZ")} so'm)`
      : lang === "ru"
        ? `💵 Пополнить (+${needed.toLocaleString("ru-RU")} сум)`
        : `💵 Top Up (+${needed.toLocaleString()} sum)`;
  return Markup.inlineKeyboard([[Markup.button.callback(label, "go_topup")]]);
};

export const userManageInline = (telegramId: number, isBlocked: boolean) =>
  Markup.inlineKeyboard([
    [
      isBlocked
        ? Markup.button.callback("✅ Blokdan chiqarish", `unblock_${telegramId}`)
        : Markup.button.callback("🚫 Bloklash", `block_${telegramId}`),
    ],
    [Markup.button.callback("➕ Balans qo'shish", `addbal_${telegramId}`)],
    [Markup.button.callback("➖ Balans ayirish", `deductbal_${telegramId}`)],
  ]);

export function serviceToggleKeyboard(hiddenIds: number[], page: number, cats: string[]) {
  const total = Math.ceil(cats.length / 6);
  const slice = cats.slice(page * 6, (page + 1) * 6);
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (const cat of slice) {
    const id = page * 6 + cats.indexOf(cat);
    const isHidden = hiddenIds.includes(id);
    rows.push([
      Markup.button.callback(
        `${isHidden ? "🔴" : "🟢"} ${cat.slice(0, 30)}`,
        `svctog:${id}`,
      ),
    ]);
  }
  const nav: ReturnType<typeof Markup.button.callback>[] = [];
  if (page > 0) nav.push(Markup.button.callback("⬅️", `svcpage:${page - 1}`));
  nav.push(Markup.button.callback(`${page + 1}/${total || 1}`, "noop"));
  if (page < total - 1) nav.push(Markup.button.callback("➡️", `svcpage:${page + 1}`));
  rows.push(nav);
  return Markup.inlineKeyboard(rows);
}
