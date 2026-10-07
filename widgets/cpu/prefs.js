import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const LENGTHS = [20, 40, 80];

export default function buildPrefs(p) {
    p.group('Utseende');
    p.entry('title', 'Titel');
    p.switch('showLoad', 'Visa load');
    p.switch('showGraph', 'Visa graf');

    const group = p.group('Graf');
    const row = new Adw.ComboRow({
        title: 'Antal mätpunkter',
        model: Gtk.StringList.new(LENGTHS.map(String)),
    });
    row.selected = Math.max(0, LENGTHS.indexOf(p.get('history')));
    row.connect('notify::selected', () => p.set('history', LENGTHS[row.selected]));
    group.add(row);
}