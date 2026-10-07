// seeks updates for a widget, either using the widgets interval or when it requests so
import GLib from 'gi://GLib';

const LOG = '[panelwidgets]';
export const MIN_GAP_MS = 500; // The maximum refreshrate, may not go faster

export class Runner {
    constructor(widget, name) {
        this._widget = widget;
        this._name = name;
        this._running = false;  // a update is undergoing
        this._pending = false;  // a widget has requested an update
        this._lastMs = -Infinity;
        this._gapId = 0;        // waiting for MIN_GAP_MS to go
        this._intervalId = 0;
        this._stopped = false;
    }

    start() {
        this.request();
        const interval = this._widget.interval;
        if (!interval)
            return;
        this._intervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(interval, MIN_GAP_MS), () => {
            this.request();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // Request an update, the pending merges multiple requests to one update
    request() {
        if (this._stopped)
            return;
        this._pending = true;
        this._schedule();
    }

    stop() {
        this._stopped = true;
        if (this._intervalId)
            GLib.Source.remove(this._intervalId);
        if (this._gapId)
            GLib.Source.remove(this._gapId);
        this._intervalId = 0;
        this._gapId = 0;
    }

    _schedule() {
        if (this._stopped || this._running || this._gapId || !this._pending)
            return;
        const now = GLib.get_monotonic_time() / 1000;
        const wait = Math.max(0, this._lastMs + MIN_GAP_MS - now);
        this._gapId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait, () => {
            this._gapId = 0;
            this._run();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _run() {
        this._pending = false;
        this._running = true;
        this._lastMs = GLib.get_monotonic_time() / 1000;
        try {
            await this._widget.runUpdate();
        } catch (e) {
            console.error(`${LOG} ${this._name}: update failed: ${e.message}`);
        }
        this._running = false;
        this._schedule(); // in case a widget requested a new update while waiting
    }
}
