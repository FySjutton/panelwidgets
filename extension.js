import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    CONFIG_DIR, CONFIG_FILE_NAME, Config, USER_PARTS_DIR, USER_VARIABLES_DIR, ensureDirs, findWidgetDirs,
} from './core/config.js';
import {resolveAnchoredPosition} from './core/anchor.js';
import {loadParts, loadVariables} from './core/loader.js';
import {Part, clearParts, defineParts} from './core/parts.js';
import {Runner} from './core/runner.js';
import {clearVariables, defineVariables} from './core/variables.js';
import {Widget} from './core/widget.js';

const LOG = '[panelwidgets]';
const CONFIG_DEBOUNCE_MS = 300;

const fileUri = (dir, name) => Gio.File.new_for_path(GLib.build_filenamev([dir, name])).get_uri();
const exists = (dir, name) => GLib.file_test(GLib.build_filenamev([dir, name]), GLib.FileTest.EXISTS);

export default class PanelWidgets extends Extension {
    enable() {
        ensureDirs();
        this._token = {};          // shows for asyncronic loading if its disabled
        this._known = new Map();   // id -> {id, WidgetClass, defaults, stylesheet}
        this._widgets = new Map(); // id -> {widget, runner, key}, widgets currently shown
        this._reloadId = 0;

        // Has to exist before the user's files are imported, they read it at the top
        globalThis.PanelWidgets = Object.freeze({Widget, Part});

        this._config = new Config();
        this._config.load();
        this._watchConfig();
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._repositionAll());
        this._load(this._token);
    }

    disable() {
        this._token = null;
        if (this._reloadId)
            GLib.Source.remove(this._reloadId);
        this._reloadId = 0;
        this._configMonitor?.cancel();
        this._configMonitor = null;
        if (this._monitorsChangedId)
            Main.layoutManager.disconnect(this._monitorsChangedId);
        this._monitorsChangedId = 0;

        for (const id of [...(this._widgets?.keys() ?? [])])
            this._destroyWidget(id);

        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        for (const {stylesheet} of this._known?.values() ?? []) {
            if (stylesheet)
                theme.unload_stylesheet(stylesheet);
        }

        this._known = null;
        this._widgets = null;
        this._config = null;
        clearVariables();
        clearParts();
        delete globalThis.PanelWidgets;
    }

    // Variables first, then parts, then widgets. So no widget is built before everything it can use is there
    async _load(token) {
        const variableDefinitions = await loadVariables(GLib.build_filenamev([this.path, 'variables']), USER_VARIABLES_DIR);
        if (this._token !== token)
            return;
        defineVariables(variableDefinitions);

        const parts = await loadParts(GLib.build_filenamev([this.path, 'parts']), USER_PARTS_DIR);
        if (this._token !== token)
            return;
        defineParts(parts);

        await this._loadWidgets(token);
    }

    async _loadWidgets(token) {
        const builtinDir = GLib.build_filenamev([this.path, 'widgets']);
        for (const [id, dir] of findWidgetDirs(builtinDir)) {
            try {
                const module = await import(fileUri(dir, 'widget.js'));
                let defaults = {};
                if (exists(dir, 'settings.js'))
                    defaults = (await import(fileUri(dir, 'settings.js'))).defaults ?? {};
                if (this._token !== token)
                    return; // extension was disabled while loading

                if (module.register)
                    console.warn(`${LOG} ${id}: register() is no longer used, put shared parts and variables in parts/ and variables/`);
                this._known.set(id, {
                    id,
                    WidgetClass: module.default,
                    defaults,
                    stylesheet: this._loadStylesheet(dir),
                });
                this._syncWidget(id);
            } catch (e) {
                console.error(`${LOG} kunde inte ladda widgeten ${id}: ${e.message}`);
            }
        }
    }

    // Loads the widgets own style.css if it exists
    _loadStylesheet(dir) {
        if (!exists(dir, 'style.css'))
            return null;
        const file = Gio.File.new_for_path(GLib.build_filenamev([dir, 'style.css']));
        St.ThemeContext.get_for_stage(global.stage).get_theme().load_stylesheet(file);
        return file;
    }

    // Only show widget if it should be shown with current settings
    _syncWidget(id) {
        const known = this._known.get(id);
        const settings = this._config.widgetSettings(id, known.defaults);
        const key = JSON.stringify(this._config.values(id));
        const current = this._widgets.get(id);

        if (current && (!settings.get('enabled') || current.key !== key))
            this._destroyWidget(id);
        if (settings.get('enabled') && !this._widgets.has(id))
            this._createWidget(known, settings, key);
    }

    _createWidget(known, settings, key) {
        let widget = null;
        try {
            widget = new known.WidgetClass();
            if (!(widget instanceof Widget))
                throw new Error('klassen måste ärva från Widget');
            widget.id = known.id;
            widget.settings = settings;
            widget.actor.add_style_class_name(`pw-${known.id}`); // so that the widgets css can be contained
            widget.build();
            Main.layoutManager._backgroundGroup.add_child(widget.actor);
            // recalculate position when widget changes size
            widget.actor.connect('notify::allocation', () => this._positionWidget(widget, widget.settings));
            this._positionWidget(widget, settings);
        } catch (e) {
            console.error(`${LOG} kunde inte skapa widgeten ${known.id}: ${e.message}`);
            widget?.dispose?.();
            widget?.actor?.destroy?.();
            return;
        }

        const runner = new Runner(widget, known.id);
        widget._requestUpdate = () => runner.request();
        this._widgets.set(known.id, {widget, runner, key});
        runner.start();
        console.log(`${LOG} visar ${known.id}`);
    }

    _positionWidget(widget, settings) {
        const pos = resolveAnchoredPosition(widget.actor, {
            monitor: settings.get('anchorMonitor'),
            screenX: settings.get('anchorScreenX'),
            screenY: settings.get('anchorScreenY'),
            widgetX: settings.get('anchorWidgetX'),
            widgetY: settings.get('anchorWidgetY'),
            offsetX: settings.get('x'),
            offsetY: settings.get('y'),
        });
        if (!pos) {
            console.warn(`${LOG} ${widget.id}: monitor ${settings.get('anchorMonitor')} finns inte`);
            return;
        }
        const [x, y] = pos;
        // Guard against re-triggering notify::allocation with a no-op move
        if (widget.actor.x !== x || widget.actor.y !== y)
            widget.actor.set_position(x, y);
    }

    // Monitors were added/removed/resized: anchored widgets need a new position
    _repositionAll() {
        for (const {widget} of this._widgets.values())
            this._positionWidget(widget, widget.settings);
    }

    _destroyWidget(id) {
        const {widget, runner} = this._widgets.get(id);
        runner.stop();
        try {
            widget.destroy();
        } catch (e) {
            console.error(`${LOG} ${id}: destroy() failed: ${e.message}`);
        }
        widget.dispose();
        widget.actor.destroy();
        this._widgets.delete(id);
    }

    // re read config to see when it is changed
    _watchConfig() {
        this._configMonitor = Gio.File.new_for_path(CONFIG_DIR).monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._configMonitor.connect('changed', (_monitor, file, _other, event) => {
            if (file.get_basename() !== CONFIG_FILE_NAME || event === Gio.FileMonitorEvent.DELETED)
                return;
            if (this._reloadId)
                GLib.Source.remove(this._reloadId);
            this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CONFIG_DEBOUNCE_MS, () => {
                this._reloadId = 0;
                this._config.load();
                for (const id of this._known.keys())
                    this._syncWidget(id);
                return GLib.SOURCE_REMOVE;
            });
        });
    }
}
