type CategoryNode = { id: string; parentId: string | null; [key: string]: unknown };

export function buildCategoryTree<T extends CategoryNode>(items: T[]): Array<T & { children: T[] }> {
  const roots: Array<T & { children: T[] }> = [];
  const nodes = new Map<string, T & { children: T[] }>();
  for (const item of items) nodes.set(item.id, { ...item, children: [] });
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function wouldCreateCycle(items: CategoryNode[], categoryId: string, newParentId: string | null): boolean {
  if (!newParentId) return false;
  if (categoryId === newParentId) return true;
  const parents = new Map(items.map((item) => [item.id, item.parentId]));
  let cursor: string | null | undefined = newParentId;
  while (cursor) {
    if (cursor === categoryId) return true;
    cursor = parents.get(cursor);
  }
  return false;
}
