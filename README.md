# Supply-Chain Anti-Counterfeit with IoT Attestations

**A lightweight demo/hackathon project** that records a chain-of-custody on-chain (Ethereum / Hardhat) and anchors IoT sensor readings (signed hashes).
Includes: Solidity contract (`CustodyRegistry`), Node indexer + REST API (`indexer.js`) with SQLite, a `demoFlow` script to exercise the system, and a Next.js frontend with QR scanning and verification UI.

This README covers: what it is, architecture, exact files, prerequisites, full commands (Windows & \*nix), `.env` example, how to run everything end-to-end, troubleshooting tips, and suggested next steps.

---

## Quick summary (elevator pitch)

* Manufacturer registers a product batch on-chain.
* IoT devices sign sensor readings; hashes are anchored on-chain and raw payloads are stored in the indexer DB (for UI).
* Each handoff (transfer of custody) is a signed on-chain event.
* Consumer scans product QR → frontend calls indexer API → verifies chain-of-custody, sensor readings, and shows human-friendly labels and risk.

---

## Repo layout (important files)

```
supplychain-hack/
├─ contracts/
│  └─ CustodyRegistry.sol
├─ scripts/
│  ├─ demoFlow.js
│  ├─ inspect_recent_txs.js
│  ├─ migrate_add_actors_and_payload_cols.js
│  ├─ seed_actors.js
│  └─ print_handoffs.js
├─ artifacts/          # Hardhat compiled output (ignored in git)
├─ indexer.js          # Node/Express + sqlite indexer + /verify API + /storePayload endpoint
├─ supplychain.sqlite  # local DB (ignored in git)
├─ package.json
├─ .env                # local environment (ignored)
├─ frontend/           # Next.js app (can be part of monorepo or submodule)
│  └─ app/verify/page.tsx
└─ README.md
```

---

## Requirements

* Node.js v16+ (v18–22 works; in examples we used v22)
* npm (or yarn)
* Git
* Windows / macOS / Linux (commands below include both Windows and Bash examples)

NPM packages used (dev & runtime):

* `hardhat`, `@nomicfoundation/hardhat-toolbox` (or minimal Hardhat + ethers)
* `sqlite3`
* `express`, `cors`, `body-parser`
* `@zxing/browser` (frontend QR scanning)
* `node-fetch` (demoFlow)
* others in `package.json` (run `npm install`)

---

## .env (example)

Create a `.env` at project root (DO NOT commit it). Example:

```env
# local hardhat node RPC
RPC_URL=http://127.0.0.1:8545

# set to deployed contract address (or leave empty to have demoFlow deploy and print)
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# indexer
ARTIFACT_PATH=./artifacts/contracts/CustodyRegistry.sol/CustodyRegistry.json
DB_PATH=./supplychain.sqlite
START_BLOCK=0
PORT=4000
```

---

## Full setup & run (from scratch)

Below are step-by-step commands and the reason for each. Use one terminal per long-running process.

> **Note**: If you are on Windows PowerShell and `npx` refuses due to script restrictions, run the commands in **CMD** or enable script execution: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` (careful, only if you understand the security implications). Alternatively run `npx` from Git Bash.

### 1) Install dependencies

From project root:

```bash
npm install
```

If you face `ERESOLVE` peer dependency errors when doing `npx hardhat` or `create-next-app`, you can use:

```bash
npm install --legacy-peer-deps
```

(or force `--force`, but prefer `--legacy-peer-deps`).

---

### 2) Compile contracts

```bash
npx hardhat compile
```

This produces `artifacts/` and downloads compiler if needed. If you see pragma mismatch errors, ensure `hardhat.config.js` `solidity` field matches the `pragma` in `CustodyRegistry.sol` (example uses `^0.8.20`).

---

### 3) Start Hardhat local node (in Terminal A)

```bash
npx hardhat node
```

This prints a set of accounts and private keys and starts a JSON-RPC server at `http://127.0.0.1:8545`. Keep this terminal open.

---

### 4) Deploy (either via demoFlow or manually)

Option A (demoFlow will deploy a fresh registry if `.env` `CONTRACT_ADDRESS` is empty):

```bash
npx hardhat run scripts/demoFlow.js --network localhost
```

Option B (deploy a contract then set `.env` CONTRACT\_ADDRESS):

```bash
npx hardhat run scripts/deploy.js --network localhost
# (or use the Hardhat console to deploy manually)
```

`demoFlow.js` also anchors sensor hashes and transfers custody — it’s handy for demos.

---

### 5) Start the indexer (Terminal B)

```bash
node indexer.js
```

What it does:

* Reads `ARTIFACT_PATH` and `CONTRACT_ADDRESS` from `.env`.
* Indexes past events (from `START_BLOCK`) and subscribes to live events.
* Exposes API: `GET /verify/:batchId` and `POST /storePayload` (for raw payloads).

**Important**: start the indexer **before** you run `demoFlow` to make sure it receives live events. If you run demoFlow before indexer, you can either re-run demoFlow or index past events (indexer indexes past events on startup).

---

### 6) Run demoFlow (Terminal C)

If `CONTRACT_ADDRESS` points to a deployed registry (or demoFlow deployed a fresh registry), run:

```bash
npx hardhat run scripts/demoFlow.js --network localhost
```

`demoFlow` does:

* registerBatch
* anchorSensor (2 readings, posts raw payload to indexer)
* transferCustody

It prints tx hashes and reading hashes and instructs you to `curl` the verify API.

---

### 7) Verify via HTTP (Terminal D) or browser

Use the indexer API:

```bash
curl http://localhost:4000/verify/<BATCHID>
```

