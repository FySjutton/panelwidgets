import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {X_POINTS, Y_POINTS} from './core/anchor-points.js';
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
                title: 'No widgets found',
                description: `Add widget-folders in ${USER_WIDGETS_DIR}`,
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
        p.switch('enabled', 'Enable Widget');

        p.group('Position');
        p.spin('anchorMonitor', 'Monitor', {min: 0, max: 8, subtitle: '0 is the first screen'});
        p.combo('anchorScreenX', 'Screen-anchor X', X_POINTS, {subtitle: 'Left, center or right on the screen'});
        p.combo('anchorScreenY', 'Screen-anchor Y', Y_POINTS, {subtitle: 'Top, middle or bottom on the screen'});
        p.combo('anchorWidgetX', 'Widget-anchor X', X_POINTS, {subtitle: 'The anchor of the widget itself'});
        p.combo('anchorWidgetY', 'Widget-anchor Y', Y_POINTS, {subtitle: 'The anchor of the widget itself'});
        p.spin('x', 'Position X', {min: -2000, max: 2000, subtitle: 'Offset from the anchor-point'});
        p.spin('y', 'Position Y', {min: -2000, max: 2000, subtitle: 'Offset from the anchor-point'});

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
