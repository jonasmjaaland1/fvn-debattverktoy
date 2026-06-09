# FVN Debatt Plan3 Auth på Vercel

Dette er en Vercel-klar variant av Plan3-auth-backenden.

## Hvorfor Vercel her?

Vercel Functions støtter Node.js-funksjoner direkte fra `/api`-mappen. Det passer godt for denne lille auth-backenden fordi vi ikke trenger en langkjørende Express-server.

## Endepunkter

- `GET /auth/login` - redirecter til Plan3-login
- `GET /healthz` - health check
- `GET /api/me` - krever `Authorization: Bearer <token>`
- `GET /api/auth/session` - krever `Authorization: Bearer <token>`

`/auth/login` og `/healthz` er rewrites i `vercel.json` til Vercel Functions under `/api`.

## Miljøvariabler i Vercel

Legg inn disse under Project Settings -> Environment Variables:

```bash
DEPLOYED_APP_URL=https://debattverktoy.dittdomene.no
ALLOWED_REDIRECT_ORIGINS=https://debattverktoy.dittdomene.no
AUTH_VERIFY_TIMEOUT_MS=5000
PLAN3_LOGIN_URL=https://micro.fvn.no/plan3Auth/login
PLAN3_VERIFY_URL=https://micro.fvn.no/plan3Auth/verify
```

For staging/preview kan `DEPLOYED_APP_URL` og `ALLOWED_REDIRECT_ORIGINS` settes til staging-URL-en.

## Deploy

Fra denne mappen:

```bash
vercel
vercel --prod
```

Alternativt:

1. Opprett et GitHub-repo med innholdet i denne mappen.
2. Importer repoet i Vercel.
3. Legg inn miljøvariablene.
4. Deploy.

## Domene

Anbefalt domenevalg for pilot:

- `debattverktoy.fvn.no` hvis dere kan få et subdomene under FVN.
- `fvn-debatt.no` eller lignende bare hvis dere trenger et separat domene raskt.

Et FVN-subdomene er best for tillit, cookies, branding og intern drift. Vercel kan håndtere custom domains og SSL automatisk når DNS er satt riktig.

## Supabase

Supabase trengs ikke for selve Plan3-verifiseringen. Bruk Supabase når dere vil lagre:

- innhentede e-poster eller metadata
- vurderinger av leserinnlegg
- redaktørnotater
- status: ny, vurdert, klar, avvist, publisert
- revisjonshistorikk
- koblinger til FVN-saker

Velg europeisk region for Supabase-prosjektet, helst Frankfurt/Europe, siden dette er redaksjonelle data og brukerne er i Norge.

## Smoke-test

Etter deploy:

```bash
curl -i https://debattverktoy.dittdomene.no/healthz
```

Forventet: `200` og `{ "ok": true }`.

```bash
curl -i https://debattverktoy.dittdomene.no/api/me
```

Forventet: `401` og `missing authorization`.

```bash
curl -i "https://debattverktoy.dittdomene.no/api/me?token=test"
```

Forventet: `400` og `token query parameter is not accepted`.

```bash
curl -i https://debattverktoy.dittdomene.no/auth/login
```

Forventet: `302` redirect til Plan3-login.

Med ekte token:

```bash
curl -i https://debattverktoy.dittdomene.no/api/me \
  -H "Authorization: Bearer <ekte-token>"
```

Forventet: `200` med begrenset brukerinfo.

