import GLib from 'gi://GLib';

const decoder = new TextDecoder();
const read = path => decoder.decode(GLib.file_get_contents(path)[1]);

let prevCpu = null;

export const hardware = {
    cpu: {
        interval: 1000,  
        value: '-',
        update() {
            const n = read('/proc/stat').split('\n')[0].split(/\s+/).slice(1).map(Number);
            const idle = n[3] + n[4];
            const total = n.reduce((a, b) => a + b, 0);
            if (prevCpu)
                this.value = String(Math.round(100 * (1 - (idle - prevCpu.idle) / ((total - prevCpu.total) || 1))));
            prevCpu = {idle, total};
        },
        reset() {
            prevCpu = null;
            this.value = '-';
        },
    },
    load: {
        interval: 2000,
        value: '-',
        update() {
            this.value = read('/proc/loadavg').split(' ')[0];
        },
    },
};
