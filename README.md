Below is a ready-to-copy `README.md` you can paste into your repository root. It includes neat badges (using shields.io), a place to embed a demo GIF (place the file at `docs/demo.gif` or `frontend/public/demo.gif`), full setup instructions, troubleshooting, and nice sections for contributors.

Copy the entire content below and save it as `README.md` in your repo root.

---

```markdown
# Supply-Chain Anti-Counterfeit with IoT Attestations

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Hardhat](https://img.shields.io/badge/Blockchain-Hardhat-purple)](https://hardhat.org)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js-black)](https://nextjs.org)
[![Demo](https://img.shields.io/badge/Demo-live-gray)](#demo)

> Lightweight hackathon demo that records an immutable chain-of-custody on-chain and anchors IoT sensor readings.  
> Consumer scans a QR → the UI verifies provenance, sensor history and displays a simple trust score.

---

## Demo (gif)

> Add a short demo GIF to the repo (recommended paths: `docs/demo.gif` or `frontend/public/demo.gif`).  
> The embed below expects `docs/demo.gif`. If you place the gif elsewhere, update the path.

![Demo: Verify a Batch](docs/demo.gif)

---

## What is this?

This project demonstrates a simple supply-chain anti-counterfeit proof-of-concept using:
- an on-chain **CustodyRegistry** (Solidity / Hardhat),
- a **Node/Express indexer** that listens for events, stores metadata in SQLite and exposes `/verify/:batchId`,
- a **Next.js frontend** with QR scanning for consumer verification,
- simple simulated IoT sensor anchors (demo script).

It’s built for learning / hackathon demos — **not production**.

---

## Features

- Register product batches on-chain (batch ID + IPFS CID)
- Log custody transfers (manufacturer → distributor → retailer)
- Anchor IoT sensor reading hashes on-chain (signed by devices)
- Store raw payloads in indexer DB for UI display
- Consumer QR scan → shows custody timeline, sensor readings, and risk label
- Demo scripts to simulate the full flow

---

## Repo layout (important)

```

supplychain-hack/
├─ contracts/
│  └─ CustodyRegistry.sol
├─ scripts/
│  ├─ demoFlow\.js
│  ├─ print\_handoffs.js
│  ├─ migrate\_add\_actors\_and\_payload\_cols.js
│  └─ seed\_actors.js
├─ indexer.js
├─ supplychain.sqlite          # local DB (gitignored)
├─ package.json
├─ .env                       # local env (gitignored)
├─ frontend/                   # Next.js app
│  └─ app/verify/page.tsx
└─ README.md

````

---

## Prerequisites

- Node.js v16+ (v18 or v22 recommended)
- npm
- Git

> Windows users: if PowerShell blocks `npx`, run commands in **CMD** or **Git Bash**.

---

## Quickstart (end-to-end)

Open multiple terminals and follow these steps in order. Commands are shown for Unix/Git Bash and work in Windows CMD too.

### 1. Clone & install

