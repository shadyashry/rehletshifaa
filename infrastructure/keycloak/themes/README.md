# RehletShifaa Keycloak login theme

Branded login/registration/reset/verify/OTP/error pages for the `rehletshifaa` realm.

- **Palette:** warm cream background, healing teal primary, soft-ink headings, pale-aqua surfaces.
- **Parent:** `keycloak` (classic) — we only override CSS, the logo, and message bundles, so
  Keycloak's forms and validation keep working across upgrades.
- **Bilingual:** English + Arabic with RTL handled via logical CSS properties and Keycloak's
  built-in `dir="rtl"` for `ar`.
- **Logo:** `login/resources/img/brand-lockup.png`, generated from
  `brand-lockup.svg` and the canonical `frontend/public/brand/icon.png` with the same bilingual
  wordmark treatment as the website header.

## How it is delivered per environment

| Environment | Mechanism |
|---|---|
| **Local** (`docker-compose.yml`) | This directory is bind-mounted at `/opt/keycloak/themes` and theme caching is disabled (`KC_SPI_THEME_CACHE_*=false`), so edits show on reload. |
| **Oracle** (`deploy/oracle/keycloak`) | A copy under `deploy/oracle/keycloak/themes/` is `COPY`'d into the optimized image (`start --optimized` can't read a bind mount). **Keep the two copies in sync** — see below. |

### Keeping the Oracle copy in sync

```bash
rm -rf deploy/oracle/keycloak/themes
cp -r infrastructure/keycloak/themes deploy/oracle/keycloak/themes
```

## Activation

- **Fresh realm import:** `realm-rehletshifaa.json` (local) and `rehletshifaa-realm.json` (Oracle)
  already set `loginTheme`, `internationalizationEnabled`, and `supportedLocales` — no extra step.
- **Already-persisted realm:** `--import-realm` does **not** re-apply realm settings once the realm
  exists in the `keycloak-data` volume. Run the idempotent, non-destructive activation script (it
  never touches the volume):

  ```bash
  bash infrastructure/keycloak/apply-theme.sh
  ```

Then reload the login page. In dev, theme caching is off so CSS/logo edits appear immediately.
The portal passes `ui_locales` on sign-in so the login page opens in the patient's chosen language.
