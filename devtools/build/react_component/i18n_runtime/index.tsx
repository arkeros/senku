import { MessageFormat } from "messageformat";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type Catalog = Record<string, string>;

type Ctx = {
  locale: string;
  format: (key: string, values?: Record<string, unknown>) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({
  locale,
  catalog,
  children,
}: {
  locale: string;
  catalog: Catalog;
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(() => {
    const cache = new Map<string, MessageFormat>();
    return {
      locale,
      format: (key, values) => {
        // Build-time merge enforces full key coverage, so `catalog[key]` is
        // guaranteed to exist for every id referenced in the app. The `?? key`
        // branch is a defensive no-op for developer typos (referencing an id
        // that doesn't exist).
        const src = catalog[key] ?? key;
        let mf = cache.get(src);
        if (!mf) {
          // bidiIsolation: "none" keeps interpolated values as plain text.
          // MF2 defaults to wrapping them in U+2068 / U+2069 for mixed-script
          // correctness; translators handle RTL/LTR at the catalog level.
          mf = new MessageFormat(locale, src, { bidiIsolation: "none" });
          cache.set(src, mf);
        }
        return mf.format(values);
      },
    };
  }, [locale, catalog]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

export function Trans({
  id,
  values,
}: {
  id: string;
  values?: Record<string, unknown>;
}) {
  return <>{useI18n().format(id, values)}</>;
}
