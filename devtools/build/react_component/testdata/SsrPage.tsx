// react_ssr_component fixture: a route component file with `preload`
// + `meta` named exports. Exists to exercise the dual-compile pipeline
// — the .server.js output keeps everything; the .client.js output
// strips `preload`/`meta` and sweeps `./fake-server-only` (which is
// only referenced by `preload`) out of the imports.
import type { ReactElement } from "react";

const FAKE_DATA = { name: "test" };

export const preload = async () => {
  return FAKE_DATA;
};

export const meta = () => ({ title: "SSR fixture" });

export function SsrPage(): ReactElement {
  return <div>{FAKE_DATA.name}</div>;
}
