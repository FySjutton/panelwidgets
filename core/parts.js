import {Cleanup} from './cleanup.js';

const registry = new Map(); // type -> Part class, filled by the loader from the parts/ folders

export class Part {
    constructor(widget, options) {
        this.widget = widget;
        this.options = options;
        this.actor = null; // is set by createPart() from build()
        this._cleanup = new Cleanup(); // disposed by the host after destroy(), even if destroy() doesn't call super
    }

    // Timers and signals made through these are removed automatically when the part is destroyed
    timeout(ms, fn) {
        return this._cleanup.timeout(ms, fn);
    }

    every(ms, fn) {
        return this._cleanup.every(ms, fn);
    }

    cancel(id) {
        this._cleanup.cancel(id);
    }

    connect(object, signal, fn) {
        return this._cleanup.connect(object, signal, fn);
    }

    build() {
        throw new Error('build() needs to be implemented and return an element');
    }

    update() {}

    destroy() {}
}

export const isPartClass = value => typeof value === 'function' && value.prototype instanceof Part;

// Replaces the shared parts with the ones the loader picked
export function defineParts(parts) {
    registry.clear();
    for (const [type, PartClass] of parts)
        registry.set(type, PartClass);
}

// type is either the name of a shared part, or a Part class the widget keeps to itself
export function createPart(type, widget, options = {}) {
    const PartClass = typeof type === 'string' ? registry.get(type) : type;
    if (!PartClass)
        throw new Error(`unknown part "${type}" (exists: ${[...registry.keys()].join(', ')})`);
    if (!isPartClass(PartClass))
        throw new Error(`${PartClass.name ?? type} doesn't extend Part`);
    const part = new PartClass(widget, options);
    part.actor = part.build();
    return part;
}

export function clearParts() {
    registry.clear();
}
