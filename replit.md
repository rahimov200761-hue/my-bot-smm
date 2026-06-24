# SMM Bot (Telegram)

Telegram orqali Stars, Premium va nakrutka xizmatlarini sotadigan bot. To'lov kartaga unikal summa usuli bilan amalga oshiriladi, admin tasdiqlaydi.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Telegram bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `BOT_TOKEN` — Telegram bot token
- Required env: `SMM_API_KEY` — smmmain.com API key
- Required env: `ADMIN_ID` — Admin Telegram ID

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Bot: Telegraf 4
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- SMM: smmmain.com API

## Where things live

- DB schema: `lib/db/src/schema/` — users, orders, cards
- Bot logic: `artifacts/api-server/src/bot/index.ts`
- Prices & services: `artifacts/api-server/src/bot/prices.ts`
- SMM API client: `artifacts/api-server/src/bot/smm-api.ts`
- Keyboards: `artifacts/api-server/src/bot/keyboards.ts`

## Architecture decisions

- Bot and Express server run in the same process (api-server artifact)
- Payment verification uses unique amounts (+1 to +99 som extra) per order
- Admin confirms each payment via inline buttons in Telegram
- Cards stored in DB — admin sets via bot `/admin` → "💳 Karta sozlash"
- SMM orders auto-placed via smmmain.com API after payment confirmation

## Product

- ⭐ Stars sotish: min 50 ta, 200 so'm/ta, auto-narx hisoblash
- 💎 Premium 30 kun: 75 000 so'm
- 📊 Nakrutka: obunachilar (15 so'm), ko'rishlar (3 so'm), layklar (10 so'm)
- 💳 To'lov: kartaga unikal summa (maslan 10 023 so'm)
- 👨‍💼 Admin panel: `/admin` buyrug'i orqali

## User preferences

- Uzbek tilida bot
- Unikal summalar bilan to'lovni avtomatik aniqlash
- Admin Telegram paneli orqali boshqaradi

## Gotchas

- After schema changes: run `pnpm --filter @workspace/db run push`
- After adding new tables: run `pnpm run typecheck:libs` to rebuild declarations
- Bot starts alongside the Express server in `artifacts/api-server/src/index.ts`
- Admin karta qo'shmasdan bot to'lov qabul qilmaydi — avval `/admin` → "💳 Karta sozlash"

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
