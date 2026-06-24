export interface SessionData {
  step?: string;
  serviceKey?: string;
  quantity?: number;
  link?: string;
  orderId?: number;
  targetUserId?: number;
  // SMM catalog browsing
  smmServiceId?: number;
  smmServiceName?: string;
  smmServiceRate?: string;
  smmServiceMin?: number;
  smmServiceMax?: number;
  smmCategoryIndex?: number;
  smmPage?: number;
}
