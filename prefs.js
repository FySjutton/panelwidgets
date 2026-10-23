import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {X_POINTS, Y_POINTS} from './core/anchor-points.js';
import {Config, USER_PARTS_DIR, USER_VARIABLES_DIR, USER_WIDGETS_DIR, findWidgetDirs, listJsFiles} from './core/config.js';
import {getItems, reload, subscribeReloaded} from './core/dbus.js';
import {ItemPrefs, addSaveBanner} from './core/prefs-helpers.js';

export default class PanelWidgetsPrefs extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const config = new Config();
        config.load();

        const refreshers = []; // pages that list what the extension has loaded, redone after a reload

        window.add(this._buildHomePage(window));
        window.add(await this._buildWidgetsPage(window, config));
        window.add(this._buildItemsPage(window, config, refreshers, 'variables', {
            title: 'Variables', icon: 'x-office-spreadsheet-symbolic',
            builtinDir: GLib.build_filenamev([this.path, 'variables']), userDir: USER_VARIABLES_DIR,
        }));
        window.add(this._buildItemsPage(window, config, refreshers, 'parts', {
            title: 'Parts', icon: 'applications-graphics-symbolic',
            builtinDir: GLib.build_filenamev([this.path, 'parts']), userDir: USER_PARTS_DIR,
        }));

        const unsubscribe = subscribeReloaded(() => {
            window.add_toast(new Adw.Toast({title: 'Reloaded', timeout: 2}));
            for (const refresh of refreshers)
                refresh();
        });
        window.connect('close-request', () => {
            unsubscribe();
            return false;
        });
    }

    _buildHomePage(window) {
        const page = new Adw.PreferencesPage({title: 'Home', icon_name: 'go-home-symbolic'});

        const aboutGroup = new Adw.PreferencesGroup();
        aboutGroup.add(this._actionRow({
            title: this.metadata.name ?? 'Panel Widgets',
            subtitle: this.metadata.description,
            buttonIcon: 'help-about-symbolic',
            onClick: () => this._showAbout(window),
        }));
        page.add(aboutGroup);

        const reloadGroup = new Adw.PreferencesGroup({
            title: 'Code',
            description: 'Re-imports every variable, part and widget file and rebuilds whatever is ' +
                'currently showing. Code edits otherwise only take effect after the shell restarts.',
        });
        reloadGroup.add(this._actionRow({
            title: 'Reload all code',
            buttonIcon: 'view-refresh-symbolic',
            onClick: () => this._reload(window, 'all'),
        }));
        page.add(reloadGroup);

        return page;
    }

    _showAbout(window) {
        const about = new Adw.AboutWindow({
            transient_for: window,
            application_name: this.metadata.name ?? 'Panel Widgets',
            version: this.metadata.version != null ? String(this.metadata.version) : '',
            comments: this.metadata.description ?? '',
            website: 'https://github.com/FySjutton/panelwidgets',
            issue_url: 'https://github.com/FySjutton/panelwidgets/issues',
        });
        about.present();
    }

    async _buildWidgetsPage(window, config) {
        const page = new Adw.PreferencesPage({title: 'Widgets', icon_name: 'view-grid-symbolic'});
        const group = new Adw.PreferencesGroup();
        page.add(group);

        const widgets = findWidgetDirs(GLib.build_filenamev([this.path, 'widgets']));
        if (widgets.size === 0) {
            group.add(new Adw.ActionRow({
                title: 'No widgets found',
                subtitle: `Add widget folders in ${USER_WIDGETS_DIR}`,
            }));
            return page;
        }

        for (const [id, dir] of widgets) {
            const settingsModule = await this._importOptional(dir, 'settings.js', id);
            const prefsModule = await this._importOptional(dir, 'prefs.js', id);
            const title = settingsModule.title ?? id;
            const defaults = settingsModule.defaults ?? {};

            group.add(this._buildListRow(window, config, 'widgets', id, {
                title,
                subtitle: dir,
                onOpenSettings: () => this._openDialog(window, title, dialogPage => {
                    const p = new ItemPrefs(dialogPage, config, 'widgets', id, defaults);
                    addSaveBanner(dialogPage, p);

                    p.group('Position');
                    p.spin('anchorMonitor', 'Monitor', {min: 0, max: 8, subtitle: '0 is the first screen'});
                    p.combo('anchorScreenX', 'Screen-anchor X', X_POINTS, {subtitle: 'Left, center or right on the screen'});
                    p.combo('anchorScreenY', 'Screen-anchor Y', Y_POINTS, {subtitle: 'Top, middle or bottom on the screen'});
                    p.combo('anchorWidgetX', 'Widget-anchor X', X_POINTS, {subtitle: 'The anchor of the widget itself'});
                    p.combo('anchorWidgetY', 'Widget-anchor Y', Y_POINTS, {subtitle: 'The anchor of the widget itself'});
                    p.spin('x', 'Position X', {min: -2000, max: 2000, subtitle: 'Offset from the anchor-point'});
                    p.spin('y', 'Position Y', {min: -2000, max: 2000, subtitle: 'Offset from the anchor-point'});

                    try {
                        prefsModule.default?.(p);
                    } catch (e) {
                        console.error(`panelwidgets: prefs.js for ${id} failed: ${e.message}`);
                    }
                }),
            }));
        }
        return page;
    }

    // Shared by the variables and parts pages
    _buildItemsPage(window, config, refreshers, kind, {title, icon, builtinDir, userDir}) {
        const page = new Adw.PreferencesPage({title, icon_name: icon});
        const group = new Adw.PreferencesGroup();
        page.add(group);

        const rows = [];
        const addRow = row => {
            group.add(row);
            rows.push(row);
        };

        const populate = async () => {
            for (const row of rows.splice(0))
                group.remove(row);

            let items;
            try {
                items = await getItems(kind);
            } catch (e) {
                console.error(`panelwidgets: couldn't get ${kind} from the extension: ${e.message}`);
                addRow(new Adw.ActionRow({
                    title: "Can't reach the extension",
                    subtitle: `Is it enabled? It has to be running to list and switch ${kind}. The files are:`,
                }));
                for (const dir of [builtinDir, userDir]) {
                    for (const file of listJsFiles(dir))
                        addRow(new Adw.ActionRow({title: file, subtitle: dir}));
                }
                return;
            }

            if (items.length === 0)
                addRow(new Adw.ActionRow({title: `No ${kind} found`}));

            for (const item of items) {
                const status = !item.enabled ? 'Disabled' : item.active ? 'Active' : 'Overridden by another file';
                addRow(this._buildListRow(window, config, kind, item.name, {
                    title: item.name,
                    subtitle: `${item.builtin ? 'Built-in' : 'Yours'} · ${status}`,
                    onOpenSettings: () => this._openDialog(window, item.name, dialogPage => {
                        const details = new Adw.PreferencesGroup({title: 'Details'});
                        dialogPage.add(details);
                        details.add(new Adw.ActionRow({title: 'File', subtitle: item.path}));
                        details.add(new Adw.ActionRow({title: 'Origin', subtitle: item.builtin ? 'Built-in' : 'Yours'}));
                        details.add(new Adw.ActionRow({
                            title: 'Priority',
                            subtitle: `${item.priority}, set in the file with "export const priority". ` +
                                'Higher wins when several files provide this name',
                        }));
                        details.add(new Adw.ActionRow({title: 'Status', subtitle: status}));
                    }),
                }));
            }
        };

        const refresh = () => populate().catch(e => console.error(`panelwidgets: ${e.message}`));
        refreshers.push(refresh);
        refresh();
        return page;
    }

    _buildListRow(window, config, kind, id, {title, subtitle, onOpenSettings}) {
        const row = new Adw.ActionRow(subtitle ? {title, subtitle} : {title});

        const enableSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: (config.values(kind, id).enabled ?? true) !== false,
        });
        enableSwitch.connect('notify::active', () => {
            config.set(kind, id, 'enabled', enableSwitch.active);
            config.save();
        });
        row.add_suffix(enableSwitch);

        const reloadButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: kind === 'widgets' ? 'Reload this widget\'s code' : `Reload all ${kind}`,
        });
        reloadButton.connect('clicked', () =>
            this._reload(window, kind === 'widgets' ? 'widget' : kind, kind === 'widgets' ? id : ''));
        row.add_suffix(reloadButton);

        const settingsButton = new Gtk.Button({
            icon_name: 'emblem-system-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: 'Settings',
        });
        settingsButton.connect('clicked', onOpenSettings);
        row.add_suffix(settingsButton);

        return row;
    }

    // A small row with a title and a single button on the right, used on the home page
    _actionRow({title, subtitle, buttonIcon, onClick}) {
        const row = new Adw.ActionRow(subtitle ? {title, subtitle} : {title});
        const button = new Gtk.Button({icon_name: buttonIcon, valign: Gtk.Align.CENTER, css_classes: ['flat']});
        button.connect('clicked', onClick);
        row.add_suffix(button);
        row.activatable_widget = button;
        return row;
    }

    // Asks the extension to reload
    async _reload(window, kind, id = '') {
        try {
            const accepted = await reload(kind, id);
            window.add_toast(new Adw.Toast({
                title: accepted ? 'Reloading...' : "The extension didn't understand that request",
                timeout: 1,
            }));
        } catch (e) {
            console.error(`panelwidgets: reload failed: ${e.message}`);
            window.add_toast(new Adw.Toast({title: "Couldn't reach the extension, is it enabled?"}));
        }
    }

    // A separate modal window, so opening one item's settings doesn't mean juggling a tab per item
    _openDialog(window, title, fill) {
        const dialog = new Adw.PreferencesWindow({
            transient_for: window,
            modal: true,
            search_enabled: false,
            title,
        });
        const page = new Adw.PreferencesPage();
        dialog.add(page);
        fill(page);
        dialog.present();
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
