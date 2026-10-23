import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const DBUS_NAME = 'com.github.FySjutton.PanelWidgets';
export const DBUS_PATH = '/com/github/FySjutton/PanelWidgets';
export const DBUS_INTERFACE = 'com.github.FySjutton.PanelWidgets';
const CALL_TIMEOUT_MS = 2000;

const INTERFACE_XML = `
<node>
  <interface name="${DBUS_INTERFACE}">
    <method name="Reload">
      <arg type="s" direction="in" name="kind"/>
      <arg type="s" direction="in" name="id"/>
      <arg type="b" direction="out" name="accepted"/>
    </method>
    <method name="GetItems">
      <arg type="s" direction="in" name="kind"/>
      <arg type="a(ssbdbb)" direction="out" name="items"/>
    </method>
    <signal name="Reloaded">
      <arg type="s" name="kind"/>
      <arg type="s" name="id"/>
    </signal>
  </interface>
</node>`;

// Runs inside the shell. handler is {reload(kind, id) -> bool, getItems(kind) -> [{name, path, ...}]}
export class Service {
    constructor(handler) {
        this._handler = handler;
        this._exported = null;
        this._ownerId = 0;
    }

    start() {
        this._exported = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, this);
        this._exported.export(Gio.DBus.session, DBUS_PATH);
        // Owning the name is what lets prefs tell whether the extension is running at all
        this._ownerId = Gio.bus_own_name_on_connection(
            Gio.DBus.session, DBUS_NAME, Gio.BusNameOwnerFlags.NONE, () => {}, () => {});
    }

    stop() {
        if (this._ownerId)
            Gio.bus_unown_name(this._ownerId);
        this._ownerId = 0;
        this._exported?.unexport();
        this._exported = null;
    }

    emitReloaded(kind, id = '') {
        this._exported?.emit_signal('Reloaded', new GLib.Variant('(ss)', [kind, id]));
    }

    // The two methods below are what D-Bus calls, the wrapper looks them up by name

    Reload(kind, id) {
        return new GLib.Variant('(b)', [Boolean(this._handler.reload(kind, id))]);
    }

    GetItems(kind) {
        const rows = this._handler.getItems(kind).map(item =>
            [item.name, item.path, item.builtin, Number(item.priority), item.enabled, item.active]);
        return new GLib.Variant('(a(ssbdbb))', [rows]);
    }
}

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

// Throws if the extension isn't running (nobody owns the name), so callers need a try/catch
function callService(method, parameters) {
    return Gio.DBus.session.call(
        DBUS_NAME, DBUS_PATH, DBUS_INTERFACE, method, parameters, null,
        Gio.DBusCallFlags.NO_AUTO_START, CALL_TIMEOUT_MS, null);
}

export async function reload(kind, id = '') {
    const reply = await callService('Reload', new GLib.Variant('(ss)', [kind, id]));
    const [accepted] = reply.recursiveUnpack();
    return accepted;
}

export async function getItems(kind) {
    const reply = await callService('GetItems', new GLib.Variant('(s)', [kind]));
    const [rows] = reply.recursiveUnpack();
    return rows.map(([name, path, builtin, priority, enabled, active]) =>
        ({name, path, builtin, priority, enabled, active}));
}

// Calls callback(kind, id) every time a reload has finished. Returns a function that unsubscribes
export function subscribeReloaded(callback) {
    const id = Gio.DBus.session.signal_subscribe(
        DBUS_NAME, DBUS_INTERFACE, 'Reloaded', DBUS_PATH, null, Gio.DBusSignalFlags.NONE,
        (_connection, _sender, _path, _interface, _signal, parameters) =>
            callback(...parameters.recursiveUnpack()));
    return () => Gio.DBus.session.signal_unsubscribe(id);
}
