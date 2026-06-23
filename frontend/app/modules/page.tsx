'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ANCHOR_REGISTRY_ADDRESS,
  DEFAULT_MODULE_ADDRESS,
  LoadedModule,
  QNS_MODULE_IDS,
  RedirectManifestV1,
  StaticFileContent,
  StaticSiteManifestV1,
  decodeRedirectManifestV1,
  decodeStaticSiteManifestV1,
  loadModuleByAddress,
  loadModuleByName,
  moduleTopologyLabel,
  readStaticFile,
  rendererLabel,
} from '@/lib/modules';
import {
  QNS_MAINNET_LAUNCH_NAME,
  QNNS_CONTRACT_ADDRESS,
} from '@/lib/constants';
import { truncateAddress } from '@/lib/utils';

type LoadMode = 'name' | 'address';

interface ModuleResult {
  module: LoadedModule;
  staticSite?: StaticSiteManifestV1;
  staticFiles?: StaticFileContent[];
  staticContent?: StaticFileContent;
  redirect?: RedirectManifestV1;
}

function shortHex(value: string, chars = 12): string {
  if (!value) return '';
  return `${value.slice(0, chars)}...${value.slice(-8)}`;
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="reg-label mb-1.5 block">{children}</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="reg-rule grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-2.5 last:border-b-0">
      <dt className="reg-label !tracking-[0.14em]">{label}</dt>
      <dd className="break-all font-mono text-sm text-ink">{value || 'Not set'}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-paper-2 p-4">
      <div className="reg-label">{label}</div>
      <div className="mt-2.5 break-all font-mono text-sm text-ink">{value}</div>
    </div>
  );
}

function MarkdownPreview({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/\n{2,}/), [text]);
  return (
    <div className="space-y-3 text-ink">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('# ')) {
          return <h2 key={index} className="font-display text-2xl text-ink">{trimmed.slice(2)}</h2>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={index} className="font-display text-lg text-ink">{trimmed.slice(3)}</h3>;
        }
        return <p key={index} className="whitespace-pre-wrap leading-7 text-muted">{trimmed}</p>;
      })}
    </div>
  );
}

