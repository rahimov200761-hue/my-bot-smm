import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { autoConfirmByAmount } from "../bot";

const router = Router();

// POST /api/pay
// Body: { amount: number, secret: string }
// SMS forwarding apps can hit this endpoint to auto-confirm payments
router.post("/pay", async (req, res) => {
  try {
    const { amount, secret } = req.body as { amount?: number; secret?: string };
    // Verify secret
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "webhook_secret")).limit(1);
    const storedSecret = rows[0]?.value;
    if (storedSecret && secret !== storedSecret) {
      res.status(403).json({ ok: false, error: "Invalid secret" });
      return;
    }
    if (!amount || isNaN(Number(amount))) {
      res.status(400).json({ ok: false, error: "amount required" });
      return;
    }
    const result = await autoConfirmByAmount(Number(amount));
    res.json({ ok: result.success, message: result.message });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
