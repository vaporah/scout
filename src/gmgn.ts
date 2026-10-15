import { createGmgnOverlay } from './gmgnOverlay.js';
import { isGmgnTokenPage, mintFromGmgnUrl } from './gmgnMint.js';
import { requestAssessments } from './scanClient.js';
import { startTokenPageMonitor } from './tokenPageMonitor.js';

/**
 * GMGN integration: token chart pages receive the shared top-right risk
 * warning; list pages (Trenches / new pairs) receive mint-keyed row highlights
 * through the same assessment engine. This is a personal, user-authorized
 * overlay and does not call GMGN's private endpoints or modify its controls.
 */
const href = (): string => {
  try { return location.href; }
  catch { return document.URL ?? ''; }
};

if (isGmgnTokenPage(href())) {
  startTokenPageMonitor(current => mintFromGmgnUrl(current), requestAssessments).start();
} else {
  createGmgnOverlay().start();
}
