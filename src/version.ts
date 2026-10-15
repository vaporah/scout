/** The running extension version, shown in Scout's own UI. */
export function extensionVersion(): string {
  const api = globalThis as { chrome?: { runtime?: { getManifest?: () => { version?: unknown } } } };
  try {
    const version = api.chrome?.runtime?.getManifest?.().version;
    return typeof version === 'string' && /^\d+(?:\.\d+)*$/.test(version) ? version : '';
  } catch { return ''; }
}

/** Short label for a header chip, for example "v0.6.0"; empty when unavailable. */
export function versionLabel(): string {
  const version = extensionVersion();
  return version ? `v${version}` : '';
}
