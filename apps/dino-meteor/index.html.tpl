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
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
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
    {{HEAD}}
  </head>
  <body>
    <div id="root"></div>
    {{SCRIPTS}}
  </body>
</html>
