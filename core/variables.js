import GLib from 'gi://GLib';

const LOG = '[panelwidgets]';
const MIN_INTERVAL_MS = 250; // the fastest a variable may update

const definitions = new Map(); // name -> definition, filled by the loader from the variables/ folders
const running = new Map();     // name -> state, only variables someone is subscribed to
const warned = new Set();      // unknown names we already complained about
const readers = new Set();     // every widget's reader, {onChange, names}, see createVariableReader

export function defineVariables(variables) {
    const appeared = [];
    for (const name of [...definitions.keys()]) {
        if (!variables.has(name)) {
            definitions.delete(name);
            const state = running.get(name);
            if (state)
                stop(name, state);
            appeared.push(name);
        }
    }
    for (const [name, definition] of variables) {
        if (!definitions.has(name))
            appeared.push(name);
        definitions.set(name, definition);
        const state = running.get(name);
        if (state)
            state.definition = definition; // keep the timer and listeners, just run new code
    }

    // A widget only looks at a variable when it updates, so one that read a variable which has now
    // appeared or disappeared would never find out. Tell the ones that have read it
    for (const name of appeared) {
        for (const reader of [...readers]) {
            if (!reader.names.has(name))
                continue;
            try {
                reader.onChange(name);
            } catch (e) {
                console.error(`${LOG} listener for "${name}" failed: ${e.message}`);
            }
        }
    }
}

// update() returns the value and may be async. Listeners are only told when the value actually changed
async function refresh(name, state) {
    if (state.busy)
        return; // the previous update is still going, skip this round
    state.busy = true;
    let value;
    try {
        value = (await state.definition.update()) ?? null;
        state.failed = false;
    } catch (e) {
        if (!state.failed)
            console.error(`${LOG} variable "${name}" failed: ${e.message}`);
        state.failed = true;
        value = null;
    }
    state.busy = false;

    if (state.stopped || Object.is(value, state.value))
        return;
    state.value = value;
    for (const listener of [...state.listeners]) {
        try {
            listener(name);
        } catch (e) {
            console.error(`${LOG} listener for "${name}" failed: ${e.message}`);
        }
    }
}

function stop(name, state) {
    if (state.stopped)
        return;
    state.stopped = true;
    GLib.Source.remove(state.timerId);
    if (running.get(name) === state)
        running.delete(name);
    try {
        state.definition.reset?.();
    } catch (e) {
        console.error(`${LOG} reset() of "${name}" failed: ${e.message}`);
    }
}

// The first subscriber starts the variable and the last one to leave stops it
function subscribe(name, listener) {
    let state = running.get(name);
    if (!state) {
        const definition = definitions.get(name);
        state = {definition, value: null, listeners: new Set(), busy: false, failed: false, stopped: false, timerId: 0};
        running.set(name, state);
        const interval = Math.max(definition.interval ?? 1000, MIN_INTERVAL_MS);
        const started = state;
        state.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            refresh(name, started);
            return GLib.SOURCE_CONTINUE;
        });
        refresh(name, state); // first value directly
    }
    state.listeners.add(listener);
    const unsubscribe = () => {
        state.listeners.delete(listener);
        if (state.listeners.size === 0)
            stop(name, state);
    };
    return {state, unsubscribe};
}

// Every widget gets its own reader. Reading reader.variables.cpu subscribes to cpu,
// after that onChange('cpu') is called every time cpu gets a new value. dispose() unsubscribes from everything
export function createVariableReader(onChange) {
    const subscriptions = new Map(); // name -> {state, unsubscribe}
    const reader = {onChange, names: new Set()}; // names: everything this widget has asked for
    readers.add(reader);

    const variables = new Proxy({}, {
        get(_target, name) {
            if (typeof name !== 'string')
                return undefined;
            reader.names.add(name);
            if (!definitions.has(name)) {
                if (!warned.has(name)) {
                    warned.add(name);
                    console.warn(`${LOG} unknown variable "${name}"`);
                }
                return undefined;
            }
            let subscription = subscriptions.get(name);
            if (!subscription || subscription.state.stopped) {
                // first read, or the variable was stopped (switched off, then on again)
                subscription = subscribe(name, onChange);
                subscriptions.set(name, subscription);
            }
            return subscription.state.value;
        },
        has: (_target, name) => definitions.has(name),
        ownKeys: () => [...definitions.keys()],
        getOwnPropertyDescriptor: (_target, name) =>
            definitions.has(name) ? {enumerable: true, configurable: true} : undefined,
        set: () => false,
        defineProperty: () => false,
        deleteProperty: () => false,
    });

    const dispose = () => {
        readers.delete(reader);
        for (const {unsubscribe} of subscriptions.values())
            unsubscribe();
        subscriptions.clear();
    };
    return {variables, dispose};
}

// Shuts everything down and forgets all variables, when the extension is disabled
export function clearVariables() {
    for (const [name, state] of running)
        stop(name, state);
    running.clear();
    definitions.clear();
    warned.clear();
}
