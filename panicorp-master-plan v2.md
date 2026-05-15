# PaniniCorp — Plan Maestro de Desarrollo

> Documento vivo. Cada sección tiene un estado: `[ ]` Pendiente · `[~]` En progreso · `[x]` Completado y testeado

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES Modules) |
| Flip animation | StPageFlip (MIT, sin dependencias) |
| Backend / DB | Supabase (Auth + Postgres + Storage + RLS) |
| Deploy | Vercel |

---

## Estructura de archivos

```
panicorp/
├── index.html                  # Landing + login/registro
├── join.html                   # Onboarding por slug (/join/?slug=acme-corp)
├── album.html                  # Vista del álbum
├── exchange.html               # Mercado de intercambio
├── editor.html                 # Panel del Editor (admin de empresa)

├── css/
│   ├── base.css                # Reset, variables base, tipografía
│   ├── album.css               # Álbum, flip, páginas
│   ├── sticker.css             # Componente sticker (vacío / lleno)
│   ├── exchange.css            # UI de intercambios
│   └── editor.css              # Panel del Editor

├── js/
│   ├── core/
│   │   ├── supabase.js         # Cliente singleton
│   │   ├── auth.js             # Login, registro, logout, session guard
│   │   ├── theme.js            # applyTheme() → CSS custom properties en :root
│   │   └── router.js           # Guard de rutas por rol
│   ├── album/
│   │   ├── album.js            # Orquestador: carga páginas, monta StPageFlip
│   │   ├── stickers.js         # renderSticker(employee, isCollected) → HTMLElement
│   │   └── pack.js             # openPack() → llama RPC, anima sobre
│   ├── exchange/
│   │   ├── exchange.js         # Lista ofertas abiertas, filtros
│   │   └── trade.js            # Crear oferta, aceptar, cancelar
│   └── editor/
│       ├── employees.js        # CRUD empleados, subida de fotos
│       ├── sections.js         # CRUD secciones, reordenar
│       ├── layout.js           # Auto-asignación page/position, override manual
│       ├── packconfig.js       # Pack size, frecuencia, raridades, probabilidades
│       └── theme-editor.js     # Color pickers, preview en tiempo real, guardar

└── assets/
    └── placeholder.svg         # Silueta humana para stickers vacíos
```

---

## Base de datos — Schema completo

### `companies`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
name          text NOT NULL
slug          text UNIQUE NOT NULL
created_at    timestamptz DEFAULT now()
```

### `user_profiles`
```sql
id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
role          text NOT NULL CHECK (role IN ('editor', 'employee'))
display_name  text
created_at    timestamptz DEFAULT now()
```

### `album_theme`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id            uuid UNIQUE REFERENCES companies(id) ON DELETE CASCADE
page_bg_color         text DEFAULT '#F4EFE6'
page_border_color     text DEFAULT '#C8A96E'
page_border_width     int  DEFAULT 2
sticker_empty_bg      text DEFAULT '#E8E2D9'
sticker_empty_border  text DEFAULT '#C0B8AD'
sticker_filled_border text DEFAULT '#C8A96E'
font_family           text DEFAULT '''Playfair Display'', Georgia, serif'
primary_text_color    text DEFAULT '#2C2416'
secondary_text_color  text DEFAULT '#7A6E5F'
accent_color          text DEFAULT '#C8A96E'
spine_color           text DEFAULT '#2C2416'
company_name          text
logo_url              text
updated_at            timestamptz DEFAULT now()
```

### `pack_config`
```sql
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id       uuid UNIQUE REFERENCES companies(id) ON DELETE CASCADE
pack_size        int  DEFAULT 5
frequency_days   int  DEFAULT 1
max_accumulated  int  DEFAULT 5
probabilities    jsonb DEFAULT '{"common": 0.70, "rare": 0.25, "legendary": 0.05}'
updated_at       timestamptz DEFAULT now()
```

### `album_sections`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
name          text NOT NULL
order_index   int  NOT NULL
created_at    timestamptz DEFAULT now()
UNIQUE (company_id, order_index)
```

### `employees`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
section_id    uuid REFERENCES album_sections(id) ON DELETE SET NULL
name          text NOT NULL
role          text
email         text                        -- email corporativo para acceso
code          text NOT NULL               -- "EMP-042", auto-generado
photo_url     text
rarity        text DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'legendary'))
page_number   int
position      int  CHECK (position BETWEEN 1 AND 9)
is_active     boolean DEFAULT false
created_at    timestamptz DEFAULT now()
UNIQUE (company_id, code)
UNIQUE (company_id, email)
```

