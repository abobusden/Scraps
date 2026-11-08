export const DATA = {};
export async function loadData() { Object.assign(DATA, await (await fetch('/recipes.json')).json()); return DATA; }
export const itemName = id => (DATA.items[id] || { n: id }).n;
export const itemIcon = id => (DATA.items[id] || { e: '❓' }).e;
