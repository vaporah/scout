import { createGmgnOverlay } from './gmgnOverlay.js';
import { gmgnDocumentMint } from './gmgnMint.js';
import { requestAssessments } from './scanClient.js';
import { startTokenPageMonitor } from './tokenPageMonitor.js';

/**
 * GMGN integration: token chart pages receive the shared top-right risk
 * warning; list pages (Trenches / new pairs) receive mint-keyed row highlights
 * through the same assessment engine. This is a personal, user-authorized
 * overlay and does not call GMGN's private endpoints or modify its controls.
 */
// GMGN navigates between Trenches and token charts without reloading the page.
// Keep both route-aware controllers alive: the list overlay goes idle on token
// pages, while the token monitor hides itself when the URL has no exact mint.
const runtime = globalThis as typeof globalThis & { __scoutGmgnStarted?: boolean };
if (!runtime.__scoutGmgnStarted) {
  runtime.__scoutGmgnStarted = true;
  createGmgnOverlay().start();
  startTokenPageMonitor(current => gmgnDocumentMint(document, current), requestAssessments).start();
}