### `user_collection`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
employee_id   uuid REFERENCES employees(id) ON DELETE CASCADE
obtained_at   timestamptz DEFAULT now()
UNIQUE (user_id, employee_id)
```

### `user_duplicates`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
employee_id   uuid REFERENCES employees(id) ON DELETE CASCADE
quantity      int DEFAULT 1 CHECK (quantity > 0)
updated_at    timestamptz DEFAULT now()
UNIQUE (user_id, employee_id)
```

### `user_pack_status`
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE
company_id        uuid REFERENCES companies(id) ON DELETE CASCADE
packs_available   int  DEFAULT 0
last_login_date   date DEFAULT CURRENT_DATE
updated_at        timestamptz DEFAULT now()
```

### `trade_offers`
```sql
id                   uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id           uuid REFERENCES companies(id) ON DELETE CASCADE
from_user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE
to_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL
offered_emp_id       uuid REFERENCES employees(id) ON DELETE CASCADE
requested_emp_id     uuid REFERENCES employees(id) ON DELETE CASCADE
status               text DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','cancelled'))
created_at           timestamptz DEFAULT now()
updated_at           timestamptz DEFAULT now()
```

---

## RPCs en Postgres

| Función | Estado |
|---|---|
| `fn_login_pack_check(p_user_id, p_company_id)` | ✅ |
| `fn_open_pack(p_user_id, p_company_id)` | ✅ |
| `fn_accept_trade(p_trade_id, p_acceptor_id)` | ✅ |
| `fn_compute_album_layout(p_company_id)` | ✅ |
| `fn_generate_employee_code(p_company_id)` | ✅ |
| `fn_register_editor(p_company_name, p_editor_name, p_user_id)` | ✅ |
| `fn_verify_employee_email(p_email, p_company_id)` | ✅ (pendiente uso en frontend) |

---

## Triggers

| Trigger | Estado |
|---|---|
| `fn_on_user_created` — crea `user_profiles` + `user_pack_status` al registrarse | ✅ |
| `fn_on_company_created` — genera slug + crea `album_theme` + `pack_config` | ✅ |
| `fn_set_updated_at` — mantiene `updated_at` en tablas relevantes | ✅ |
| Fix aplicado: `SET search_path = public` + `NULLIF` para company_id null | ✅ |

---

## RLS

Todas las tablas tienen RLS habilitado. Helpers `fn_my_company_id()` y `fn_my_role()` con `SECURITY DEFINER`. ✅

---

## Dirección visual — "Corporate Collector / SaaS Premium Soft-Gaming"

- Bordes oscuros definidos: `--border-main: #2F3B52`
- Sombras sólidas offset: `6px 6px 0px #2F3B52`
- Fondo cálido: `--bg-main: #F7F4EF`
- Tipografía: Nunito ExtraBold (títulos) + DM Sans (cuerpo)
- Stickers como mini trading cards con estados visuales por rareza
- El tema del Editor sobreescribe tokens en runtime vía CSS custom properties
- Nunca parecer dashboard corporativo genérico — debe sentirse como experiencia coleccionable

---

## Fases de desarrollo

### FASE 1 — Fundación [x]

- [x] Schema SQL completo en Supabase
- [x] RLS policies en todas las tablas
- [x] RPCs y triggers creados y funcionando
- [x] `index.html` — login/registro para Editores
- [x] `js/core/supabase.js` — cliente singleton
- [x] `js/core/auth.js` — login, registro, logout, guardRoute por rol
- [x] Fix trigger: `SET search_path = public` + casteo seguro de uuid
- [x] RPC `fn_register_editor` — flujo atómico post-signup
- [~] `join.html` — estructura HTML lista, lógica de verificación pendiente
- [~] `js/core/router.js` — redirección por rol (parcial)

