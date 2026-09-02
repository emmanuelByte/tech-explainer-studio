# Technical component SVG assets

Vendor-neutral SVG artwork used by the editable technical component kit.

## Structure

- `clients/` — users, browsers, mobile devices, and external clients
- `traffic-edge/` — DNS, CDN, proxies, gateways, and load balancers
- `compute/` — servers, services, workers, containers, and functions
- `messaging/` — queues, events, workers, and failure-isolation components

## Authoring contract

- Use a `240 150` view box for consistent component sizing.
- Keep labels out of the artwork; the editor owns editable text layers.
- Use `currentColor`, `fill="none"`, and root-level stroke presentation.
- Use round caps and joins so future draw-on and sketch treatments remain clean.
- Keep external connectors out of the artwork; smart connectors remain semantic editor data.
- Add accessible `<title>` and `<desc>` elements.

SVG files provide only the component artwork. Labels, payload values, counters,
states, and connectors must remain normal editable editor layers around the
artwork instead of being flattened into the SVG.

## Validation

Run the repository contract checks after creating or changing an asset:

```bash
npm run assets:validate
```

The validator covers every SVG in this directory and rejects embedded text,
hard-coded colors, missing accessibility metadata, and inconsistent root
presentation attributes.
