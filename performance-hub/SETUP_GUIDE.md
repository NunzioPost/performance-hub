# Performance Hub - Setup Guide

## 1) Backend env
Copia `.env.example` in `.env` dentro `backend/` e compila i token:

- `SIDIAL_API_TOKEN`
- `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_CUSTOMER_ID`
- Job auto contratti: `AUTO_ENRICH_*` (default: ogni 18 minuti)

## 2) Database locale (PostgreSQL)
Da root progetto:

```bash
docker compose up -d postgres
```

Poi nel backend:

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed:config
```

Per usare subito il DB come sorgente configurazione clienti/campagne:

```env
CONFIG_STORAGE=db
DATABASE_URL=postgresql://performance_hub:performance_hub@localhost:15432/performance_hub
DATABASE_SSL=disable
SIDIAL_PERSISTENCE=db
SIDIAL_SYNC_INTERVAL_MINUTES=18
SIDIAL_WARMUP_ENABLED=true
SIDIAL_WARMUP_INTERVAL_MINUTES=18
MARKETING_PERSISTENCE=db
MARKETING_SYNC_INTERVAL_MINUTES=15
MARKETING_WARMUP_ENABLED=true
MARKETING_WARMUP_INTERVAL_MINUTES=15
```

Se `CONFIG_STORAGE=file`, continua a usare `backend/data/campaign-config.json`.

Con `SIDIAL_PERSISTENCE=db`:

- le chiamate SIDIAL vengono salvate su PostgreSQL (`sidial_leads`, `sidial_orders`, `sidial_order_details`)
- le richieste successive leggono dal DB
- refresh da SIDIAL avviene quando il range non e sincronizzato oppure quando il range include oggi e l'ultimo sync supera `SIDIAL_SYNC_INTERVAL_MINUTES`
- warmup automatico della giornata corrente (lead google/meta + ordini) ogni `SIDIAL_WARMUP_INTERVAL_MINUTES`

Con `MARKETING_PERSISTENCE=db`:

- le insights Meta/Google vengono salvate su PostgreSQL (`marketing_insights_cache`, `marketing_daily_snapshots`)
- fallback automatico su cache DB se API Meta/Google non rispondono
- refresh da API live solo se range non sincronizzato o se include oggi e supera `MARKETING_SYNC_INTERVAL_MINUTES`
- warmup automatico giornaliero Meta/Google ogni `MARKETING_WARMUP_INTERVAL_MINUTES`

## 3) Google refresh token
Avvia il backend e apri:

- `http://localhost:3001/oauth/google/start`

Dopo il consenso Google, copia il valore mostrato e impostalo in `.env` come `GOOGLE_REFRESH_TOKEN`.

## 4) Avvio
Da root progetto:

```bash
npm run dev:full
```

In alternativa manuale su due terminali:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

## 5) Verifica
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`

## 6) Auto aggiornamento contratti
Il backend avvia un job automatico che ogni 18 minuti:

1. scarica gli ordini recenti da Sidial
2. arricchisce automaticamente i dettagli ordine
3. aggiorna il mapping brand/fonte usato in dashboard

Parametri in `backend/.env`:

- `AUTO_ENRICH_ENABLED=true`
- `AUTO_ENRICH_INTERVAL_MINUTES=18`
- `AUTO_ENRICH_DAYS_BACK=3`
- `AUTO_ENRICH_MAX_ORDERS=200`
- `AUTO_ENRICH_START_DELAY_SECONDS=45`

## 7) Clienti e campagne dinamiche
La configurazione clienti/campagne e centralizzata e puo vivere su:

- file: `backend/data/campaign-config.json`
- db: tabelle `config_*` in PostgreSQL

Gestione da UI in **Impostazioni > Clienti e Campagne** oppure via API:

- `GET /api/config/campaigns`
- `PUT /api/config/campaigns`

La config governa:

- gerarchia `cliente -> campagna CRM`
- mapping lead SIDIAL (`sidial.leadMappings`)
- mapping ordini SIDIAL su lista dettagli (`sidial.orderListMappings`)
- regole di attribuzione Meta (`meta.attributionRules`)
- regole di attribuzione Google (`google.attributionRules`)
- futura ingestione lead diretta su DB (`allowInternalLeads` per campagna)

Regole supportate per Meta/Google:

- `matchType: "contains" | "equals" | "regex"`
- `matchValue`: pattern su nome campagna ads

Per naming convention puoi usare ad esempio:

- `matchType: "contains"`, `matchValue: "wind fibra"`
- `matchType: "regex"`, `matchValue: "^WIND\\s*\\|\\s*FIBRA\\s*\\|\\s*(META|GOOGLE)$"`

## 8) Migrazione futura a Supabase
Supabase usa PostgreSQL, quindi il passaggio e diretto:

1. crea progetto Supabase
2. copia la connection string PostgreSQL in `DATABASE_URL`
3. imposta `DATABASE_SSL=require`
4. esegui `npm run db:migrate`
5. opzionale: `npm run db:seed:config`
