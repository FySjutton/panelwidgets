import Gio from 'gi://Gio';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const decoder = new TextDecoder();
const read = async path => decoder.decode((await Gio.File.new_for_path(path).load_contents_async(null))[0]);

let prevCpu = null;

export default {
    cpu: {
        interval: 1000,
        async update() {
            const n = (await read('/proc/stat')).split('\n')[0].split(/\s+/).slice(1).map(Number);
            const idle = n[3] + n[4];
            const total = n.reduce((a, b) => a + b, 0);
            const value = prevCpu ? Math.round(100 * (1 - (idle - prevCpu.idle) / ((total - prevCpu.total) || 1))) : null;
            prevCpu = {idle, total};
            return value;
        },
        reset() {
            prevCpu = null;
        },
    },
    load: {
        interval: 2000,
        async update() {
            return Number((await read('/proc/loadavg')).split(' ')[0]);
        },
    },
};
