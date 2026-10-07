export const time = {
    time: {
        interval: 1000,
        value: '-',
        update() {
            this.value = new Date().toLocaleTimeString('sv-SE');
        },
    },
    date: {
        interval: 60_000,
        value: '-',
        update() {
            this.value = new Date().toLocaleDateString('sv-SE', {weekday: 'long', day: 'numeric', month: 'long'});
        },
    },
};
