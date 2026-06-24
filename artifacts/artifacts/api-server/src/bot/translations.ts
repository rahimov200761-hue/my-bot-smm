export type Lang = "uz" | "ru" | "en";

export const langName: Record<Lang, string> = {
  uz: "🇺🇿 O'zbekcha",
  ru: "🇷🇺 Русский",
  en: "🇬🇧 English",
};

export const T: Record<Lang, {
  welcome: (name: string) => string;
  chooseService: string;
  starsTitle: string;
  starsDesc: (min: number, price: number) => string;
  starsAsk: string;
  premiumTitle: string;
  premiumDesc: (price: string) => string;
  premiumAsk: string;
  nakrutkaTitle: string;
  nakrutkaDesc: string;
  balanceTitle: (bal: string) => string;
  balanceFill: string;
  balanceAsk: string;
  balanceMin: string;
  balanceInsufficient: (bal: string, need: string, deficit: string) => string;
  orderSuccess: (id: number, svc: string, qty: number, price: string) => string;
  orderFailed: (reason: string, price: string) => string;
  ordersTitle: string;
  noOrders: string;
  help: string;
  linkAsk: string;
  qtyAsk: (min: number, max: number) => string;
  qtyMin: (min: number) => string;
  qtyRange: (min: number, max: number) => string;
  topupSent: (amount: string, unique: string, card: string, holder: string) => string;
  noCard: string;
  back: string;
  backNak: string;
  loading: string;
}> = {
  uz: {
    welcome: (name) =>
      `👋 Xush kelibsiz, <b>${name}</b>!\n\n` +
      `⭐ <b>Stars</b> — sotib olish\n` +
      `💎 <b>Premium</b> — aktivlashtirish\n` +
      `📊 <b>Nakrutka</b> — obunachilar, ko'rishlar\n` +
      `💵 <b>Balans</b> — to'ldiring va xarid qiling\n\n` +
      `Menyudan tanlang 👇`,
    chooseService: "Xizmatni tanlang 👇",
    starsTitle: "⭐ Telegram Stars",
    starsDesc: (min, price) =>
      `📌 Minimal: <b>${min} ta</b>\n💵 Narx: <b>${price} so'm/ta</b>\n\nMisol: 100 ta = ${(price * 100).toLocaleString("uz-UZ")} so'm`,
    starsAsk: "Nechta Stars olmoqchisiz?",
    premiumTitle: "💎 Telegram Premium (30 kun)",
    premiumDesc: (price) => `💵 Narx: <b>${price}</b>`,
    premiumAsk: "Telegram username yoki havolani yuboring:\nMasalan: <code>@username</code>",
    nakrutkaTitle: "📊 Nakrutka xizmatlari",
    nakrutkaDesc: "Bo'limni tanlang 👇",
    balanceTitle: (bal) => `💰 <b>Balansingiz:</b> <b>${bal}</b>`,
    balanceFill: "To'ldirish uchun \"💵 Balans to'ldirish\" tugmasini bosing.",
    balanceAsk: "Qancha so'm to'ldirmoqchisiz?\nMasalan: <code>50000</code>",
    balanceMin: "❌ Minimal 5 000 so'm. Qaytadan kiriting:",
    balanceInsufficient: (bal, need, deficit) =>
      `❌ <b>Hisobingiz yetarli emas!</b>\n\n💰 Balans: <b>${bal}</b>\n💳 Kerak: <b>${need}</b>\n📉 Yetishmaydi: <b>${deficit}</b>\n\nBalansni to'ldiring 👇`,
    orderSuccess: (id, svc, qty, price) =>
      `✅ <b>Buyurtma #${id} muvaffaqiyatli!</b>\n📦 ${svc}\n📊 ${qty.toLocaleString()} ta\n💰 ${price} yechildi`,
    orderFailed: (reason, price) =>
      `❌ <b>Buyurtma amalga oshmadi</b>\nSabab: ${reason}\n💰 ${price} balansingizga qaytarildi`,
    ordersTitle: "📦 <b>So'nggi buyurtmalar:</b>",
    noOrders: "📭 Hali buyurtmalaringiz yo'q.",
    help: "📞 <b>Yordam</b>\n\nAdmin: <b>@isroilovich</b>\n🕐 24/7",
    linkAsk: "Kanal/guruh yoki foydalanuvchi havolasini yuboring:\nMasalan: <code>https://t.me/channel</code>",
    qtyAsk: (min, max) => `Miqdorni kiriting:\n📌 Min: <b>${min.toLocaleString()}</b> | Max: <b>${max.toLocaleString()}</b>`,
    qtyMin: (min) => `❌ Minimal ${min.toLocaleString()} ta. Qaytadan:`,
    qtyRange: (min, max) => `❌ ${min.toLocaleString()} — ${max.toLocaleString()} oralig'ida bo'lishi kerak.`,
    topupSent: (amount, unique, card, holder) =>
      `💵 <b>Balans to'ldirish</b>\n\n` +
      `💰 To'ldiriladigan: ${amount}\n` +
      `💳 <b>Kartaga o'tkazish: ${unique}</b>\n\n` +
      `📌 Karta: <code>${card}</code>\n` +
      `👤 Egasi: <b>${holder}</b>\n\n` +
      `⚠️ Aynan <b>${unique}</b> yuboring!\nAdmin tasdiqlashi bilan balansingiz to'ldiriladi.`,
    noCard: "❌ Hozircha to'lov qabul qilinmayapti.",
    back: "🔙 Orqaga",
    backNak: "🔙 Nakrutka",
    loading: "⏳ Yuklanmoqda...",
  },
  ru: {
    welcome: (name) =>
      `👋 Добро пожаловать, <b>${name}</b>!\n\n` +
      `⭐ <b>Stars</b> — купить звёзды\n` +
      `💎 <b>Premium</b> — активировать\n` +
      `📊 <b>Накрутка</b> — подписчики, просмотры\n` +
      `💵 <b>Баланс</b> — пополните и покупайте\n\n` +
      `Выберите из меню 👇`,
    chooseService: "Выберите услугу 👇",
    starsTitle: "⭐ Telegram Stars",
    starsDesc: (min, price) =>
      `📌 Минимум: <b>${min} шт</b>\n💵 Цена: <b>${price} сум/шт</b>\n\nПример: 100 шт = ${(price * 100).toLocaleString("ru-RU")} сум`,
    starsAsk: "Сколько Stars хотите купить?",
    premiumTitle: "💎 Telegram Premium (30 дней)",
    premiumDesc: (price) => `💵 Цена: <b>${price}</b>`,
    premiumAsk: "Отправьте Telegram username или ссылку:\nНапример: <code>@username</code>",
    nakrutkaTitle: "📊 Услуги накрутки",
    nakrutkaDesc: "Выберите раздел 👇",
    balanceTitle: (bal) => `💰 <b>Ваш баланс:</b> <b>${bal}</b>`,
    balanceFill: "Для пополнения нажмите «💵 Пополнить баланс».",
    balanceAsk: "Сколько сум пополнить?\nНапример: <code>50000</code>",
    balanceMin: "❌ Минимум 5 000 сум. Повторите:",
    balanceInsufficient: (bal, need, deficit) =>
      `❌ <b>Недостаточно средств!</b>\n\n💰 Баланс: <b>${bal}</b>\n💳 Нужно: <b>${need}</b>\n📉 Не хватает: <b>${deficit}</b>\n\nПополните баланс 👇`,
    orderSuccess: (id, svc, qty, price) =>
      `✅ <b>Заказ #${id} принят!</b>\n📦 ${svc}\n📊 ${qty.toLocaleString()} шт\n💰 ${price} списано`,
    orderFailed: (reason, price) =>
      `❌ <b>Заказ не выполнен</b>\nПричина: ${reason}\n💰 ${price} возвращено на баланс`,
    ordersTitle: "📦 <b>Последние заказы:</b>",
    noOrders: "📭 У вас пока нет заказов.",
    help: "📞 <b>Помощь</b>\n\nАдмин: <b>@isroilovich</b>\n🕐 24/7",
    linkAsk: "Отправьте ссылку на канал/группу или пользователя:\nНапример: <code>https://t.me/channel</code>",
    qtyAsk: (min, max) => `Введите количество:\n📌 Мин: <b>${min.toLocaleString()}</b> | Макс: <b>${max.toLocaleString()}</b>`,
    qtyMin: (min) => `❌ Минимум ${min.toLocaleString()} шт. Повторите:`,
    qtyRange: (min, max) => `❌ Должно быть от ${min.toLocaleString()} до ${max.toLocaleString()}.`,
    topupSent: (amount, unique, card, holder) =>
      `💵 <b>Пополнение баланса</b>\n\n` +
      `💰 Сумма: ${amount}\n` +
      `💳 <b>Перевести на карту: ${unique}</b>\n\n` +
      `📌 Карта: <code>${card}</code>\n` +
      `👤 Владелец: <b>${holder}</b>\n\n` +
      `⚠️ Переведите ровно <b>${unique}</b>!\nПосле подтверждения администратором баланс будет зачислен.`,
    noCard: "❌ Приём платежей временно недоступен.",
    back: "🔙 Назад",
    backNak: "🔙 Накрутка",
    loading: "⏳ Загрузка...",
  },
  en: {
    welcome: (name) =>
      `👋 Welcome, <b>${name}</b>!\n\n` +
      `⭐ <b>Stars</b> — buy Telegram Stars\n` +
      `💎 <b>Premium</b> — activate Premium\n` +
      `📊 <b>Nakrutka</b> — followers, views\n` +
      `💵 <b>Balance</b> — top up and order\n\n` +
      `Choose from the menu 👇`,
    chooseService: "Choose a service 👇",
    starsTitle: "⭐ Telegram Stars",
    starsDesc: (min, price) =>
      `📌 Minimum: <b>${min} pcs</b>\n💵 Price: <b>${price} sum/pc</b>\n\nExample: 100 pcs = ${(price * 100).toLocaleString()} sum`,
    starsAsk: "How many Stars do you want?",
    premiumTitle: "💎 Telegram Premium (30 days)",
    premiumDesc: (price) => `💵 Price: <b>${price}</b>`,
    premiumAsk: "Send your Telegram username or link:\nExample: <code>@username</code>",
    nakrutkaTitle: "📊 SMM Services",
    nakrutkaDesc: "Choose a section 👇",
    balanceTitle: (bal) => `💰 <b>Your balance:</b> <b>${bal}</b>`,
    balanceFill: "Press «💵 Top Up Balance» to add funds.",
    balanceAsk: "How much would you like to top up?\nExample: <code>50000</code>",
    balanceMin: "❌ Minimum 5 000 sum. Try again:",
    balanceInsufficient: (bal, need, deficit) =>
      `❌ <b>Insufficient balance!</b>\n\n💰 Balance: <b>${bal}</b>\n💳 Required: <b>${need}</b>\n📉 Missing: <b>${deficit}</b>\n\nTop up your balance 👇`,
    orderSuccess: (id, svc, qty, price) =>
      `✅ <b>Order #${id} placed!</b>\n📦 ${svc}\n📊 ${qty.toLocaleString()} pcs\n💰 ${price} deducted`,
    orderFailed: (reason, price) =>
      `❌ <b>Order failed</b>\nReason: ${reason}\n💰 ${price} refunded to your balance`,
    ordersTitle: "📦 <b>Recent orders:</b>",
    noOrders: "📭 You have no orders yet.",
    help: "📞 <b>Support</b>\n\nAdmin: <b>@isroilovich</b>\n🕐 24/7",
    linkAsk: "Send the channel/group or user link:\nExample: <code>https://t.me/channel</code>",
    qtyAsk: (min, max) => `Enter quantity:\n📌 Min: <b>${min.toLocaleString()}</b> | Max: <b>${max.toLocaleString()}</b>`,
    qtyMin: (min) => `❌ Minimum ${min.toLocaleString()} pcs. Try again:`,
    qtyRange: (min, max) => `❌ Must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`,
    topupSent: (amount, unique, card, holder) =>
      `💵 <b>Balance Top Up</b>\n\n` +
      `💰 Amount: ${amount}\n` +
      `💳 <b>Transfer exactly: ${unique}</b>\n\n` +
      `📌 Card: <code>${card}</code>\n` +
      `👤 Holder: <b>${holder}</b>\n\n` +
      `⚠️ Send exactly <b>${unique}</b>!\nBalance will be added after admin confirmation.`,
    noCard: "❌ Payments are temporarily unavailable.",
    back: "🔙 Back",
    backNak: "🔙 Services",
    loading: "⏳ Loading...",
  },
};
