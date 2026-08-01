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
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
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
    {{HEAD}}
  </head>
  <body>
    <div id="root"></div>
    {{SCRIPTS}}
  </body>
</html>
