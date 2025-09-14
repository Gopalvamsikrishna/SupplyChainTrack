// frontend/components/DeviceVerifier.tsx
import React, { useEffect, useState } from 'react';
import { verifyMessage } from 'ethers';
import { arrayify } from 'ethers/lib/utils';

export default function DeviceVerifier({ readingHash, signature, expectedSigner } : {
  readingHash: string,
  signature?: string | null,
  expectedSigner?: string | null
}) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);

  useEffect(() => {
    if (!signature || !readingHash) {
      setVerified(null);
      setRecovered(null);
      return;
    }
    try {
      // signature was created with signMessage(arrayify(readingHash))
      const addr = verifyMessage(arrayify(readingHash), signature);
      setRecovered(addr);
      if (expectedSigner) {
        setVerified(addr.toLowerCase() === expectedSigner.toLowerCase());
      } else {
        setVerified(true); // we at least recovered an address
      }
    } catch (e) {
      setVerified(false);
      setRecovered(null);
    }
  }, [readingHash, signature, expectedSigner]);

  if (!signature) return <div className="text-sm text-gray-500">No signature stored</div>;

  return (
    <div className="mt-2 flex items-center gap-2">
      {verified === null ? (
        <div className="text-sm">Verifying…</div>
      ) : verified ? (
        <div className="inline-block px-2 py-1 rounded bg-green-50 text-green-700 text-xs font-semibold">Device verified</div>
      ) : (
        <div className="inline-block px-2 py-1 rounded bg-red-50 text-red-700 text-xs font-semibold">Signature mismatch</div>
      )}
      <div className="text-xs font-mono break-words">{recovered ?? '—'}</div>
    </div>
  );
}