Example (demoFlow batchId printed in script):

```bash
curl http://localhost:4000/verify/0x25bebd...
```

This returns JSON:

```json
{
  "batch": {...},
  "handoffs": [{id, batch_id, from_addr, to_addr, time}],
  "sensors": [{id, reading_hash, signer, time, raw_payload, tempC, nonce}],
  "risk": { score, reasons, label }
}
```

---

### 8) Frontend (Next.js) — Scanner & UI

Go to `frontend`:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000` and go to the verify page (e.g. `/verify`). Use the scan button or paste a batch id. The camera uses `@zxing/browser` — browser will ask for camera permission.

**If QR camera keeps scanning in a loop**: the frontend code sample included stops the camera on first result — ensure your `page.tsx` has the stop logic and you are not continuously re-calling `startScanner()`.

---

## Helpful scripts (already in repo)

* `scripts/demoFlow.js` — demo flow for registering, anchoring, transferring.
* `scripts/inspect_recent_txs.js` — decodes recent txs to see logs.
* `scripts/print_handoffs.js` — prints the `handoffs` table from sqlite.

---

## `.gitignore` (recommended)

Add this to project root (DO NOT commit `.env`, DB, artifacts):

```
node_modules/
artifacts/
cache/
typechain/
coverage/
.next/
out/
dist/
.env
.env.*
*.sqlite
*.sqlite-journal
logs/
*.log
.DS_Store
Thumbs.db
.vscode/
.idea/
```

If `frontend` was a separate Git repo and you want it included in the main repository, remove `frontend/.git` (or use Git submodule). See repository notes.

---

## Troubleshooting (common issues & fixes)

* **`Cannot find module artifacts/.../CustodyRegistry.json`**
  Run `npx hardhat compile` from project root. Also run scripts with `npx hardhat run` if they expect Hardhat runtime.

* **`Error HH606 pragma statement don't match`**
  Make sure `hardhat.config.js` solidity version matches `pragma` in contracts. Example: `solidity: "0.8.20"`.

* **`npx hardhat` failing with peer/ERESOLVE while installing toolbox**
  Use `npm install --legacy-peer-deps` or install specific package versions (or create project without toolbox).

* **PowerShell `npx.ps1 cannot be loaded`**
  Run commands in CMD/Git Bash or set execution policy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` (only if you understand security implications).

* **Indexer shows `No custody transfers recorded`**
  Ensure indexer was running before demoFlow; otherwise restart indexer and re-run demoFlow. You can also delete `supplychain.sqlite` to force reindex from `START_BLOCK=0` then run indexer.

* **Duplicate DB rows**
  Add unique indexes and use `INSERT OR IGNORE` in `indexer.js` handlers. Use `storePayload` to `UPDATE` existing sensor rows rather than insert duplicates.

* **Timestamp confusion** (1970/incorrect)
  Raw payload `ts` may be milliseconds while chain `time` is seconds. Normalise: store `payload_ts` as ms in DB and convert seconds → ms when showing: `if (ts < 1e12) ts *= 1000`.

* **Frontend QR camera issues**
  Make sure `@zxing/browser` version works with your React/Next version. Stop video tracks on scan: `video.srcObject.getTracks().forEach(t => t.stop())`.

* **`embedded git repository: frontend` warning when `git add .`**
  Remove nested `.git` if you want `frontend` as part of repo: `rm -rf frontend/.git` and `git rm -r --cached frontend; git add frontend; git commit -m "Include frontend subfolder"`.

---

## API — quick reference

* `GET /verify/:batchId`
  Returns: JSON with `batch`, `handoffs`, `sensors`, `risk`.

* `POST /storePayload`
  Body: `{ batchId, readingHash, rawPayload }`
  Indexer endpoint to attach raw payload JSON (from IoT device or demoFlow) to a previously anchored reading.

---

## Data model & what you see in UI

* `batch`: `{ batch_id, ipfs_cid, manufacturer, created_at }`
* `handoff`: `{ id, batch_id, from_addr, to_addr, time }` (time = unix seconds)
* `sensor`: `{ id, batch_id, reading_hash, signer, time, raw_payload, tempC, payload_ts, nonce }`

  * `raw_payload` is JSON (stringified), may contain `tempC`, `ts` (ms), `nonce`.
* `risk`: `{ score, reasons[], label }` — simple heuristics (origin present, custody continuity, sensor thresholds).

In the frontend we display friendly names via `actors` table (seeded by `scripts/seed_actors.js`), `short_hash`, and parsed payload fields (temp, nonce, readable time).

---

## Security & notes

* This is a hackathon/demo prototype — do **not** use this as-is in production. Signed sensor data MUST be verified on the server (recover signer from signature), private keys must be managed securely, and off-chain indexer trust model must be hardened.
* Do not commit `.env` or private keys.
* If you committed secrets by mistake, rotate keys and consider rewriting Git history (advanced).

---

## Suggested next steps / improvements

* Verify and recover signer signature server-side — ensure `anchorSensor` includes signature bytes and validate ECDSA on indexer.
* Add role management on-chain (operators, whitelists).
* Integrate IPFS for product metadata (store `ipfs_cid` during registerBatch).
* Add simple anomaly detection (temperature spikes) to indexer to set risk reasons.
* Add on-chain registry of verified devices and manufacturer PKI.

---

## Contributing

PRs welcome — make a small change, open a PR, and include a short description of what you changed. For big changes open an issue first.

---

## License & credits

* MIT License (add `LICENSE` file if you want explicit license).
* Built for HackAP 2025 / demo & learning purposes.

---

## Contact

* For any other details
