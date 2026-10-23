import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {resolveAnchoredPosition} from './core/anchor.js';
import {
    CONFIG_DIR, CONFIG_FILE_NAME, Config, USER_PARTS_DIR, USER_VARIABLES_DIR, ensureDirs, findWidgetDirs,
} from './core/config.js';
import {Service} from './core/dbus.js';
import {loadParts, loadVariables} from './core/loader.js';
import {Part, clearParts, defineParts} from './core/parts.js';
import {Runner} from './core/runner.js';
import {clearVariables, defineVariables} from './core/variables.js';
import {Widget} from './core/widget.js';

const LOG = '[panelwidgets]';
const CONFIG_DEBOUNCE_MS = 300;

const exists = (dir, name) => GLib.file_test(GLib.build_filenamev([dir, name]), GLib.FileTest.EXISTS);

let cacheBustCounter = 0;

function fileUri(dir, name, cacheBust = false) {
    let uri = Gio.File.new_for_path(GLib.build_filenamev([dir, name])).get_uri();
    if (cacheBust)
        uri += `?t=${Date.now()}-${cacheBustCounter++}`;
    return uri;
}

export default class PanelWidgets extends Extension {
    enable() {
        ensureDirs();
        this._token = {};          // shows for asyncronic loading if its disabled
        this._known = new Map();   // id -> {id, dir, WidgetClass, defaults, stylesheet}
        this._widgets = new Map(); // id -> {widget, runner, key}, widgets currently shown
        this._reloadId = 0;
        this._queue = Promise.resolve(); // loading and reloading run one at a time
        this._items = {variables: [], parts: []};
        this._applied = {variables: '', parts: ''}; // the enabled-overrides the loaded code was resolved with

        // Has to exist before the user's files are imported, they read it at the top
        globalThis.PanelWidgets = Object.freeze({Widget, Part});

        this._config = new Config();
        this._config.load();
        this._watchConfig();
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._repositionAll());

        // How prefs asks us to reload code and what we have loaded
        this._service = new Service({
            reload: (kind, id) => this._requestReload(kind, id),
            getItems: kind => this._items[kind] ?? [],
        });
        this._service.start();

