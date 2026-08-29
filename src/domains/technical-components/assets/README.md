# Technical component SVG assets

Vendor-neutral SVG artwork used by the editable technical component kit.

## Structure

- `clients/` — users, browsers, mobile devices, and external clients
- `traffic-edge/` — DNS, CDN, proxies, gateways, and load balancers
- `compute/` — servers, services, workers, containers, and functions

## Authoring contract

- Use a `240 150` view box for consistent component sizing.
- Keep labels out of the artwork; the editor owns editable text layers.
- Use `currentColor`, `fill="none"`, and root-level stroke presentation.
- Use round caps and joins so future draw-on and sketch treatments remain clean.
- Keep external connectors out of the artwork; smart connectors remain semantic editor data.
- Add accessible `<title>` and `<desc>` elements.
