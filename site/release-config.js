// Keep this value aligned with package.json. scripts/release.mjs updates it whenever
// a new Scout version is cut, so the public site always names the current release.
window.SCOUT_RELEASE = Object.freeze({
  released: true,
  version: '0.9.2',
  downloadUrl: 'https://chromewebstore.google.com/detail/mcmjonacgckbkemcmngpbpdhogagncak',
  sourcePublic: true,
  sourceUrl: 'https://github.com/vaporah/scout'
});
