/**
 * Pure read helpers over the store's `entities` / `areas` slices.
 * No side effects; safe to call from selectors and components.
 */

export const allEntities = (state) => Object.values(state.entities || {});

export const getByDomain = (state, domain) =>
  allEntities(state).filter((e) => e.entityId.startsWith(`${domain}.`));

export const getEntity = (state, entityId) => state.entities?.[entityId] ?? null;

export const getLights        = (state) => getByDomain(state, "light");
export const getSwitches      = (state) => getByDomain(state, "switch");
export const getSensors       = (state) => getByDomain(state, "sensor");
export const getBinarySensors = (state) => getByDomain(state, "binary_sensor");
export const getMediaPlayers  = (state) => getByDomain(state, "media_player");
export const getLocks         = (state) => getByDomain(state, "lock");
export const getCovers        = (state) => getByDomain(state, "cover");
export const getClimates      = (state) => getByDomain(state, "climate");
export const getScenes        = (state) => getByDomain(state, "scene");
export const getScripts       = (state) => getByDomain(state, "script");

/** Filter by device_class attribute (sensors mostly). */
export const getByDeviceClass = (state, deviceClass) =>
  allEntities(state).filter((e) => e.attributes?.device_class === deviceClass);

/** Filter by area id (uses entityArea map). */
export const getInArea = (state, areaId) =>
  allEntities(state).filter((e) => state.entityArea?.[e.entityId] === areaId);

/** Build a normalized "rooms" view: [{ id, name, entities: [...] }]. */
export const getRooms = (state) => {
  const rooms = new Map();
  for (const area of Object.values(state.areas || {})) {
    rooms.set(area.id, { id: area.id, name: area.name, entities: [] });
  }
  for (const entity of allEntities(state)) {
    const areaId = state.entityArea?.[entity.entityId];
    if (!areaId || !rooms.has(areaId)) continue;
    rooms.get(areaId).entities.push(entity);
  }
  return [...rooms.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** Find first entity matching a regex on entityId or friendly name. */
export const findEntity = (state, pattern) => {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
  return allEntities(state).find((e) => re.test(e.entityId) || re.test(e.label));
};
