const registry = new Map();

export class Part {
    constructor(widget, options) {
        this.widget = widget;
        this.options = options;
        this.actor = null; // is set by createPart() from build()
    }

    build() {
        throw new Error('build() needs to be implemented and return an element');
    }

    update() {}

    destroy() {}
}

export function registerPart(type, PartClass) {
    if (registry.has(type))
        console.warn(`[panelwidgets] "${type}"-part was registered twice, new one is used`);
    registry.set(type, PartClass);
}

export function createPart(type, widget, options = {}) {
    const PartClass = registry.get(type);
    if (!PartClass)
        throw new Error(`unknown part "${type}" (exists: ${[...registry.keys()].join(', ')})`);
    const part = new PartClass(widget, options);
    part.actor = part.build();
    return part;
}

export function clearParts() {
    registry.clear();
}
