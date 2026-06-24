import * as smmApi from "./smm-api";
import { logger } from "../lib/logger";

export interface SmmService {
  service: number;
  name: string;
  type: string;
  rate: string;
  min: number;
  max: number;
  category: string;
  refill: boolean;
  cancel: boolean;
}

let serviceCache: SmmService[] = [];
let categoryMap: Map<string, SmmService[]> = new Map();
let categoryList: string[] = [];
let lastFetched = 0;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export type NakrutkaType = "premium" | "garantli" | "bot" | "oddiy";

export function classifyCategory(categoryName: string): NakrutkaType {
  const c = categoryName.toLowerCase();
  if (c.includes("premium")) return "premium";
  if (
    c.includes("guaranteed") ||
    c.includes("guarantee") ||
    c.includes("refill") ||
    c.includes("kafolat")
  )
    return "garantli";
  if (c.includes("bot")) return "bot";
  return "oddiy";
}

export function getCategoriesByType(type: NakrutkaType): string[] {
  return categoryList.filter((c) => classifyCategory(c) === type);
}

export function getServicesByType(type: NakrutkaType): SmmService[] {
  const cats = getCategoriesByType(type);
  return cats.flatMap((c) => categoryMap.get(c) ?? []);
}

export async function ensureServicesLoaded() {
  if (serviceCache.length > 0 && Date.now() - lastFetched < CACHE_TTL) return;
  try {
    const raw = await smmApi.getServices();
    if (!Array.isArray(raw) || raw.length === 0) return;
    serviceCache = raw as SmmService[];
    categoryMap = new Map();
    for (const svc of serviceCache) {
      if (!categoryMap.has(svc.category)) categoryMap.set(svc.category, []);
      categoryMap.get(svc.category)!.push(svc);
    }
    categoryList = Array.from(categoryMap.keys()).sort();
    lastFetched = Date.now();
    logger.info({ count: serviceCache.length, cats: categoryList.length }, "SMM services loaded");
  } catch (err) {
    logger.error({ err }, "Failed to load SMM services");
  }
}

export function getCategories(): string[] {
  return categoryList;
}

export function getServicesInCategory(catIndex: number): SmmService[] {
  const cat = categoryList[catIndex];
  if (!cat) return [];
  return categoryMap.get(cat) ?? [];
}

export function getServiceById(id: number): SmmService | undefined {
  return serviceCache.find((s) => s.service === id);
}

const USD_RATE = Number(process.env["USD_TO_SOM"] || "12800");

function getMarkupSom(serviceName: string): number {
  const n = serviceName.toLowerCase();
  if (n.includes("premium")) {
    if (n.includes("60") || n.includes("90") || n.includes("180") || n.includes("365")) return 30000;
    if (n.includes("45")) return 25000;
    if (n.includes("30")) return 20000;
    return 15000;
  }
  if (
    n.includes("guaranteed") ||
    n.includes("refill") ||
    n.includes("guarantee") ||
    n.includes("kafolat")
  ) {
    if (n.includes("60") || n.includes("90")) return 25000;
    if (n.includes("45")) return 20000;
    if (n.includes("30")) return 15000;
    if (n.includes("15")) return 10000;
    return 5000;
  }
  return 5000;
}

export function calcSmmPrice(service: SmmService, qty: number): number {
  const rateUsd = parseFloat(service.rate);
  const baseSom = Math.ceil((rateUsd / 1000) * qty * USD_RATE);
  const markup = getMarkupSom(service.name);
  return baseSom + markup;
}

export function formatSmmPriceInfo(service: SmmService): string {
  const rateUsd = parseFloat(service.rate);
  const per1000Som = Math.ceil((rateUsd / 1000) * 1000 * USD_RATE);
  const markup = getMarkupSom(service.name);
  return `${(per1000Som + markup).toLocaleString("uz-UZ")} so'm / 1000 ta`;
}
