import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {X_FRACTIONS, Y_FRACTIONS} from './anchor-points.js';

export function resolveAnchoredPosition(actor, {monitor: monitorIndex, screenX, screenY, widgetX, widgetY, offsetX = 0, offsetY = 0}) {
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return null;

    const px = monitor.x + (X_FRACTIONS[screenX] ?? 0) * monitor.width + offsetX;
    const py = monitor.y + (Y_FRACTIONS[screenY] ?? 0) * monitor.height + offsetY;

    // Natural size without needing a full allocation pass, actor isn't necessarily on stage yet
    const [, width] = actor.get_preferred_width(-1);
    const [, height] = actor.get_preferred_height(-1);
    return [
        Math.round(px - (X_FRACTIONS[widgetX] ?? 0) * width),
        Math.round(py - (Y_FRACTIONS[widgetY] ?? 0) * height),
    ];
}