        const token = this._token;
        this._enqueue(() => this._load(token));
    }

    disable() {
        this._token = null;
        this._service?.stop();
        this._service = null;
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

        for (const id of [...(this._known?.keys() ?? [])])
            this._unloadStylesheet(id);

        this._known = null;
        this._widgets = null;
        this._config = null;
        this._items = null;
        clearVariables();
        clearParts();
        delete globalThis.PanelWidgets;
    }

    // Loading and reloading all touch the same state, so they take turns. A job that was queued
    // before the extension got disabled does nothing, every step checks the token
    _enqueue(job) {
        this._queue = this._queue.then(job).catch(e => console.error(`${LOG} ${e.message}`));
        return this._queue;
    }

    // Variables first, then parts, then widgets. So no widget is built before everything it can use is there
    async _load(token) {
        await this._reloadVariables(token);
        await this._reloadParts(token);
        await this._loadWidgets(token);
    }

    async _reloadVariables(token, cacheBust = false) {
        if (this._token !== token)
            return;
        const overrides = this._config.allValues('variables');
        const {definitions, items} = await loadVariables(
            GLib.build_filenamev([this.path, 'variables']), USER_VARIABLES_DIR, overrides, cacheBust);
        if (this._token !== token)
            return;
        this._applied.variables = JSON.stringify(overrides);
        this._items.variables = items;
        defineVariables(definitions);
    }

    async _reloadParts(token, cacheBust = false) {
        if (this._token !== token)
            return;
        const overrides = this._config.allValues('parts');
        const {classes, items} = await loadParts(
            GLib.build_filenamev([this.path, 'parts']), USER_PARTS_DIR, overrides, cacheBust);
        if (this._token !== token)
            return;
        this._applied.parts = JSON.stringify(overrides);
        this._items.parts = items;
        defineParts(classes);
    }

    // cacheBust: reimport the code instead of trusting the module cache. only: just this one
    // widget id, otherwise every widget folder that currently exists (and drop ones that don't)
    async _loadWidgets(token, {cacheBust = false, only = null} = {}) {
        if (this._token !== token)
            return;
        const builtinDir = GLib.build_filenamev([this.path, 'widgets']);
        const found = findWidgetDirs(builtinDir);

        for (const id of [...this._known.keys()]) {
            if (!found.has(id)) {
                if (this._widgets.has(id))
                    this._destroyWidget(id);
                this._unloadStylesheet(id);
                this._known.delete(id);
            }
        }

        for (const [id, dir] of found) {
            if (only && id !== only)
                continue;
            try {
                const module = await import(fileUri(dir, 'widget.js', cacheBust));
                let defaults = {};
                if (exists(dir, 'settings.js'))
                    defaults = (await import(fileUri(dir, 'settings.js', cacheBust))).defaults ?? {};
                if (this._token !== token)
                    return; // extension was disabled while loading

                if (module.register)
                    console.warn(`${LOG} ${id}: register() is no longer used, put shared parts and variables in parts/ and variables/`);

                if (cacheBust && this._widgets.has(id))
                    this._destroyWidget(id); // code changed under a widget that's already showing

                this._unloadStylesheet(id);
                this._known.set(id, {id, dir, WidgetClass: module.default, defaults, stylesheet: this._loadStylesheet(dir)});
                this._syncWidget(id);
            } catch (e) {
                console.error(`${LOG} could not load widget "${id}": ${e.message}`);
            }
        }
    }

    // Reloads every variable, part and widget's code at once
    async _reloadAll(token) {
        await this._reloadVariables(token, true);
        await this._reloadParts(token, true);
        await this._loadWidgets(token, {cacheBust: true});
        console.log(`${LOG} reloaded all code`);
    }

    // prefs asked for a reload over D-Bus
    _requestReload(kind, id) {
        const token = this._token;
        let job;
        if (kind === 'all')
            job = () => this._reloadAll(token);
        else if (kind === 'variables')
            job = () => this._reloadVariables(token, true);
        else if (kind === 'parts')
            job = () => this._reloadParts(token, true);
        else if (kind === 'widget' && this._known.has(id))
            job = () => this._loadWidgets(token, {cacheBust: true, only: id});
        else
            return false;

        this._enqueue(() => {
            if (this._token !== token)
                return null;
            this._config.load(); // prefs may have saved settings just before asking
            return job();
        }).then(() => this._service?.emitReloaded(kind, id ?? ''));
        return true;
    }

    // Loads the widgets own style.css if it exists
    _loadStylesheet(dir) {
        if (!exists(dir, 'style.css'))
            return null;
        const file = Gio.File.new_for_path(GLib.build_filenamev([dir, 'style.css']));
        St.ThemeContext.get_for_stage(global.stage).get_theme().load_stylesheet(file);
        return file;
    }

    _unloadStylesheet(id) {
        const known = this._known.get(id);
        if (known?.stylesheet) {
            St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(known.stylesheet);
            known.stylesheet = null;
        }
    }

    // Only show widget if it should be shown with current settings
    _syncWidget(id) {
        const known = this._known.get(id);
        const settings = this._config.widgetSettings(id, known.defaults);
        const key = JSON.stringify(this._config.values('widgets', id));
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
                throw new Error('the class needs to extend Widget');
            widget.id = known.id;
            widget.settings = settings;
            widget.actor.add_style_class_name(`pw-${known.id}`); // so that the widgets css can be contained
            widget.build();
            Main.layoutManager._backgroundGroup.add_child(widget.actor);
            widget.actor.connect('notify::allocation', () => this._positionWidget(widget, widget.settings));
            this._positionWidget(widget, settings);
        } catch (e) {
            console.error(`${LOG} could not create widget "${known.id}": ${e.message}`);
            widget?.dispose?.();
            widget?.actor?.destroy?.();
            return;
        }

        const runner = new Runner(widget, known.id);
        widget._requestUpdate = () => runner.request();
        this._widgets.set(known.id, {widget, runner, key});
        runner.start();
        console.log(`${LOG} showing "${known.id}"`);
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
            console.warn(`${LOG} ${widget.id}: monitor ${settings.get('anchorMonitor')} doesn't exist`);
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
                this._applyConfig();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _applyConfig() {
        this._config.load();
        for (const id of this._known.keys())
            this._syncWidget(id);

        const token = this._token;
        for (const kind of ['variables', 'parts']) {
            if (JSON.stringify(this._config.allValues(kind)) === this._applied[kind])
                continue;
            this._enqueue(() => kind === 'variables'
                ? this._reloadVariables(token)
                : this._reloadParts(token));
        }
    }
}
