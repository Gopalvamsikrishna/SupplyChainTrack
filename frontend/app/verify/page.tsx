"use client";

import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// Place this file at: frontend/app/verify/page.tsx
// Requires: npm install @zxing/browser

const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:4000";

/* ---------- helpers ---------- */

function shortHash(hex, pre = 10, suf = 6) {
  if (!hex) return "";
  const s = String(hex);
  if (s.length <= pre + suf + 3) return s;
  return `${s.slice(0, pre)}…${s.slice(-suf)}`;
}

// Accepts timestamps in seconds OR milliseconds, returns locale string
function formatDate(ts) {
  if (!ts && ts !== 0) return "Unknown time";
  try {
    const n = Number(ts);
    if (Number.isNaN(n)) return String(ts);
    // heuristic: if value looks like ms (>= 1e12) treat as ms, otherwise if < 1e11 treat as seconds
    let ms = n;
    if (n > 1e12) ms = n;
    else if (n > 1e11) ms = n; // large ms
    else ms = Math.floor(n * 1000); // treat as seconds
    return new Date(ms).toLocaleString();
  } catch (e) {
    return String(ts);
  }
}

function RiskBadge({ risk }) {
  const label = risk?.label ?? "Unknown";
  const score = risk?.score ?? 0;
  const cls =
    label === "Authentic"
      ? "bg-green-100 text-green-800"
      : label === "Review"
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";
  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full font-semibold ${cls}`}>
      {label} · {score}
    </div>
  );
}

/* ---------- component ---------- */

export default function VerifyPage() {
  const [batchId, setBatchId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // scanner refs
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const scannedRef = useRef(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchVerify(id) {
    if (!id) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${INDEXER_URL}/verify/${id}`);
      if (!res.ok) {
        setError(`Indexer responded ${res.status}`);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function startScanner() {
    scannedRef.current = false;
    setScanning(true);
    try {
      const codeReader = new BrowserMultiFormatReader();
      readerRef.current = codeReader;
      const video = videoRef.current;
      const hints = {};
      // ask for camera: prefer environment facing
      const constraints = { video: { facingMode: "environment" } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.play().catch(() => {});
      // decode continuously
      codeReader.decodeFromVideoDevice(undefined, video, (result, err) => {
        if (result && !scannedRef.current) {
          scannedRef.current = true;
          const text = result.getText();
          let id = text;
          try {
            const u = new URL(text);
            if (u.searchParams.get("batch")) id = u.searchParams.get("batch");
            else {
              const parts = u.pathname.split("/");
              id = parts[parts.length - 1] || id;
            }
          } catch (e) {}
          // stop camera and scanner
          try {
            codeReader.reset();
          } catch (_) {}
          if (videoRef.current && videoRef.current.srcObject instanceof MediaStream) {
            videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
            videoRef.current.srcObject = null;
          }
          stopScanner();
          setBatchId(id);
          setTimeout(() => fetchVerify(id), 250);
        }
      });
    } catch (e) {
      console.error("scanner start error", e);
      setError("Camera/permission error: " + (e && e.message ? e.message : e));
      setScanning(false);
    }
  }

  function stopScanner() {
    try {
      if (readerRef.current) {
        try { readerRef.current.reset(); } catch (_) {}
        readerRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject instanceof MediaStream) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    } catch (e) {
      // ignore
    }
    scannedRef.current = false;
    setScanning(false);
  }

  function handleVerifyClick() {
    fetchVerify(batchId.trim());
  }

  /* ---------- render helpers ---------- */

  function renderHandoffs(handoffs) {
    if (!handoffs || handoffs.length === 0) {
      return <div className="text-gray-400">No custody transfers recorded.</div>;
    }
    return (
      <ol className="space-y-4">
        {handoffs.map((h) => {
          const when = h.time ? formatDate(h.time) : "Unknown time";
          const fromName = h.from_name ?? null;
          const toName = h.to_name ?? null;
          return (
            <li key={h.id} className="p-4 rounded-md border border-white/10 bg-gradient-to-r from-slate-800/60 to-black/40 backdrop-blur-sm">
              <div className="text-xs text-blue-200 inline-block bg-blue-900/40 px-2 py-1 rounded">{when}</div>
              <div className="mt-3 text-lg font-semibold flex items-center gap-3">
                <span className="text-indigo-200">{fromName ?? shortHash(h.from_addr, 8, 6)}</span>
                <span className="text-pink-300 text-xl mx-2">→</span>
                <span className="text-rose-200">{toName ?? shortHash(h.to_addr, 8, 6)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  function renderSensors(sensors) {
    if (!sensors || sensors.length === 0) return <div className="text-gray-400">No sensor readings</div>;
    return (
      <div className="space-y-3">
        {sensors.map((s) => {
          // payload_ts may be ms, s.time may be seconds
          const payloadTs = s.payload_ts ?? null;
          const when = payloadTs ? formatDate(payloadTs) : s.time ? formatDate(s.time) : "Unknown time";
          const signerName = s.signer_name ?? null;
          let payload = null;
          try {
            payload = s.raw_payload ? (typeof s.raw_payload === "string" ? JSON.parse(s.raw_payload) : s.raw_payload) : null;
          } catch {
            payload = s.raw_payload;
          }
          return (
            <div key={s.id} className="p-3 rounded-md border border-white/8 bg-gradient-to-r from-slate-700/60 to-black/30 backdrop-blur-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-blue-200">{when} — signer: <span className="font-mono">{signerName ?? shortHash(s.signer, 8, 6)}</span></div>
                  <div className="mt-2 font-mono text-sm text-slate-100 break-words">{shortHash(s.reading_hash, 14, 6)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-300">Nonce</div>
                  <div className="font-medium">{s.nonce ?? "—"}</div>
                </div>
              </div>

              <div className="mt-3 text-sm">
                {payload ? (
                  <div className="space-y-1">
                    <div>Temp: <span className="font-medium">{payload.tempC ?? (s.tempC ?? "—")}</span> °C</div>
                    <div className="text-xs text-gray-300">Observed: {payload.ts ? formatDate(payload.ts) : (s.payload_ts ? formatDate(s.payload_ts) : "—")}</div>
                    <details className="mt-2 bg-slate-900/60 p-2 rounded text-xs">
                      <summary className="cursor-pointer">Raw payload</summary>
                      <pre className="mt-2 text-xs overflow-auto">{typeof s.raw_payload === "string" ? s.raw_payload : JSON.stringify(s.raw_payload, null, 2)}</pre>
                    </details>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Raw payload not stored</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---------- JSX ---------- */

  return (
    <div className="min-h-screen bg-[url('/bgmount.jpg')] bg-cover bg-center">
      <div className="max-w-5xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-2">Supply-Chain — Verify Batch</h1>
        <p className="text-sm text-gray-400 mb-6">Paste a batchId (0x...) or scan a product QR to verify provenance.</p>

        <div className="flex gap-3 items-center">
          <input
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="0x..."
            className="flex-1 rounded-md border border-white/10 bg-slate-900/60 p-3 font-mono outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="px-4 py-2 rounded-md bg-slate-700 text-white hover:brightness-105" onClick={handleVerifyClick}>Verify</button>
          <button
            onClick={() => {
              if (scanning) stopScanner();
              else startScanner();
            }}
            className="px-4 py-2 rounded-md bg-blue-600 text-white"
          >
            {scanning ? "Stop" : "Scan QR"}
          </button>
          <button
            onClick={() => {
              const url = `${window.location.origin}/verify?batch=${batchId}`;
              navigator.clipboard?.writeText(url);
            }}
            className="px-4 py-2 rounded-md border border-white/10"
          >
            Copy link
          </button>
        </div>

        {/* video element for scanner */}
        <div className="mt-4">
          {scanning && (
            <div className="rounded-md overflow-hidden border border-white/6">
              <video ref={videoRef} className="w-full h-64 object-cover bg-black" />
            </div>
          )}
        </div>

        {loading && <div className="mt-4 text-gray-300">Loading…</div>}
        {error && <div className="mt-4 text-red-500">{error}</div>}

        {result && (
          <div className="mt-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400">Batch</div>
                <div className="font-mono break-words">{result.batch?.batch_id ?? "—"}</div>
                <div className="text-xs text-gray-400">
                  Created: {result.batch?.created_at ? formatDate(result.batch.created_at) : "Unknown"}
                </div>
              </div>
              <div>
                <RiskBadge risk={result.risk} />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium">Custody Timeline</h3>
              <div className="mt-3">{renderHandoffs(result.handoffs)}</div>
            </div>

            <div>
              <h3 className="text-lg font-medium">Sensor Readings</h3>
              <div className="mt-3">{renderSensors(result.sensors)}</div>
            </div>

            <details className="mt-2 bg-slate-900/60 border border-white/6 rounded p-3">
              <summary className="cursor-pointer">Raw JSON</summary>
              <pre className="mt-2 text-sm bg-gray-900 text-white p-3 rounded overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>

      {/* subtle vignette to focus content */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent to-black/40 mix-blend-overlay" />
    </div>
  );
}
