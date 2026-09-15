# Card Games PWA

A small, clean, installable collection of card games (Klondike Solitaire and
Blackjack), built as a Progressive Web App. Game stats are stored locally and
backed up per device to DynamoDB.

- **Frontend:** Vite + React + TypeScript, `vite-plugin-pwa` (installable, offline).
- **Backend:** AWS CDK — DynamoDB + Lambda + HTTP API for stats backup.
- **Hosting:** S3 + CloudFront (via CDK).
- **CI/CD:** GitHub Actions deploys backend then frontend on push to `main`.

## Local development

```bash
npm install
npm run dev            # http://localhost:5173
npm run dev -- --host  # to open on a phone on the same network
```

Cloud backup is optional locally. To enable it, copy `.env.example` to `.env`
and set `VITE_API_BASE_URL` to the deployed API URL. Without it, stats are
saved on-device only.

```bash
npm run build          # production build (also typechecks)
npm run preview        # serve the production build locally
```

## Project layout

```
src/
  lib/cards.ts              shared deck model + shuffle
  lib/device.ts             anonymous device id (localStorage)
  lib/stats/                local-first profile store + cloud sync
  components/PlayingCard    shared card renderer
  screens/                  Home, Stats & Settings
  games/
    solitaire/{logic,SolitaireScreen}
    blackjack/{logic,BlackjackScreen}
infra/                      AWS CDK app (backend + hosting stacks)
.github/workflows/deploy.yml  CI/CD pipeline
```

## Deployment

Deployment runs automatically via GitHub Actions on every push to `main`.
See [DEPLOYMENT.md](./DEPLOYMENT.md) for the one-time setup (AWS credentials,
CDK bootstrap) and how the pipeline works.

## Adding a game

1. Create `src/games/<game>/` with a `logic.ts` (pure) and a `<Game>Screen.tsx`.
2. Add a route in `src/main.tsx`.
3. Add an entry to the `GAMES` array in `src/screens/Home.tsx`.
4. (Optional) Add stat fields in `src/lib/stats/types.ts` and a recorder in
   `src/lib/stats/useProfile.ts`.
