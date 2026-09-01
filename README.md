# Remitos PelSAS

App para armar remitos de venta, con clientes e historial de compras, reutilizando el catálogo de productos de buscador-v2.

## Puesta en marcha (una sola vez)

1. **Crear las tablas en Supabase**
   Entrá al proyecto de Supabase que ya usás para buscador-v2 (`xxlgsipmocwizhafinwr.supabase.co`) → **SQL Editor** → **New query**, pegá el contenido de `schema.sql` y ejecutalo.

2. **Completar `config.js`**
   - `SUPABASE_ANON_KEY`: Supabase → Settings → API → "anon public" key.
   - `PRODUCTOS_JSON_URL`: verificá que sea la URL pública correcta del `productos.json` que usa buscador-v2 (Supabase → Storage → bucket `catalogo-data`).

3. **Subir a GitHub y desplegar**
   Igual que tus otras apps: repo nuevo en `fdovat-cell`, subís estos archivos, lo conectás a Cloudflare Pages (o lo agregás como proyecto nuevo).

## Un punto a verificar conmigo

No tengo acceso al `productos.json` real, así que en `app.js` (función `productoCampos`) armé el buscador de productos asumiendo que cada producto tiene algo como `codigo`, `nombre`/`descripcion` y `precio` (con variantes comunes ya contempladas). **Probá el buscador de productos apenas lo subas** — si no aparecen resultados o salen vacíos, decime cómo se llaman los campos reales en el JSON y lo ajusto en un minuto.

## Cómo funciona

- **Nuevo remito**: buscás o creás el cliente, agregás productos (del catálogo o manuales), ajustás cantidades/precios si hace falta, guardás. El botón "Imprimir" muestra solo cliente + detalle + totales, sin membrete, listo para `Ctrl/Cmd+P`.
- **Clientes**: ficha con teléfono/dirección/notas, total comprado, cantidad de remitos, última compra y productos más comprados — así vas viendo qué le conviene ofrecer a cada uno.
- **Historial**: todos los remitos, filtrable por cliente.

## Qué falta si más adelante lo querés

- Editar o borrar un remito ya guardado (hoy solo se pueden crear).
- Reimprimir un remito viejo desde Clientes/Historial (hoy "Imprimir" solo funciona sobre el que acabás de guardar).
- Exportar el historial a Excel.

Se lo dejo para cuando lo uses un tiempo y veas si realmente lo necesitás — mejor no sumar complejidad de entrada.
