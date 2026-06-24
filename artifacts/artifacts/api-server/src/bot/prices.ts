export const SERVICES = {
  stars: {
    name: "⭐ Telegram Stars",
    pricePerUnit: 200,
    minQty: 50,
    unit: "ta Stars",
    smmServiceId: null as string | null,
  },
  premium30: {
    name: "💎 Telegram Premium (30 kun)",
    price: 75000,
    unit: "oy",
    smmServiceId: null as string | null,
  },
  premium90: {
    name: "💎 Telegram Premium (3 oy)",
    price: 155000,
    unit: "oy",
    smmServiceId: null as string | null,
  },
  premium180: {
    name: "💎 Telegram Premium (6 oy)",
    price: 200000,
    unit: "oy",
    smmServiceId: null as string | null,
  },
  premium365: {
    name: "💎 Telegram Premium (12 oy)",
    price: 380000,
    unit: "oy",
    smmServiceId: null as string | null,
  },
};

export type ServiceKey = keyof typeof SERVICES;

export function calcPrice(serviceKey: ServiceKey, qty: number): number {
  const svc = SERVICES[serviceKey];
  if ("price" in svc) return svc.price;
  return svc.pricePerUnit * qty;
}

export function generateUniqueAmount(baseAmount: number): number {
  const extra = Math.floor(Math.random() * 97) + 1;
  return baseAmount + extra;
}

export function formatPrice(amount: number): string {
  return amount.toLocaleString("uz-UZ") + " so'm";
}
