# RehletShifaa Keycloak login theme

Branded login/registration/reset/verify/OTP/error pages for the `rehletshifaa` realm.

- **Palette:** Petrol & Paper (DESIGN.md), mirrored in `login/resources/css/rehletshifaa.css` under the portal's token
  names; `frontend/e2e/keycloak-theme.spec.ts` fails when a mirrored value drifts.
- **Parent:** `keycloak` (classic). We override CSS, message bundles and, where words alone could not do it (UX area 7),
  a few templates (`template.ftl`, `info.ftl`, `error.ftl`, the password, reset, verify-email, authenticator and passkey
  pages), each starting from Keycloak 26.7.3's own `base/login` template, so its forms and validation keep working.
  Re-check them against `base/login` when Keycloak is upgraded.
- **Bilingual:** English + Arabic with RTL handled via logical CSS properties and Keycloak's
  built-in `dir="rtl"` for `ar`.
- **Logo:** the portal's lockup (`frontend/src/components/Logo.tsx`) drawn in `template.ftl`: the mark
  `login/resources/img/brand-mark.png` (a copy of the canonical `frontend/public/brand/icon.png`) and the name as live
  text in Alexandria, in both scripts.
- **Check without a server:** `bash infrastructure/keycloak/theme-harness/render.sh` renders every page with synthetic
  data; `keycloak-theme.spec.ts` checks and shoots them (see the spec's header).

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
