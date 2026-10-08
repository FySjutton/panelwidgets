import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

export class WidgetPrefs {
    constructor(page, config, id, defaults) {
        this._page = page;
        this._config = config;
        this._id = id;
        this._settings = config.widgetSettings(id, defaults);
        this._group = null;
    }

    get page() {
        return this._page;
    }

    get(key, fallback) {
        return this._settings.get(key, fallback);
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
        const row = new Adw.SwitchRow(this._props(title, subtitle, {active: Boolean(this._settings.get(key, false))}));
        row.connect('notify::active', () => this._set(key, row.active));
        this._add(row);
        return row;
    }

    spin(key, title, {min = 0, max = 100, step = 1, subtitle} = {}) {
        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            value: Number(this._settings.get(key, min)),
        });
        const row = new Adw.SpinRow(this._props(title, subtitle, {adjustment}));
        row.connect('notify::value', () => this._set(key, row.value));
        this._add(row);
        return row;
    }

    // options is a plain list of strings, the value saved is the chosen string itself
    combo(key, title, options, {subtitle} = {}) {
        const row = new Adw.ComboRow(this._props(title, subtitle, {model: Gtk.StringList.new(options)}));
        row.selected = Math.max(0, options.indexOf(String(this._settings.get(key, options[0]))));
        row.connect('notify::selected', () => this._set(key, options[row.selected]));
        this._add(row);
        return row;
    }

    // Text is saved when the confirm button is pressed, not for every character
    entry(key, title) {
        const row = new Adw.EntryRow({
            title,
            text: String(this._settings.get(key, '')),
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

    _set(key, value) {
        this._config.set(this._id, key, value);
        this._config.save();
    }
}
