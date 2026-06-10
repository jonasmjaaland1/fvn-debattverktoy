# FVN Debatt Plan3 Auth på Vercel

Dette er en Vercel-klar variant av Plan3-auth-backenden.

## Hvorfor Vercel her?

Vercel Functions støtter Node.js-funksjoner direkte fra `/api`-mappen. Det passer godt for denne lille auth-backenden fordi vi ikke trenger en langkjørende Express-server.

## Endepunkter

- `GET /auth/login` - redirecter til Plan3-login
- `GET /healthz` - health check
- `GET /api/auth/callback` - tar imot Plan3-token, verifiserer og setter HttpOnly cookie
- `GET /api/auth/logout` - tømmer innloggingscookie
- `GET /api/me` - krever `Authorization: Bearer <token>`
- `GET /api/auth/session` - krever `Authorization: Bearer <token>`
- `GET /api/status` - viser innlogget bruker og om Supabase/Outlook er konfigurert
- `GET /api/mail/latest` - forhåndsviser siste e-poster fra Outlook
- `POST /api/mail/import` - importerer e-poster fra Outlook til Supabase
- `POST /api/fvn/import` - henter ferske FVN-saker fra RSS/sitemap til Supabase
- `GET /api/fvn/latest` - viser lagrede FVN-saker
- `GET /api/debate/list` - lister lagrede innlegg
- `POST /api/debate/manual` - lagrer et manuelt testinnlegg
- `POST /api/debate/evaluate` - kjører vurderingsmodellen på et innlegg
- `GET /api/debate/top` - viser høyest vurderte innlegg sortert etter score
- `POST /api/debate/update` - oppdaterer status/notater

`/auth/login` og `/healthz` er rewrites i `vercel.json` til Vercel Functions under `/api`.

## Miljøvariabler i Vercel

Legg inn disse under Project Settings -> Environment Variables:

```bash
AUTH_VERIFY_TIMEOUT_MS=5000
PLAN3_LOGIN_URL=https://micro.fvn.no/plan3Auth/login
PLAN3_VERIFY_URL=https://micro.fvn.no/plan3Auth/verify
```

Supabase:

```bash
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxx
```

Microsoft Graph/Outlook:

```bash
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
OUTLOOK_MAILBOX=debatt@example.no
OUTLOOK_FOLDER=inbox
```

Valgfritt, men anbefalt i production:

```bash
DEPLOYED_APP_URL=https://debattverktoy.dittdomene.no
ALLOWED_REDIRECT_ORIGINS=https://debattverktoy.dittdomene.no
```

`/auth/login` bruker vanligvis URL-en requesten kom inn på, slik at Vercel preview/prod/custom domain fungerer uten at callback peker til en gammel deployment-URL. Plan3 sendes tilbake til `/api/auth/callback`, som setter en sikker `HttpOnly` cookie og sender brukeren videre til forsiden uten token i adressefeltet.

Etter callback kan API-et brukes med cookie i nettleseren eller med `Authorization: Bearer <token>` fra tekniske klienter.

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

Kjør SQL-filen `supabase/schema.sql` i Supabase SQL Editor før du setter appen i bruk.

## Microsoft Graph

Outlook-integrasjonen bruker Microsoft Graph med client credentials og read-only henting av meldinger:

- app registration i Microsoft Entra
- application permission for mail-lesing
- admin consent
- tilgang begrenset til debattpostkassen med Exchange Online RBAC for Applications

Appen gjør ikke endringer i Outlook. Den henter meldinger og lagrer kopier/metadata i Supabase.

## FVN-saker

Appen kan hente ferske FVN-saker automatisk. Den bruker FVNs RSS og sitemaps til å finne saker, og forsøker deretter å hente artikkelsiden for tittel, ingress og brødtekst. Sakene lagres i `fvn_recent_stories`, og vurderingsmodellen bruker dem til å score `FVN-kobling`.

I webgrensesnittet: klikk `Hent FVN-saker siste 14 dager` før du kjører vurdering av innlegg.

API:

```bash
POST /api/fvn/import?days=14&limit=120
GET /api/fvn/latest?limit=20
```

`limit` er hvor mange ferske kandidater som sjekkes i én kjøring. Bruk lavere tall for rask test og høyere tall for bredere dekning.

## Strengere debattvurdering

Vurderingen er laget for å være en redaksjonell førsteutsiling, ikke en publiseringsbeslutning. Den bruker disse portene:

- Kandidater må ha høy samlet score, lokal/regional relevans, offentlig interesse, akseptabel lengde og ryddig språk/struktur.
- Tekster uten tydelig lokal/regional forankring skal normalt ikke bli kandidat selv om de er velskrevne.
- Tekster som er for korte, svært lange, har vedlegg, mangler avsender-e-post eller inneholder mulige personangrep/udokumenterte beskyldninger flagges til manuell vurdering.
- Vurderingen forsøker å fjerne sitert e-posttråd, videresendingshoder og redaksjonelle svar før scoring.
- Topplisten prioriterer først redaksjonell status (`Kandidat`, deretter `Trenger redigering`), så score og faktisk mottakstidspunkt (`received_at`).

Scoringen bygger på kriteriene aktualitet, FVN-kobling, flere sider av saken, lokal/regional relevans, miks/stemme, offentlig relevans og språk/personlig stemme.

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

Forventet: `302` redirect til Plan3-login med `/api/auth/callback` som returadresse.

Med ekte token:

```bash
curl -i https://debattverktoy.dittdomene.no/api/me \
  -H "Authorization: Bearer <ekte-token>"
```

Forventet: `200` med begrenset brukerinfo.

Etter vanlig nettleserinnlogging via `/auth/login` skal `/api/me` også fungere i nettleseren fordi cookien sendes automatisk. Direkte fra terminal uten cookie får du fortsatt `401`.
