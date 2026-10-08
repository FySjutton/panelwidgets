export default {
    time: {
        interval: 1000,
        update() {
            return new Date().toLocaleTimeString('sv-SE');
        },
    },
    date: {
        interval: 60_000,
        update() {
            return new Date().toLocaleDateString('sv-SE', {weekday: 'long', day: 'numeric', month: 'long'});
        },
    },
};
