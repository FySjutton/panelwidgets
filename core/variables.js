import GLib from 'gi://GLib';

const LOG = '[panelwidgets]';
const TICK_MS = 250;          // how often we check for variables who should be updated
const KEEP_ALIVE_MS = 10_000; // how long a variable survives after last usage
const re = /\{\s*(\w+)\s*\}/g;

const definitions = new Map(); // name -> definition
const active = new Map();      // name -> {lastUsed, lastRun}, only variables who are used
let tickId = 0;

const nowMs = () => GLib.get_monotonic_time() / 1000;

export function registerVariable(name, definition) {
    if (definitions.has(name))
        console.warn(`${LOG} variable "${name}" registered twice, new one used`);
    definitions.set(name, definition);
}

// Register multiple at the same time: {cpu: {...}, load: {...}}
export function registerVariables(variables) {
    for (const [name, definition] of Object.entries(variables))
        registerVariable(name, definition);
}

function runUpdate(name, definition, state, now) {
    try {
        definition.update?.();
    } catch (e) {
        if (definition.value !== '?')
            console.error(`${LOG} variable "${name}" failed: ${e.message}`);
        definition.value = '?';
    }
    state.lastRun = now;
}

// Gets a variable value, or undefined
export function getVariable(name) {
    const definition = definitions.get(name);
    if (!definition)
        return undefined;

    const now = nowMs();
    let state = active.get(name);
    if (!state) {
        state = {lastUsed: now, lastRun: -Infinity};
        active.set(name, state);
        runUpdate(name, definition, state, now); // first value directly
        startTicker();
    }
    state.lastUsed = now;
    return definition.value;
}

// Replaced {name} in a text against the variables value, unknown is "?"
export function render(text) {
    return text.replace(re, (_, name) => String(getVariable(name) ?? '?'));
}

function startTicker() {
    if (!tickId)
        tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, tick);
}

function tick() {
    const now = nowMs();
    for (const [name, state] of active) {
        const definition = definitions.get(name);
        if (!definition || now - state.lastUsed > KEEP_ALIVE_MS) {
            definition?.reset?.();
            active.delete(name);
        } else if (now - state.lastRun >= (definition.interval ?? 1000)) {
            runUpdate(name, definition, state, now);
        }
    }
    if (active.size === 0) {
        tickId = 0;
        return GLib.SOURCE_REMOVE;
    }
    return GLib.SOURCE_CONTINUE;
}

// Shuts everything down and forgets all variables, when the extension is disabled
export function clearVariables() {
    if (tickId)
        GLib.Source.remove(tickId);
    tickId = 0;
    for (const name of active.keys())
        definitions.get(name)?.reset?.();
    active.clear();
    definitions.clear();
}
