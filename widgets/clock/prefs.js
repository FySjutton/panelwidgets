export default function buildPrefs(p) {
    p.group('Utseende');
    p.entry('title', 'Titel');
    p.switch('showLoad', 'Visa load');
}