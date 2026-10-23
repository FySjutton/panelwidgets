import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const LENGTHS = [20, 40, 80];

export default function buildPrefs(p) {
    p.group('Visuals');
    p.entry('title', 'Title');
    p.switch('showLoad', 'Show load');
    p.switch('showGraph', 'Show grafh');

    const group = p.group('Graf');
    const row = new Adw.ComboRow({
        title: 'Measuring points',
        model: Gtk.StringList.new(LENGTHS.map(String)),
    });
    row.selected = Math.max(0, LENGTHS.indexOf(p.get('history')));
    row.connect('notify::selected', () => p.set('history', LENGTHS[row.selected]));
    group.add(row);
}