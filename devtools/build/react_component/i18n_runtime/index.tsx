import { MessageFormat } from "messageformat";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Catalog = Record<string, string>;

type Ctx = {
  locale: string;
  format: (key: string, values?: Record<string, unknown>) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({
  locale,
  catalogUrl,
  initialCatalog,
  children,
}: {
  locale: string;
  catalogUrl: string;
  initialCatalog?: Catalog;
  children: ReactNode;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(
    initialCatalog ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch(catalogUrl)
      .then((r) => r.json() as Promise<Catalog>)
      .then((data) => {
        if (!cancelled) setCatalog(data);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogUrl]);

  const value = useMemo<Ctx>(() => {
    const cache = new Map<string, MessageFormat>();
    return {
      locale,
      format: (key, values) => {
        const src = catalog?.[key] ?? key;
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

  if (!catalog) return null;
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
