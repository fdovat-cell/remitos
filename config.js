// ===================================================================
// CONFIGURACIÓN — completar antes de usar la app
// ===================================================================

const CONFIG = {
  // Mismo proyecto de Supabase que usa buscador-v2 (xxlgsipmocwizhafinwr.supabase.co)
  // La URL ya está puesta; falta la clave "anon public" (Supabase → Settings → API)
  SUPABASE_URL: "https://xxlgsipmocwizhafinwr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_tdrE1iMSnvMIMUGLnHz4wg_6r070C_H",

  // URL pública del productos.json que ya usa buscador-v2 (bucket catalogo-data).
  // Verificar en Supabase → Storage → catalogo-data → productos.json → "Get URL"
  PRODUCTOS_JSON_URL:
    "https://xxlgsipmocwizhafinwr.supabase.co/storage/v1/object/public/catalogo-data/productos.json",
};
