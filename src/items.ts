import catalog from "../data/fixtures/dota-items.json";

export type InventoryItem = {
  id: number;
  name: string;
  image?: string;
  count?: number;
};
export type PlayerInventory = {
  main: (InventoryItem | null)[];
  layout?: "slots" | "list";
  backpack?: (InventoryItem | null)[];
  neutral?: InventoryItem | null;
  enhancement?: InventoryItem | null;
};
export type DotaItemInfo = { key: string; name: string; imageUrl: string };
export const dotaItems: Record<string, DotaItemInfo> = catalog.items;
export const dotaItemImage = (id: number) => `/assets/dota/items/${id}.png`;
const validId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id >= 0;
function item(id: number): InventoryItem | null {
  if (id === 0) return null;
  const known = dotaItems[id];
  return {
    id,
    name: known?.name || `未知装备 #${id}`,
  };
}

export function normalizeDotaInventory(
  raw: Record<string, unknown>,
): PlayerInventory | undefined {
  const main = Array.from({ length: 6 }, (_, n) => raw[`item_${n}`]);
  // A missing slot is unavailable data, not an empty inventory slot.
  if (!main.every(validId)) return undefined;
  const backpack = Array.from({ length: 3 }, (_, n) => raw[`backpack_${n}`]);
  return {
    main: main.map(item),
    backpack: backpack.every(validId) ? backpack.map(item) : undefined,
    neutral: validId(raw.item_neutral) ? item(raw.item_neutral) : undefined,
    enhancement: validId(raw.item_neutral2)
      ? item(raw.item_neutral2)
      : undefined,
  };
}

export function inventoryItems(inventory: PlayerInventory): InventoryItem[] {
  return [...inventory.main, inventory.neutral, inventory.enhancement].filter(
    (item): item is InventoryItem => Boolean(item),
  );
}
