import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'panelwidgets']);
export const USER_WIDGETS_DIR = GLib.build_filenamev([CONFIG_DIR, 'widgets']);
export const USER_PARTS_DIR = GLib.build_filenamev([CONFIG_DIR, 'parts']);
export const USER_VARIABLES_DIR = GLib.build_filenamev([CONFIG_DIR, 'variables']);
export const CONFIG_FILE_NAME = 'config.json';
const CONFIG_FILE = GLib.build_filenamev([CONFIG_DIR, CONFIG_FILE_NAME]);

// Applies to all widgets unless they say something else
export const STANDARD_DEFAULTS = {enabled: true, x: 100, y: 100};

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

// The setting of the widget, what the user has choosen, otherwise the default values
export class WidgetSettings {
    constructor(values, defaults) {
        this._values = values;
        this._defaults = {...STANDARD_DEFAULTS, ...defaults};
    }

    get(key, fallback) {
        if (key in this._values)
            return this._values[key];
        if (key in this._defaults)
            return this._defaults[key];
        return fallback;
    }
}

export class Config {
    constructor() {
        this._data = {widgets: {}};
    }

    load() {
        try {
            const [, contents] = GLib.file_get_contents(CONFIG_FILE);
            const data = JSON.parse(new TextDecoder().decode(contents));
            this._data = {widgets: data?.widgets ?? {}};
        } catch (_e) {
            // The file is either missing or is broken, restart with empty settings
            this._data = {widgets: {}};
        }
    }

    save() {
        ensureDirs();
        const text = JSON.stringify(this._data, null, 2);
        Gio.File.new_for_path(CONFIG_FILE).replace_contents(
            new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, null);
    }

    // values that the user has changed
    values(id) {
        return this._data.widgets[id] ?? {};
    }

    widgetSettings(id, defaults = {}) {
        return new WidgetSettings(this.values(id), defaults);
    }

    // changes in memory, call save() to write to the disk
    set(id, key, value) {
        (this._data.widgets[id] ??= {})[key] = value;
    }
}
