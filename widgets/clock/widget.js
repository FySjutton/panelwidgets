const {Widget} = globalThis.PanelWidgets;

export default class Clock extends Widget {
    interval = 1000;

    build() {
        this.add('text', {text: '{time}', style: 'pw-big'});
        if (this.settings.get('showDate'))
            this.add('text', {text: '{date}', style: 'pw-small'});
    }
}
