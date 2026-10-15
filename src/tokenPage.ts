import { extractAxiomDevBadge } from './axiomDevBadge.js';
import { axiomDocumentMint } from './axiomMint.js';
import { requestAssessments } from './scanClient.js';
import { startTokenPageMonitor } from './tokenPageMonitor.js';

/**
 * Axiom token chart pages (/t/{mint}, /meme/{mint} and any renamed equivalent):
 * show the Scout popup in the top-right with the shared assessment, the token's
 * coin history, and Axiom's own developer provenance badge (PROVEN DEV / FARMER
 * DEV) when present.
 */
startTokenPageMonitor(
  href => axiomDocumentMint(document, href),
  requestAssessments,
  { pageBadge: () => extractAxiomDevBadge(document) }
).start();