```bash
git clone <your-repo-url>
cd supplychain-hack
npm install
# frontend deps
cd frontend
npm install
cd ..
````

If you see peer dependency errors while installing, try:

```bash
npm install --legacy-peer-deps
```

### 2. Compile contracts

```bash
npx hardhat compile
```

### 3. Start local blockchain (Hardhat node)

Keep this terminal open:

```bash
npx hardhat node
```

### 4. Start indexer (API & DB)

Open a new terminal:

```bash
node indexer.js
```

The indexer will:

* connect to the local node,
* index past events from `START_BLOCK`,
* subscribe to live events,
* expose `GET /verify/:batchId` and `POST /storePayload`.

### 5. Run demo flow (register, anchor, transfer)

In a new terminal:

```bash
npx hardhat run scripts/demoFlow.js --network localhost
```

`demoFlow` will deploy (if needed), register a batch, anchor two sensor readings, transfer custody and POST payloads to the indexer. It prints the `batchId` it used.

### 6. Verify (curl or frontend)

API:

```bash
curl http://localhost:4000/verify/<BATCHID>
```

Frontend:

```bash
cd frontend
npm run dev
# open http://localhost:3000 and go to /verify
```

Scan the QR or paste the `batchId`. The UI shows custody timeline, sensor readings, and a risk badge.

---

## `.env` example (DO NOT COMMIT)

Create `.env` in the project root:

```
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=        # leave empty to let demoFlow deploy
ARTIFACT_PATH=./artifacts/contracts/CustodyRegistry.sol/CustodyRegistry.json
DB_PATH=./supplychain.sqlite
START_BLOCK=0
PORT=4000
```

---

## Useful scripts

* `npx hardhat compile` — compile contracts
* `npx hardhat node` — start local chain
* `npx hardhat run scripts/demoFlow.js --network localhost` — run demo flow
* `node indexer.js` — start indexer & API
* `node scripts/print_handoffs.js` — print handoffs from DB
* `node scripts/migrate_add_actors_and_payload_cols.js` — add actors/payload columns
* `node scripts/seed_actors.js` — seed friendly names

---

## Recommended `.gitignore`

Create `.gitignore` at the repo root with:

```
# Node & build
node_modules/
dist/
build/
.next/
out/

# Hardhat artifacts
artifacts/
cache/
typechain/

# Env & DB
.env
.env.*
*.sqlite
*.sqlite-journal
supplychain.sqlite

# OS & editor
.DS_Store
Thumbs.db
.vscode/
.idea/
```

---

## Troubleshooting

* **embedded git repo: frontend**
  If `frontend/` contains its own `.git` (nested repo), either remove `frontend/.git` to make it part of the mono-repo or add the frontend as a submodule.

* **Indexer says "No custody transfers recorded"**
  Ensure the indexer was running when demoFlow executed. If not, restart indexer and re-run demoFlow, or delete `supplychain.sqlite` and start indexer to re-index from block 0.

* **Timestamps look wrong (1970)**
  Raw payload `ts` may be in milliseconds while on-chain timestamps are seconds. The UI handles both by normalizing to milliseconds.

* **QR camera keeps scanning in a loop**
  The frontend stops the camera on the first successful scan; ensure your browser grants camera permission and that the page code is the updated version.

* **`Cannot find module artifacts/...`**
  Run `npx hardhat compile` from repo root so artifacts exist.

---

## Data model (short)

* `batches`: `{ batch_id, ipfs_cid, manufacturer, created_at }`
* `handoffs`: `{ id, batch_id, from_addr, to_addr, time }` (time = unix seconds)
* `sensors`: `{ id, batch_id, reading_hash, signer, time, raw_payload, tempC, payload_ts, nonce }`
* `actors` (off-chain): `{ address, name, role }` — used for friendly names in UI

---

## Security notes & caveats

* Demo only — **not production**.
* For production you must:

  * Verify IoT signatures server-side (recover signer on indexer),
  * Add device registration and key management,
  * Harden the indexer and consider decentralised storage for raw payloads (IPFS + pinning),
  * Rotate keys and never commit `.env`.

---

## Contributing

1. Fork the repo.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Make changes, commit and push your branch.
4. Open a Pull Request describing your changes.

---

## License

MIT — add a `LICENSE` file if you want to publish under the MIT license.

---

## Acknowledgements

Built as a hackathon / demo project. Uses Hardhat, Ethers, @zxing/browser, Express and SQLite.

---

If you'd like, I can also:

* add a short `CONTRIBUTING.md` and `CODE_OF_CONDUCT`,
* generate a polished `LICENSE` file (MIT),
* or produce a small demo GIF for you (I can provide a script to record a demo flow if you want to create one).

```

--- 

If you want, I can now:
- create a `LICENSE` file (MIT) for you,
- generate a `CONTRIBUTING.md`, or
- produce a small `fix_git.ps1` / `fix_git.sh` script to remove nested `.git` and apply `.gitignore` automatically.

Which would you like next?
```
