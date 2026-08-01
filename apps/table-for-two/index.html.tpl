<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <!--
      Zoom is pinned for the same reason as the dino arena: this is a race
      decided by who taps first, and a stray pinch would zoom rather than
      answer. Both halves scale their own text off the viewport, so there is
      nothing a user would need to enlarge by hand.
    -->
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="description" content="Un juego para dos en un solo móvil: reflejos, cuentas y colores. Gana quien responda primero." />
    <meta name="theme-color" content="#0E1A17" />
    <title>Mesa para dos</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        background-color: #0e1a17;
        overscroll-behavior: none;
      }
    </style>
    <!--
      Home-screen icons. iOS reads `apple-touch-icon` (a raster PNG — it
      ignores SVG here) and `apple-mobile-web-app-title` for the label under
      it. The manifest covers Android and, since iOS 16.4, Safari too.
      Everything referenced here is generated from icons/icon.svg by
      //devtools/build/icons and shipped as its own image layer.
    -->
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="Mesa" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <!--
      `black`, not `black-translucent`: translucent lets content slide under
      the clock, and only the bottom inset is accounted for in these layouts.
    -->
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    {{HEAD}}
  </head>
  <body>
    <div id="root"></div>
    {{SCRIPTS}}
  </body>
</html>
