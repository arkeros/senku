// Fixture exercising asset_library:
// :icons is an asset_library producing icons.ts with typed URL consts.
// Consumer imports them like any other module.
import { saveUrl, trashUrl } from "./icons";

export function Toolbar() {
  return (
    <div>
      <img src={saveUrl} alt="save" width={16} height={16} />
      <img src={trashUrl} alt="trash" width={16} height={16} />
    </div>
  );
}
