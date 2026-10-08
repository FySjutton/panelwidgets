import St from 'gi://St';

const {Widget, Part} = globalThis.PanelWidgets;

// A part only this widget uses: it's given to this.add() as a class, so it never ends up among the shared parts
class BarPart extends Part {
    build() {
        this.value = 0;
        this.area = new St.DrawingArea({height: 8});
        this.area.connect('repaint', area => this._draw(area));
        return this.area;
    }

    update() {
        this.value = this.options.value() ?? 0;
        this.area.queue_repaint();
    }

    _draw(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        cr.setSourceRGBA(1, 1, 1, 0.15);
        cr.rectangle(0, 0, w, h);
        cr.fill();
        cr.setSourceRGBA(0.47, 0.75, 1, 1);
        cr.rectangle(0, 0, w * Math.min(this.value, 100) / 100, h);
        cr.fill();
        cr.$dispose();
    }
}

// No interval, it updates when cpu or load gets a new value
export default class Cpu extends Widget {
    interval = 1000;
    updateOnChange = false;

    build() {
        const variables = this.variables;
        this.history = [];

        this.add('text', {text: this.settings.get('title'), style: 'pw-title'});
        this.add('text', {text: () => `${variables.cpu ?? '-'}%`, style: 'cpu-big'});
        this.add(BarPart, {value: () => variables.cpu});

        this.length = this.settings.get('history');
        if (this.settings.get('showGraph')) {
            this.graph = new St.DrawingArea({height: 48});
            this.graph.connect('repaint', area => this._drawGraph(area));
            this.actor.add_child(this.graph);
        }

        if (this.settings.get('showLoad'))
            this.add('text', {text: () => `load ${variables.load ?? '-'}`, style: 'pw-small'});
    }

    update(changed) {
        const cpu = this.variables.cpu;
        this.history.push(cpu);
        if (this.history.length > this.length)
            this.history.shift();
        this.graph?.queue_repaint();
    }

    _drawGraph(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const step = w / (this.length - 1);

        cr.setLineWidth(2);
        cr.setSourceRGBA(0.47, 0.75, 1, 1);

        const max = Math.max(...this.history)
        this.history.forEach((value, i) => {
            const x = w - (this.history.length - 1 - i) * step;
            const y = h - (value / Math.max(max, 10) ?? 100) * h;
            if (i === 0)
                cr.moveTo(x, y);
            else
                cr.lineTo(x, y);
        });
        cr.stroke();
        cr.$dispose();
    }
}