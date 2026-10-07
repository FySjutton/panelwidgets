import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Config, USER_WIDGETS_DIR, findWidgetDirs} from './core/config.js';
import {WidgetPrefs} from './core/prefs-helpers.js';

export default class PanelWidgetsPrefs extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const config = new Config();
        config.load();

        const widgets = findWidgetDirs(GLib.build_filenamev([this.path, 'widgets']));
        for (const [id, dir] of widgets)
            window.add(await this._buildPage(config, id, dir));

        if (widgets.size === 0) {
            const page = new Adw.PreferencesPage({title: 'Widgets'});
            const group = new Adw.PreferencesGroup({
                title: 'Inga widgets hittades',
                description: `Lägg widgetmappar i ${USER_WIDGETS_DIR}`,
            });
            page.add(group);
            window.add(page);
        }
    }

        async _buildPage(config, id, dir) {
        // settings.js (title, defaults) and prefs.js are optional
        const settings = await this._importOptional(dir, 'settings.js', id);
        const prefs = await this._importOptional(dir, 'prefs.js', id);

        const page = new Adw.PreferencesPage({
            title: settings.title ?? id,
            icon_name: 'preferences-system-symbolic',
        });
        const p = new WidgetPrefs(page, config, id, settings.defaults ?? {});

        p.group('Widget');
        p.switch('enabled', 'Visa widgeten');
        p.spin('x', 'Position X', {min: 0, max: 10000});
        p.spin('y', 'Position Y', {min: 0, max: 10000});

        try {
            prefs.default?.(p);
        } catch (e) {
            console.error(`panelwidgets: prefs.js for ${id} failed: ${e.message}`);
        }
        return page;
    }

    async _importOptional(dir, name, id) {
        const file = Gio.File.new_for_path(GLib.build_filenamev([dir, name]));
        if (!file.query_exists(null))
            return {};
        try {
            return await import(file.get_uri());
        } catch (e) {
            console.error(`panelwidgets: couldn't load ${name} for ${id}: ${e.message}`);
            return {};
        }
    }
}
