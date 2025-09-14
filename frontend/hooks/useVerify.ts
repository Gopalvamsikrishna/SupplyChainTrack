// frontend/hooks/useVerify.ts
import useSWR from 'swr';

const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:4000';
const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : Promise.reject(r.statusText));

export function useVerify(batchId: string | null) {
  const key = batchId ? `${INDEXER}/verify/${encodeURIComponent(batchId)}` : null;
  const { data, error, mutate, isValidating } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000, // 30s dedupe
  });
  return {
    data,
    error,
    loading: !error && !data,
    revalidate: () => mutate(),
    isValidating
  };
}
