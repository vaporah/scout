import { createPadreOverlay } from './padreOverlay.js';
import { padreDocumentMint } from './padreMint.js';
import { requestAssessments } from './scanClient.js';
import { startTokenPageMonitor } from './tokenPageMonitor.js';

const runtime = globalThis as typeof globalThis & { __scoutPadreStarted?: boolean };
if (!runtime.__scoutPadreStarted) {
  runtime.__scoutPadreStarted = true;
  createPadreOverlay().start();
  startTokenPageMonitor(current => padreDocumentMint(document, current), requestAssessments).start();
}
