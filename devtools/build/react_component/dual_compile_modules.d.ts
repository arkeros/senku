// Ambient module declarations for the dual-compile outputs of
// `react_ssr_component` (`<src>.client.js` and `<src>.server.js`).
// tsc has no sibling `.d.ts` for these — esbuild resolves them at
// bundle time — so we tell tsc the modules exist and are typed `any`.
//
// This file MUST stay free of top-level imports/exports so it's
// treated as a global script, otherwise TypeScript reads
// `declare module "*.client";` as a module augmentation and rejects
// the wildcard with TS2664.

declare module "*.client";
declare module "*.server";