> **Autenticación de empleados (pendiente — ver Fase 6):**
> El Editor precarga emails en `employees.email`. Al registrarse por slug, el sistema
> verifica el email contra la whitelist. Magic link descartado (límite 3/hora Supabase
> plan gratuito). Google OAuth elegido como método principal pero requiere configuración
> externa. Por ahora acceso de empleados se gestiona manualmente desde Supabase.

---

### FASE 2 — Panel del Editor [x]

- [x] `editor.html` — layout con sidebar y 6 secciones operativas
- [x] `editor/sections.js` — CRUD secciones
- [x] `editor/employees.js` — CRUD empleados + subida de fotos a Storage
  - [x] Bucket `employee-photos` en Supabase Storage
  - [x] Normalización de imágenes a JPEG (soporte .jfif y otros)
  - [x] Código auto-generado vía `fn_generate_employee_code`
  - [x] Campo `email` con advertencia si está vacío
  - [x] Badge "Sin acceso" en card si no tiene email
- [x] `editor/layout.js` — preview layout + botón "Publicar álbum"
- [x] `editor/packconfig.js` — pack_size, frequency_days, max_accumulated, probabilidades
- [x] `editor/theme-editor.js` — color pickers + guardar en `album_theme`
- [x] `js/core/theme.js` — `loadTheme()` + `applyTheme()`

---

### FASE 3 — Álbum visual [~]

- [x] `css/base.css` — reset, variables base, componentes auth
- [x] `css/sticker.css` — estructura 80/20, aspect-ratio 3/4
- [x] `js/album/stickers.js` — `renderSticker(employee, isCollected)`
- [x] `js/album/album.js` — carga páginas, monta StPageFlip
- [x] `css/album.css` — layout, páginas, grid 3x3, progress bar, botón sobre
- [x] `album.html` — estructura completa
- [x] StPageFlip integrado y funcionando
- [ ] Fix número par de páginas + portada correcta
- [ ] Portada con company_name, logo y fondo spine
- [ ] Efectos rare (glow sutil) / legendary (glow dorado + shimmer)
- [ ] Refinamiento visual general del álbum

---

### FASE 4 — Mecánica de sobres [~]

- [~] `js/album/pack.js` — stub creado, implementación pendiente
- [ ] Animación apertura de sobre: cerrado → flap → reveal
- [ ] Stickers aparecen uno a uno con delay 300ms
- [ ] Badge "¡Nuevo!" (verde) vs "Repetido" (gris)
- [ ] Celebración especial si sale legendary
- [ ] Actualización en tiempo real del álbum tras abrir sobre
- [ ] Actualización del contador de sobres disponibles
- [ ] Anti doble-click durante animación

---

### FASE 5 — Intercambios [ ]

- [ ] `exchange.html` — layout marketplace
- [ ] `js/exchange/exchange.js` — listar ofertas abiertas, filtros
- [ ] `js/exchange/trade.js` — crear oferta, cancelar
- [ ] Aceptar intercambio → `fn_accept_trade`
- [ ] Notificación en tiempo real (Supabase Realtime)
- [ ] Vista "Mis repetidos" con quantity
- [ ] Visual: cards, avatars, rarity highlights, acciones claras

---

### FASE 6 — Autenticación empleados [ ]

- [ ] Activar Google OAuth en Supabase (requiere Google Cloud Console)
- [ ] Agregar redirect URI: `https://[proyecto].supabase.co/auth/v1/callback`
- [ ] `join.html` — flujo: Google Auth + registro manual con verificación whitelist
- [ ] Verificar email contra `employees.email` vía `fn_verify_employee_email`
- [ ] Si no autorizado → rechazar con mensaje claro
- [ ] Si ya registrado → login directo
- [ ] Si autorizado y nuevo → crear cuenta y redirigir a álbum

---

## Glosario

| Término en código | Significado |
|---|---|
| `editor` | El administrador de la empresa (quien configura el álbum) |
| `employee` | El usuario final que colecciona stickers |
| `slug` | Identificador URL de la empresa (ej: `acme-corp`) |
| `spread` | Las dos páginas visibles a la vez en el álbum |
| `slot` | Posición 1-9 dentro de una página |
| `pack` | Sobre de stickers |
| `duplicate` | Sticker que el usuario ya tenía (va a user_duplicates) |
| `layout` | El mapa fijo de qué empleado va en qué página y posición |
| `rarity` | Rareza del sticker: common, rare, legendary |
