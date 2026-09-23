# Konfigurationsfiler

Den fullständiga guiden för ändringar, generering, migrationer och verifiering finns i [Konfiguration](../docs/CONFIGURATION.md). Aktuella värden finns i filerna; funktionsdokumenten beskriver deras betydelse.

| Fil | Ansvar |
| --- | --- |
| `gameplay.json` | Resurser, progression, strid, resor, kataloger och spelgränser som delas av SQL och app |
| `frontend.json` | Metadata, språkformat, uppdateringsintervall, timeout, dag/natt och brytpunkter |
| `auth.json` | Gränser för e-post, lösenord och återställning |
| `server.json` | Lokal drift, portar, databasåterförsök och testfönster |
| `testing.json` | Testwebbläsare, parallellitet och tidsgränser |
| `theme.css` | Färger, typsnitt, bilder och layoutvariabler |
| `interface.css.template` | Gränssnittets CSS med configstyrda brytpunkter |
| `supabase.toml` | Mall för lokal Supabase-konfiguration |
| `next.ts` | Next.js-inställningar och HTTP-säkerhetsheaders |
| `schema.json` | Tillåtna fält, typer och värdegränser |

Hemligheter och miljöanslutningar hör hemma i ignorerad `.env.local` eller driftmiljön.
Adminhanterade items och loot är databasägt innehåll; se [Admin](../docs/ADMIN_PANEL.md) och [Loot tables](../docs/LOOT_TABLES.md).
