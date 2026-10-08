import St from 'gi://St';

import {Cleanup} from './cleanup.js';
import {createPart} from './parts.js';
import {createVariableReader} from './variables.js';

export class Widget {
    interval = 0;          // ms between updates, 0 = no timer
    updateOnChange = true; // update when a variable the widget has read gets a new value

    constructor() {
        this.id = null;       // is set by values before build()
        this.settings = null; // is set by values after build()
        this.parts = [];
        this.actor = new St.BoxLayout({style_class: 'pw-card', vertical: true});
        this._cleanup = new Cleanup(); // disposed by the host after destroy(), even if destroy() doesn't call super

        this._changed = new Set(); // variables that changed since last update
        this._reader = createVariableReader(name => this._variableChanged(name));
        this.variables = this._reader.variables; // this.variables.cpu, reading it is what subscribes
    }

    build() {}

    // changed has the names of the variables that got a new value since last update
    update(_changed) {}

    destroy() {}

    // Timers and signals made through these are removed automatically when the widget is destroyed,
    // use them instead of GLib.timeout_add / object.connect so nothing leaks
    timeout(ms, fn) {
        return this._cleanup.timeout(ms, fn); // once, returns an id for cancel()
    }

    every(ms, fn) {
        return this._cleanup.every(ms, fn); // repeating, returns an id for cancel()
    }

    cancel(id) {
        this._cleanup.cancel(id);
    }

    connect(object, signal, fn) {
        return this._cleanup.connect(object, signal, fn);
    }

    // Adds a part, type is a shared part name ('text') or a Part class that only this widget uses
    add(type, options = {}) {
        const part = createPart(type, this, options);
        this.parts.push(part);
        this.actor.add_child(part.actor);
        return part;
    }

    // Request an update, will take a little bit
    requestUpdate() {
        this._requestUpdate?.();
    }

    _variableChanged(name) {
        this._changed.add(name);
        if (this.updateOnChange)
            this.requestUpdate();
    }

    async runUpdate() {
        const changed = this._changed;
        this._changed = new Set();
        await this.update(changed);
        for (const part of this.parts) {
            try {
                part.update();
            } catch (e) {
                console.error(`[panelwidgets] ${this.id}: part ${part.constructor.name} failed: ${e.message}`);
            }
        }
    }

    //  Used by the host, destroys the parts and stops listening to variables
    dispose() {
        this._reader.dispose();
        this._cleanup.dispose();
        for (const part of this.parts) {
            try {
                part.destroy();
            } catch (e) {
                console.error(`[panelwidgets] ${this.id}: destroy() in ${part.constructor.name} failed: ${e.message}`);
            }
            part._cleanup.dispose();
        }
        this.parts = [];
    }
}
