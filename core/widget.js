import St from 'gi://St';

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

        this._changed = new Set(); // variables that changed since last update
        this._reader = createVariableReader(name => this._variableChanged(name));
        this.variables = this._reader.variables; // this.variables.cpu, reading it is what subscribes
    }

    build() {}

    // changed has the names of the variables that got a new value since last update
    update(_changed) {}

    destroy() {}

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
        for (const part of this.parts) {
            try {
                part.destroy();
            } catch (e) {
                console.error(`[panelwidgets] ${this.id}: destroy() in ${part.constructor.name} failed: ${e.message}`);
            }
        }
        this.parts = [];
    }
}
