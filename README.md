# Panel Widgets
Panel Widgets adds dektop widgets for the GNOME Shell. Widgets are small JavaScript classes loaded from plain folders.

- [Installing and developing](#installing-and-developing)
- [How it fits together](#how-it-fits-together)
- [Your first widget](#your-first-widget)
- [Widgets](#widgets)
- [Variables](#variables)
- [Parts](#parts)
- [Overriding built-in things](#overriding-built-in-things)
- [Settings and the preferences window](#settings-and-the-preferences-window)
- [Positioning](#positioning)
- [Styling](#styling)
- [Cleaning up](#cleaning-up)
- [Debugging](#debugging)
- [Limitations](#limitations)

## Installing and developing

Put the extension folder at

```
~/.local/share/gnome-shell/extensions/panelwidgets@fy17.github.com/
```

and enable it using:

```
gnome-extensions enable panelwidgets@fy17.github.com
gnome-extensions prefs  panelwidgets@fy17.github.com   # opens the settings window
```
or the Extension Manager helper.

## Add-ons
The extension comes with multiple built-in variables, and you can add your own add-ons into `~/.config/panelwidgets/`.

Variables goes into `~/.config/panelwidgets/variables/`, parts goes into `~/.config/panelwidgets/parts/` and widgets goes into `~/.config/panelwidgets/variables/`.

# Developing Add-ons
You can develop your own add-ons using JavaScript (variables, parts and widgets). For examples on how these may look, take a look at the inbuilt ones in `/variables`, `/parts` and `/widgets`.

Each widget has its own file, and is based upon St elements. Variables are data sources which are used for getting the data to display, it is recommended for widgets to use variables instead of fetching the information themselves so that the same information isn't generated multiple times. An example of a variable can be the current cpu or ram usage. Parts are reusable building blocks, everything from texts to more advanced stuff like graphs. 

All the settings for all widgets are stored in `~/.config/panelwidgets/config.json`. The folders are created automatically.

## Data Flow
The basic data flow for the most part goes like variable update -> widget update -> St actors are redrawn when something is changed.

There are three different clocks:

1. Variable `interval` is how often the data is fetched, it only ticks while a widget actually reads it.
2. A widgets updates decide when the widget refreshes and recomputes itself.
3. The drawing is done by the shell and only happens when an actor changes. It is not a frame loop.
