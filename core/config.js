import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'panelwidgets']);
export const USER_WIDGETS_DIR = GLib.build_filenamev([CONFIG_DIR, 'widgets']);
export const USER_PARTS_DIR = GLib.build_filenamev([CONFIG_DIR, 'parts']);
export const USER_VARIABLES_DIR = GLib.build_filenamev([CONFIG_DIR, 'variables']);
export const CONFIG_FILE_NAME = 'config.json';
const CONFIG_FILE = GLib.build_filenamev([CONFIG_DIR, CONFIG_FILE_NAME]);

const KINDS = ['widgets', 'variables', 'parts'];

// Applies to all widgets unless they say something else
// x/y is an offset from the anchor point
export const STANDARD_DEFAULTS = {
    enabled: true, x: 100, y: 100,
    anchorMonitor: 0,
    anchorScreenX: 'left', anchorScreenY: 'top',
    anchorWidgetX: 'left', anchorWidgetY: 'top',
};

// Applies itself to every variable/part unless its own config says something else
export const ITEM_DEFAULTS = {enabled: true};

export function ensureDirs() {
    for (const dir of [USER_WIDGETS_DIR, USER_PARTS_DIR, USER_VARIABLES_DIR])
        GLib.mkdir_with_parents(dir, 0o755);
}

function listChildren(path, fileType) {
    const names = [];
    try {
        const children = Gio.File.new_for_path(path).enumerate_children(
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = children.next_file(null)) !== null) {
            if (info.get_file_type() === fileType)
                names.push(info.get_name());
        }
        children.close(null);
    } catch (_e) {
        // folder doesn't exist
    }
    return names.sort((a, b) => a.localeCompare(b));
}

// All .js files directly in a folder, sorted by name
export function listJsFiles(path) {
    return listChildren(path, Gio.FileType.REGULAR).filter(name => name.endsWith('.js'));
}

// Finds all folders that contains a widget.js, name of the folder will be the widget id
export function findWidgetDirs(builtinDir) {
    const found = new Map();
    for (const root of [builtinDir, USER_WIDGETS_DIR]) {
        for (const name of listChildren(root, Gio.FileType.DIRECTORY)) {
            const dir = GLib.build_filenamev([root, name]);
            if (GLib.file_test(GLib.build_filenamev([dir, 'widget.js']), GLib.FileTest.EXISTS))
                found.set(name, dir);
        }
    }
    return new Map([...found].sort(([a], [b]) => a.localeCompare(b)));
}

// The setting of the widget/part/variable, what the user has choosen, otherwise the default values
export class ItemSettings {
    constructor(values, defaults) {
        this._values = values;
        this._defaults = defaults;
    }

    get(key, fallback) {
        if (key in this._values)
            return this._values[key];
        if (key in this._defaults)
            return this._defaults[key];
        return fallback;
    }
}

// All settings live in one file, grouped by kind: widgets (by id), variables and parts (by name, only whether the user has switched them off)
export class Config {
    constructor() {
        this._data = {widgets: {}, variables: {}, parts: {}};
    }

    load() {
        try {
            const [, contents] = GLib.file_get_contents(CONFIG_FILE);
            const data = JSON.parse(new TextDecoder().decode(contents));
            this._data = Object.fromEntries(KINDS.map(kind => [kind, data?.[kind] ?? {}]));
        } catch (_e) {
            // The file is either missing or is broken, restart with empty settings
            this._data = {widgets: {}, variables: {}, parts: {}};
        }
    }

    save() {
        ensureDirs();
        const text = JSON.stringify(this._data, null, 2);
        Gio.File.new_for_path(CONFIG_FILE).replace_contents(
            new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, null);
    }

    // values that the user has changed for one item
    values(kind, id) {
        return this._data[kind][id] ?? {};
    }

    // every item's values for a whole kind, id -> {key: value, ...}. Used by the loader to see which variables/parts the user has switched off
    allValues(kind) {
        return this._data[kind];
    }

    widgetSettings(id, defaults = {}) {
        return new ItemSettings(this.values('widgets', id), {...STANDARD_DEFAULTS, ...defaults});
    }

    itemSettings(kind, id) {
        return new ItemSettings(this.values(kind, id), ITEM_DEFAULTS);
    }

    // changes in memory, call save() to write to the disk
    set(kind, id, key, value) {
        (this._data[kind][id] ??= {})[key] = value;
    }
}
