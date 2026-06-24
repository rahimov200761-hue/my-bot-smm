import { pgTable, text, serial, bigint, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  serviceType: text("service_type").notNull(),
  serviceName: text("service_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: integer("price").notNull(),
  uniqueAmount: integer("unique_amount").notNull(),
  link: text("link"),
  status: text("status").notNull().default("pending"),
  smmOrderId: text("smm_order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
