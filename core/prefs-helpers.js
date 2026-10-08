import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {STANDARD_DEFAULTS} from './config.js';

export class WidgetPrefs {
    constructor(page, config, id, defaults) {
        this._page = page;
        this._config = config;
        this._id = id;
        this._defaults = {...STANDARD_DEFAULTS, ...defaults};
        this._saved = {...config.values(id)};  // what's actually on disk right now
        this._draft = {...this._saved};        // edits made in this window, not saved yet
        this._group = null;
        this._dirtyListeners = [];
    }

    get page() {
        return this._page;
    }

    get dirty() {
        return JSON.stringify(this._draft) !== JSON.stringify(this._saved);
    }

    // called with the new dirty state every time it might have changed
    onDirtyChange(listener) {
        this._dirtyListeners.push(listener);
    }

    // Writes every draft change to disk in one go
    save() {
        for (const [key, value] of Object.entries(this._draft))
            this._config.set(this._id, key, value);
        this._config.save();
        this._saved = {...this._draft};
        this._notifyDirty();
    }

    get(key, fallback) {
        if (key in this._draft)
            return this._draft[key];
        if (key in this._defaults)
            return this._defaults[key];
        return fallback;
    }

    set(key, value) {
        this._set(key, value);
    }

    // Starts a new group with a title, upcoming rows belong here
    group(title) {
        this._group = new Adw.PreferencesGroup(title ? {title} : {});
        this._page.add(this._group);
        return this._group;
    }

    switch(key, title, {subtitle} = {}) {
        const row = new Adw.SwitchRow(this._props(title, subtitle, {active: Boolean(this.get(key, false))}));
        row.connect('notify::active', () => this._set(key, row.active));
        this._add(row);
        return row;
    }

    spin(key, title, {min = 0, max = 100, step = 1, subtitle} = {}) {
        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            value: Number(this.get(key, min)),
        });
        const row = new Adw.SpinRow(this._props(title, subtitle, {adjustment}));
        row.connect('notify::value', () => this._set(key, row.value));
        this._add(row);
        return row;
    }

    // options is a plain list of strings, the value saved is the chosen string itself
    combo(key, title, options, {subtitle} = {}) {
        const row = new Adw.ComboRow(this._props(title, subtitle, {model: Gtk.StringList.new(options)}));
        row.selected = Math.max(0, options.indexOf(String(this.get(key, options[0]))));
        row.connect('notify::selected', () => this._set(key, options[row.selected]));
        this._add(row);
        return row;
    }

    // Text is saved when the confirm button is pressed, not for every character
    entry(key, title) {
        const row = new Adw.EntryRow({
            title,
            text: String(this.get(key, '')),
            show_apply_button: true,
        });
        row.connect('apply', () => this._set(key, row.text));
        this._add(row);
        return row;
    }

    _props(title, subtitle, extra) {
        const props = {title, ...extra};
        if (subtitle)
            props.subtitle = subtitle;
        return props;
    }

    _add(row) {
        (this._group ?? this.group()).add(row);
    }

    // Only updates the draft, save() is what actually writes to disk
    _set(key, value) {
        this._draft[key] = value;
        this._notifyDirty();
    }

    _notifyDirty() {
        const dirty = this.dirty;
        for (const listener of this._dirtyListeners)
            listener(dirty);
    }
}
