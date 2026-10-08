import GLib from 'gi://GLib';

const LOG = '[panelwidgets]';

// Remembers timers and signal connections so they can be removed all at once. Every Widget and Part has one
// and the host disposes it, so nothing leaks even if destroy() forgets to clean up
export class Cleanup {
    constructor() {
        this._sources = new Set();
        this._signals = [];
        this._disposed = false;
    }

    // Runs fn once after ms. Returns an id for cancel(), or 0 if already disposed
    timeout(ms, fn) {
        return this._addTimer(ms, fn, false);
    }

    // Runs fn every ms until cancelled or disposed
    every(ms, fn) {
        return this._addTimer(ms, fn, true);
    }

    cancel(id) {
        if (this._sources.delete(id))
            GLib.Source.remove(id);
    }

    // Like object.connect(), but disconnected on dispose. Returns the handler id
    connect(object, signal, fn) {
        if (this._disposed)
            return 0; // e.g. an async callback that arrives after the widget is gone
        const handlerId = object.connect(signal, fn);
        this._signals.push([object, handlerId]);
        return handlerId;
    }

    dispose() {
        this._disposed = true;
        for (const id of this._sources)
            GLib.Source.remove(id);
        this._sources.clear();
        for (const [object, handlerId] of this._signals) {
            try {
                object.disconnect(handlerId);
            } catch (_e) {
                // the object is already destroyed, its signals went with it
            }
        }
        this._signals = [];
    }

    _addTimer(ms, fn, repeat) {
        if (this._disposed)
            return 0;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            if (!repeat)
                this._sources.delete(id);
            try {
                // fn may be async, a rejected promise would otherwise vanish silently
                fn()?.catch?.(e => console.error(`${LOG} timer failed: ${e.message}`));
            } catch (e) {
                console.error(`${LOG} timer failed: ${e.message}`);
            }
            return repeat && this._sources.has(id) ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });
        this._sources.add(id);
        return id;
    }
}
