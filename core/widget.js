import St from 'gi://St';

import {createPart} from './parts.js';

export class Widget {
    interval = 1000;

    constructor() {
        this.id = null;       // is set by values before build()
        this.settings = null; // is set by values after build()
        this.parts = [];
        this.actor = new St.BoxLayout({style_class: 'pw-card', vertical: true});
    }

    build() {}

    update() {}

    destroy() {}

    // Adds a part
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

    async runUpdate() {
        await this.update();
        for (const part of this.parts) {
            try {
                part.update();
            } catch (e) {
                console.error(`[panelwidgets] ${this.id}: part ${part.constructor.name} failed: ${e.message}`);
            }
        }
    }

    //  Used by the host
    disposeParts() {
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
