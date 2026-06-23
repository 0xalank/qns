import { QNS_SUBGRAPH_URL } from './constants';

const SUBGRAPH_CACHE_TTL_MS = 5_000;
const SUBGRAPH_REQUEST_GAP_MS = 250;
const SUBGRAPH_RETRY_DELAYS_MS = [750, 1_500] as const;

interface CachedQuery {
  expiresAt: number;
  promise: Promise<unknown>;
}

interface DomainHashesResult {
  domains: Array<{ id: string }>;
}

const queryCache = new Map<string, CachedQuery>();
let requestQueue = Promise.resolve();
let lastRequestAt = 0;

const DOMAINS_BY_OWNER_QUERY = `
  query domainsByOwner($owner: String!, $first: Int!, $skip: Int!) {
    domains(
      first: $first
      skip: $skip
      orderBy: name
      orderDirection: asc
      where: { owner: $owner, active: true }
    ) {
      id
    }
  }
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(gql: string, variables?: Record<string, unknown>): string {
  return `${gql}\n${JSON.stringify(variables ?? {})}`;
}

function withSubgraphSlot<T>(run: () => Promise<T>): Promise<T> {
  const next = requestQueue.then(async () => {
    const waitMs = Math.max(0, SUBGRAPH_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (waitMs > 0) await sleep(waitMs);
    lastRequestAt = Date.now();
    return run();
  });
  requestQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function shouldRetryFetch(error: unknown): boolean {
  return error instanceof TypeError || String(error).includes('Failed to fetch');
}

async function postGraphql<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SUBGRAPH_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const res = await withSubgraphSlot(() =>
        fetch(QNS_SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: gql, variables }),
        }),
      );

      if (res.status === 429 && attempt < SUBGRAPH_RETRY_DELAYS_MS.length) {
        await sleep(SUBGRAPH_RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      if (!res.ok) throw new Error(`QNS subgraph ${res.status}`);

      const json = await res.json() as { data?: T; errors?: { message: string }[] };
      if (json.errors?.length) throw new Error(json.errors[0]!.message);
      if (!json.data) throw new Error('No data from QNS subgraph');
      return json.data;
    } catch (error) {
      lastError = error;
      if (attempt >= SUBGRAPH_RETRY_DELAYS_MS.length || !shouldRetryFetch(error)) break;
      await sleep(SUBGRAPH_RETRY_DELAYS_MS[attempt]!);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function query<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
  const key = cacheKey(gql, variables);
  const cached = queryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise as Promise<T>;
  }

  const promise = postGraphql<T>(gql, variables);
  queryCache.set(key, {
    expiresAt: Date.now() + SUBGRAPH_CACHE_TTL_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    if (queryCache.get(key)?.promise === promise) queryCache.delete(key);
    throw error;
  }
}

export async function getDomainHashesOwnedByFromSubgraph(address: string): Promise<string[] | null> {
  const owner = address.toLowerCase();
  const hashes: string[] = [];
  const first = 1000;
  let skip = 0;

  try {
    while (true) {
      const data = await query<DomainHashesResult>(DOMAINS_BY_OWNER_QUERY, { owner, first, skip });
      hashes.push(...data.domains.map((domain) => domain.id));
      if (data.domains.length < first) break;
      skip += first;
    }
    return hashes;
  } catch (error) {
    console.warn('[QNS subgraph] Falling back to RPC owner scan:', error);
    return null;
  }
}
