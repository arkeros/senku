<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <!--
      `maximum-scale=1, user-scalable=no` is a deliberate exception to the
      usual "never block zoom" rule: this is a two-thumb action game played on
      a phone flat on a table, and a pinch mid-rally zooms the arena instead of
      hitting the meteor. There is no text to enlarge — every string is drawn
      into the canvas at a size derived from the viewport.
    -->
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="description" content="Air hockey con dinosaurios y un meteorito. Dos jugadores, un móvil en la mesa." />
    <meta name="theme-color" content="#0C0718" />
    <title>Dino Meteoro</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
        width: 100%;
        overflow: hidden;
        background-color: #0c0718;
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
    <meta name="apple-mobile-web-app-title" content="Dino" />
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
    <div id="root">{{APP}}</div>
    {{SCRIPTS}}
  </body>
</html>
