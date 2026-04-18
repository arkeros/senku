// Tiny react_component fixture exercising the `assets` attr:
// logoUrl is emitted by asset_codegen into ./Header.assets.ts
// from the testdata logo.svg.
import { logoUrl } from "./Header.assets";

export function Header() {
  return <img src={logoUrl} alt="test" width={16} height={16} />;
}
