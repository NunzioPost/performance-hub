# Deploy Production: Vercel + Railway + Supabase

Questa guida e' pensata per `performance-hub` (monorepo con `frontend/` e `backend/`).

## 1) Prerequisiti

1. Repository su GitHub.
2. Account attivi:
- Vercel
- Railway
- Supabase

## 2) Supabase (Database)

1. Crea un nuovo progetto Supabase.
2. Vai su `Project Settings -> Database -> Connection string`.
3. Copia la stringa in formato URI (transaction pooler o direct, entrambi ok).
4. Tienila per `DATABASE_URL` su Railway.

Valori consigliati backend:
- `DATABASE_SSL=require`
- `CONFIG_STORAGE=db`
- `SIDIAL_PERSISTENCE=db`
- `MARKETING_PERSISTENCE=db`

## 3) Railway (Backend)

### 3.1 Crea servizio backend

1. `New Project -> Deploy from GitHub repo`.
2. Seleziona questo repository.
3. Nel servizio, imposta **Root Directory**: `backend`.
4. Build command: `npm install`
5. Start command: `npm run db:migrate && npm start`

### 3.2 Variabili ambiente Railway

Inserisci in Railway (Service -> Variables):

- `NODE_ENV=production`
- `PORT=3001`
- `FRONTEND_URL=https://<tuo-frontend>.vercel.app`
- `DATABASE_URL=<connection-string-supabase>`
- `DATABASE_SSL=require`

- `CONFIG_STORAGE=db`
- `SIDIAL_PERSISTENCE=db`
- `MARKETING_PERSISTENCE=db`

- `SIDIAL_BASE_URL=https://mediacom.sidial.cloud/api.php`
- `SIDIAL_API_TOKEN=<tuo-token>`

- `META_APP_ID=<...>`
- `META_APP_SECRET=<...>`
- `META_ACCESS_TOKEN=<...>`
- `META_AD_ACCOUNT_ID=act_<...>`

- `GOOGLE_CLIENT_ID=<...>`
- `GOOGLE_CLIENT_SECRET=<...>`
- `GOOGLE_REFRESH_TOKEN=<...>`
- `GOOGLE_DEVELOPER_TOKEN=<...>`
- `GOOGLE_CUSTOMER_ID=<senza-trattini>`
- `GOOGLE_LOGIN_CUSTOMER_ID=<MCC-senza-trattini>`

- `AUTO_ENRICH_ENABLED=true`
- `AUTO_ENRICH_INTERVAL_MINUTES=18`
- `SIDIAL_WARMUP_ENABLED=true`
- `SIDIAL_WARMUP_INTERVAL_MINUTES=18`
- `MARKETING_WARMUP_ENABLED=true`
- `MARKETING_WARMUP_INTERVAL_MINUTES=15`

### 3.3 Dominio backend / URL pubblico

Dopo il deploy Railway, copia la URL pubblica backend, es:
`https://performance-hub-backend.up.railway.app`

Healthcheck:
`https://performance-hub-backend.up.railway.app/api/health`

## 4) Vercel (Frontend)

### 4.1 Crea progetto frontend

1. `Add New -> Project` su Vercel.
2. Importa lo stesso repository.
3. Imposta **Root Directory**: `frontend`.
4. Framework: Vite (auto).

### 4.2 Variabili ambiente Vercel

In `Project Settings -> Environment Variables`:

- `VITE_API_BASE_URL=https://performance-hub-backend.up.railway.app/api`

Redeploy dopo averla inserita.

## 5) Ordine corretto di avvio

1. Deploy backend Railway.
2. Verifica `/api/health`.
3. Deploy frontend Vercel con `VITE_API_BASE_URL` puntato al backend Railway.
4. Aggiorna `FRONTEND_URL` su Railway con URL Vercel finale.
5. Redeploy backend.

## 6) Verifiche finali

1. Dashboard apre senza errori CORS.
2. `/api/meta/token-status` risponde dal frontend.
3. Sezione ordini mostra `Ultimo sync ordini` aggiornato.
4. Dopo ~18 minuti verifica auto-update ordini/dettagli.

## 7) Zero-manuale (quasi)

La creazione risorse cloud (Vercel/Railway/Supabase) resta manuale per autorizzazioni account.
Nel codice, il progetto e' gia' predisposto per:
- migrazioni automatiche a start backend (`npm run db:migrate && npm start`)
- auto-refresh scheduler lato server
- frontend che usa `VITE_API_BASE_URL` in produzione

