// Twee kleine hulpjes die de andere modules delen: is dit een object, en een diepe kopie via JSON.
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

export const _isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
export const _kopie = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
