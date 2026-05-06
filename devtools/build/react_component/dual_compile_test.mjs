import { test } from "node:test";
import assert from "node:assert/strict";

import { transform } from "./dual_compile.mjs";

const dedent = (strings) => {
  const raw = strings[0];
  const lines = raw.split("\n");
  // drop the leading newline that `\n  ...` template strings add.
  if (lines[0] === "") lines.shift();
  const indent = lines[0].match(/^\s*/)[0].length;
  return lines.map((l) => l.slice(indent)).join("\n");
};

test("server mode preserves preload + meta + Component", () => {
  const src = dedent`
    import { fetchUser } from "./api";
    export const preload = async () => fetchUser();
    export const meta = ({ data }) => ({ title: data.name });
    export function Page({ data }) {
      return <div>{data.name}</div>;
    }
  `;
  const out = transform(src, { mode: "server" }).code;
  assert.match(out, /preload/);
  assert.match(out, /meta/);
  assert.match(out, /function Page/);
  assert.match(out, /from "\.\/api"/);
});

test("client mode strips preload + meta named exports", () => {
  const src = dedent`
    export const preload = async () => 42;
    export const meta = () => ({ title: "x" });
    export function Page() {
      return <div>hi</div>;
    }
  `;
  const out = transform(src, { mode: "client" }).code;
  assert.doesNotMatch(out, /\bpreload\b/);
  assert.doesNotMatch(out, /\bmeta\b/);
  assert.match(out, /function Page/);
});

test("client mode sweeps imports only used by preload", () => {
  const src = dedent`
    import { fetchUser } from "./api";
    import { stylex } from "@stylexjs/stylex";
    const styles = stylex.create({});
    export const preload = async () => fetchUser();
    export function Page() { return <div className={styles}>hi</div>; }
  `;
  const out = transform(src, { mode: "client" }).code;
  assert.doesNotMatch(out, /from "\.\/api"/, "fetchUser-only import should be swept");
  assert.match(out, /from "@stylexjs\/stylex"/, "stylex import is still used by Page");
  assert.match(out, /function Page/);
});

test("client mode keeps imports used by both preload and Component", () => {
  const src = dedent`
    import { z } from "./shared";
    export const preload = async () => z;
    export function Page() { return <div>{z}</div>; }
  `;
  const out = transform(src, { mode: "client" }).code;
  assert.match(out, /from "\.\/shared"/);
  assert.match(out, /function Page/);
  assert.doesNotMatch(out, /\bpreload\b/);
});

test("client mode handles export specifiers ({ preload, Page })", () => {
  const src = dedent`
    import { fetchUser } from "./api";
    const preload = async () => fetchUser();
    function Page() { return <div>hi</div>; }
    export { preload, Page };
  `;
  const out = transform(src, { mode: "client" }).code;
  // Note: the const `preload` declaration itself isn't removed, only the
  // export — but its identifier no longer appears in any export, so it's
  // unreferenced server-only code. That's a known smell but acceptable for
  // v1: dead-code elimination during esbuild minify drops it. The export
  // alias path is the high-priority guarantee here.
  assert.doesNotMatch(out, /export\s*\{[^}]*\bpreload\b/);
  assert.match(out, /export\s*\{[^}]*\bPage\b/);
});

test("client mode removes function-declaration exports", () => {
  const src = dedent`
    import { db } from "./db";
    export async function preload() { return db.query(); }
    export function Page() { return <div>x</div>; }
  `;
  const out = transform(src, { mode: "client" }).code;
  assert.doesNotMatch(out, /\bpreload\b/);
  assert.doesNotMatch(out, /from "\.\/db"/);
  assert.match(out, /function Page/);
});

test("client mode removes side-effect imports that became dead", () => {
  // Side-effect-only imports (`import "./srv-init";`) used solely by
  // server-only code are dropped — keeping them in the client bundle would
  // re-execute server-only side effects in the browser.
  const src = dedent`
    import "./server-side-effect";
    import { token } from "./token";
    export const preload = async () => token;
    export function Page() { return <div>hi</div>; }
  `;
  const out = transform(src, { mode: "client" }).code;
  assert.doesNotMatch(out, /server-side-effect/);
  assert.doesNotMatch(out, /from "\.\/token"/);
  assert.match(out, /function Page/);
});

test("server mode is a no-op transform of preload + meta presence", () => {
  const src = dedent`
    import { fetchUser } from "./api";
    export const preload = async () => fetchUser();
    export const meta = () => ({ title: "x" });
    export function Page() { return null; }
  `;
  const serverOut = transform(src, { mode: "server" }).code;
  // server mode keeps every name; we don't assert exact bytes since
  // preset-typescript and preset-react reshape the JSX.
  assert.match(serverOut, /preload/);
  assert.match(serverOut, /meta/);
  assert.match(serverOut, /function Page/);
  assert.match(serverOut, /from "\.\/api"/);
});

test("transform throws on unknown mode", () => {
  assert.throws(() => transform("", { mode: "bogus" }), /must be one of/);
});

test("client mode preserves type-only imports stripped by preset-typescript", () => {
  // preset-typescript drops `import type` declarations entirely; our plugin
  // shouldn't choke on the resulting empty specifier set.
  const src = dedent`
    import type { User } from "./types";
    import { fetchUser } from "./api";
    export const preload = async (): Promise<User> => fetchUser();
    export function Page() { return <div>hi</div>; }
  `;
  const out = transform(src, { mode: "client" }).code;
  assert.doesNotMatch(out, /from "\.\/api"/);
  assert.doesNotMatch(out, /from "\.\/types"/);
  assert.match(out, /function Page/);
});