function sanitizeHtml(input: string): string {
  if (typeof DOMParser === 'undefined') return '<!doctype html><html><body></body></html>';
  const doc = new DOMParser().parseFromString(input, 'text/html');

  doc
    .querySelectorAll('script,iframe,object,embed,base,link,meta[http-equiv]')
    .forEach((node) => node.remove());

  for (const element of Array.from(doc.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'srcdoc' ||
        name === 'style' ||
        value.startsWith('javascript:')
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function buildHtmlPreview(entry: StaticFileContent, files: StaticFileContent[]): string {
  if (typeof DOMParser === 'undefined') return '';
  const cssText = files
    .filter((file) => sameId(file.file.mimeType, QNS_MODULE_IDS.mimeTextCss))
    .map((file) => file.text)
    .join('\n');

  const doc = new DOMParser().parseFromString(sanitizeHtml(entry.text), 'text/html');
  const style = doc.createElement('style');
  style.textContent = cssText;
  doc.head.append(style);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function StaticPreview({ entry, files }: { entry: StaticFileContent; files: StaticFileContent[] }) {
  const srcDoc = useMemo(() => buildHtmlPreview(entry, files), [entry, files]);

  if (sameId(entry.file.mimeType, QNS_MODULE_IDS.mimeTextHtml)) {
    return (
      <iframe
        title="Rendered QNS static site"
        sandbox=""
        srcDoc={srcDoc}
        className="h-[560px] w-full border border-line-strong bg-white"
      />
    );
  }

  if (
    sameId(entry.file.mimeType, QNS_MODULE_IDS.mimeTextMarkdown) ||
    sameId(entry.file.mimeType, QNS_MODULE_IDS.mimeTextPlain) ||
    sameId(entry.file.mimeType, QNS_MODULE_IDS.contentModeNone)
  ) {
    return <MarkdownPreview text={entry.text} />;
  }

  return (
    <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap border border-line bg-paper-sunk p-4 text-sm text-muted">
      {entry.text}
    </pre>
  );
}

async function buildModuleResult(module: LoadedModule): Promise<ModuleResult> {
  if (module.topology.toLowerCase() === QNS_MODULE_IDS.topologyStaticSite.toLowerCase()) {
    const staticSite = decodeStaticSiteManifestV1(module.manifest.topologyData);
    const staticFiles = await Promise.all(
      staticSite.files.map((file) => readStaticFile(staticSite, file))
    );
    const staticContent =
      staticFiles.find((content) => content.file.path === staticSite.entryPath) ||
      staticFiles[0];
    return { module, staticSite, staticFiles, staticContent };
  }

  if (module.topology.toLowerCase() === QNS_MODULE_IDS.topologyRedirect.toLowerCase()) {
    return {
      module,
      redirect: decodeRedirectManifestV1(module.manifest.topologyData),
    };
  }

  return { module };
}

export default function ModulesPage() {
  const autoLoaded = useRef(false);
  const [mode, setMode] = useState<LoadMode>('name');
  const [name, setName] = useState(QNS_MAINNET_LAUNCH_NAME);
  const [registryAddress, setRegistryAddress] = useState(DEFAULT_ANCHOR_REGISTRY_ADDRESS);
  const [moduleAddress, setModuleAddress] = useState(DEFAULT_MODULE_ADDRESS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ModuleResult | null>(null);

  async function loadSelected(
    nextMode: LoadMode,
    nextName: string,
    nextRegistryAddress: string,
    nextModuleAddress: string
  ) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const loaded = nextMode === 'name'
        ? await loadModuleByName(nextName, nextRegistryAddress)
        : await loadModuleByAddress(nextModuleAddress);
      setResult(await buildModuleResult(loaded));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load module.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadSelected(mode, name, registryAddress, moduleAddress);
  }

  useEffect(() => {
    if (autoLoaded.current) return;

    const params = new URLSearchParams(window.location.search);
    const moduleParam = params.get('module') || params.get('moduleAddress');
    const nameParam = params.get('name') || params.get('qns');
    const registryParam = params.get('registry') || params.get('anchorRegistry');

    if (!moduleParam && !nameParam && !registryParam) return;
    autoLoaded.current = true;

    const nextMode: LoadMode = moduleParam ? 'address' : 'name';
    const nextModuleAddress = moduleParam || moduleAddress;
    const nextName = nameParam || name;
    const nextRegistryAddress = registryParam || registryAddress;

    setMode(nextMode);
    setModuleAddress(nextModuleAddress);
    setName(nextName);
    setRegistryAddress(nextRegistryAddress);

    if (params.get('autoload') !== 'false' && (moduleParam || nameParam)) {
      void loadSelected(nextMode, nextName, nextRegistryAddress, nextModuleAddress);
    }
  }, [moduleAddress, name, registryAddress]);

  const tabCls = (active: boolean) =>
    `min-h-11 px-4 text-sm font-medium transition-colors ${
      active ? 'bg-ink text-white' : 'bg-paper-2 text-muted hover:text-ink'
    }`;

  return (
    <div className="reg-rise space-y-10 pb-10">
      {/* Header */}
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div>
          <p className="reg-kicker">Developer tools</p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl">
            Inspect what a name loads.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Read the registry, module manifest, content store, and file hashes directly from Quai RPC. The hosted page is only a shell.
          </p>
        </div>
        <dl className="reg-frame p-5">
          <DetailRow label="QNNS" value={truncateAddress(QNNS_CONTRACT_ADDRESS, 8)} />
          <DetailRow label="Registry" value={truncateAddress(DEFAULT_ANCHOR_REGISTRY_ADDRESS, 8)} />
          <DetailRow label="Module" value={truncateAddress(DEFAULT_MODULE_ADDRESS, 8)} />
        </dl>
      </header>

      {/* Controls */}
      <section>
        <form onSubmit={handleSubmit} className="reg-record p-6">
          <div className="inline-flex border border-line-strong">
            <button type="button" onClick={() => setMode('name')} className={tabCls(mode === 'name')}>
              By name
            </button>
            <button type="button" onClick={() => setMode('address')} className={`${tabCls(mode === 'address')} border-l border-line-strong`}>
              By address
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            {mode === 'name' ? (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <label className="block">
                  <FieldLabel>QNS name</FieldLabel>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="moduleexample"
                    className="reg-input"
                  />
                </label>
                <label className="block">
                  <FieldLabel>Anchor registry</FieldLabel>
                  <input
                    value={registryAddress}
                    onChange={(event) => setRegistryAddress(event.target.value.trim())}
                    placeholder="0x…"
                    className="reg-input reg-input-mono"
                  />
                </label>
              </div>
            ) : (
              <label className="block">
                <FieldLabel>Module contract address</FieldLabel>
                <input
                  value={moduleAddress}
                  onChange={(event) => setModuleAddress(event.target.value.trim())}
                  placeholder="0x…"
                  className="reg-input reg-input-mono"
                />
              </label>
            )}
          </div>

          {error && (
            <div className="mt-4 border border-bad bg-[var(--bad-wash)] px-4 py-3 text-sm text-bad">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={loading} className="reg-btn reg-btn-stamp">
              {loading ? 'Loading…' : 'Load module'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('name');
                setName(QNS_MAINNET_LAUNCH_NAME);
                setRegistryAddress(DEFAULT_ANCHOR_REGISTRY_ADDRESS);
                void loadSelected('name', QNS_MAINNET_LAUNCH_NAME, DEFAULT_ANCHOR_REGISTRY_ADDRESS, moduleAddress);
              }}
              className="reg-btn reg-btn-ghost"
            >
              Load launch site
            </button>
          </div>
        </form>
      </section>

      {/* Result */}
      {result && (
        <section className="reg-rise space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Topology" value={moduleTopologyLabel(result.module.topology)} />
            <Stat label="Renderer" value={rendererLabel(result.module.manifest.rendererId)} />
            <Stat label="Verified" value={result.module.verified ? 'Manifest + interface' : 'Not verified'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="reg-record p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <span className="reg-label">Loaded module</span>
                  <h2 className="mt-1.5 font-display text-2xl leading-tight text-ink">
                    {result.module.manifest.title || moduleTopologyLabel(result.module.topology)}
                  </h2>
                </div>
                <span className="reg-stamp reg-stamp-good">Live</span>
              </div>

              <dl>
                <DetailRow label="Address" value={result.module.moduleAddress} />
                <DetailRow label="Manifest" value={result.module.manifestHash} />
                <DetailRow label="Route" value={result.module.manifest.defaultRoute} />
                <DetailRow label="Budget" value={`${result.module.manifest.resourceBudget.maxTotalLoadedBytes} bytes · ${result.module.manifest.resourceBudget.maxContractReads} reads`} />
                {result.module.nameHash && <DetailRow label="Name hash" value={result.module.nameHash} />}
                {result.module.anchor && <DetailRow label="Chain ID" value={result.module.anchor.chainId.toString()} />}
              </dl>
            </div>

            {result.staticSite && (
              <div className="reg-record p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="reg-label">Static content</span>
                    <h3 className="mt-1.5 font-display text-2xl text-ink">Verified files</h3>
                  </div>
                  <span className="font-mono text-xs text-muted">
                    Store {truncateAddress(result.staticSite.contentStore, 5)}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {result.staticSite.files.map((file) => (
                    <div key={`${file.contentId.toString()}-${file.path}`} className="border border-line bg-paper-sunk p-4">
                      <div className="font-mono text-sm font-medium text-ink">{file.path}</div>
                      <div className="mt-2.5 grid gap-1 font-mono text-xs text-muted">
                        <div>{file.byteLength} bytes</div>
                        <div>{file.chunkCount} chunk{file.chunkCount === 1 ? '' : 's'}</div>
                        <div>{shortHex(file.contentHash)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {result.staticSite && (
            <div className="reg-record p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="reg-label">Sandbox preview</span>
                  <h3 className="mt-1.5 font-display text-2xl text-ink">Rendered entry</h3>
                </div>
                <span className="border border-line bg-paper-sunk px-3 py-1.5 font-mono text-xs text-muted">
                  {result.staticContent?.file.path || result.staticSite.entryPath}
                </span>
              </div>
              {result.staticContent ? (
                <StaticPreview entry={result.staticContent} files={result.staticFiles || [result.staticContent]} />
              ) : (
                <p className="text-muted">No entry file was found.</p>
              )}
            </div>
          )}

          {result.redirect && (
            <div className="reg-record p-6">
              <h3 className="mb-4 font-display text-2xl text-ink">Redirect target</h3>
              <dl>
                <DetailRow label="Target URL" value={result.redirect.targetUrl} />
                <DetailRow label="Mode" value={result.redirect.mode === 1 ? 'Temporary' : 'Permanent'} />
                <DetailRow label="Preserve path" value={result.redirect.preservePath ? 'Yes' : 'No'} />
                <DetailRow label="Content hash" value={result.redirect.targetContentHash} />
              </dl>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
