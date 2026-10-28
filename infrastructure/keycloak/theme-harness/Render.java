import freemarker.cache.FileTemplateLoader;
import freemarker.cache.MultiTemplateLoader;
import freemarker.cache.TemplateLoader;
import freemarker.core.HTMLOutputFormat;
import freemarker.template.Configuration;
import freemarker.template.SimpleScalar;
import freemarker.template.TemplateHashModel;
import freemarker.template.TemplateMethodModelEx;
import freemarker.template.TemplateModel;
import freemarker.template.TemplateModelException;
import freemarker.template.TemplateExceptionHandler;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.text.MessageFormat;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Stream;

import javax.imageio.ImageIO;

/**
 * Static harness for the RehletShifaa Keycloak login theme (UX area 7).
 *
 * Renders the real Keycloak 26.7.3 FreeMarker templates (base ← keycloak ← rehletshifaa, the same lookup order the
 * server uses) with synthetic data, so the theme can be shot and checked without a running Keycloak. Every person,
 * address and credential below is invented. Run through render.sh, which supplies the extracted Keycloak themes.
 *
 * Usage: java -cp freemarker.jar Render.java <keycloak-themes-dir> <vendor-dir> <our-theme-dir> <out-dir>
 */
public class Render {

    static final String USER = "staff.demo@example.test";
    /** Keys our bundle defines for the language being rendered, and each "page key" resolved from Keycloak's own
     *  bundles instead (written to stock-keys.txt, so the spec can hold stock wording to a reviewed list). */
    static Set<String> ourKeys = Set.of();
    static String current = "";
    static final Set<String> stockKeys = new java.util.TreeSet<>();

    public static void main(String[] args) throws Exception {
        Path kc = Path.of(args[0]).resolve("theme");
        Path vendor = Path.of(args[1]).resolve("theme");
        Path ours = Path.of(args[2]);
        Path out = Path.of(args[3]);
        Files.createDirectories(out);

        List<Path> chain = List.of(kc.resolve("base/login"), kc.resolve("keycloak/login"), ours.resolve("login"));

        // Resources: the login chain, then the common folder (Keycloak's resourcesCommonPath).
        for (Path dir : chain) copyTree(dir.resolve("resources"), out.resolve("res/login"));
        copyTree(kc.resolve("keycloak/common/resources"), out.resolve("res/common"));
        copyTree(vendor.resolve("keycloak/common/resources"), out.resolve("res/common"));

        Properties properties = new Properties();
        for (Path dir : chain) load(properties, dir.resolve("theme.properties"));

        Configuration cfg = new Configuration(Configuration.VERSION_2_3_32);
        List<TemplateLoader> loaders = new ArrayList<>();
        for (int i = chain.size() - 1; i >= 0; i--) {
            if (Files.isDirectory(chain.get(i))) loaders.add(new FileTemplateLoader(chain.get(i).toFile()));
        }
        cfg.setTemplateLoader(new MultiTemplateLoader(loaders.toArray(new TemplateLoader[0])));
        cfg.setOutputFormat(HTMLOutputFormat.INSTANCE);
        cfg.setDefaultEncoding("UTF-8");
        cfg.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);

        String qr = placeholderQr();
        List<String> index = new ArrayList<>();
        for (String lang : List.of("en", "ar")) {
            Properties messages = new Properties();
            // English first, so a key missing from the Arabic bundle falls back as Keycloak does.
            for (String l : lang.equals("en") ? List.of("en") : List.of("en", lang)) {
                for (Path dir : chain) load(messages, dir.resolve("messages/messages_" + l + ".properties"));
            }
            Properties own = new Properties();
            load(own, ours.resolve("login/messages/messages_" + lang + ".properties"));
            ourKeys = own.stringPropertyNames();
            for (Scenario s : scenarios(qr)) {
                current = s.name + "-" + lang;
                Map<String, Object> model = baseModel(lang, s.name, properties, messages);
                s.setup.accept(model);
                Path file = out.resolve(s.name + "-" + lang + ".html");
                try (Writer w = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
                    cfg.getTemplate(s.template).process(model, w);
                }
                index.add(s.name + "-" + lang + ".html");
            }
        }
        Files.writeString(out.resolve("pages.txt"), String.join("\n", index) + "\n");
        Files.writeString(out.resolve("stock-keys.txt"), String.join("\n", stockKeys) + "\n");
        System.out.println("Rendered " + index.size() + " pages into " + out);
    }

    record Scenario(String name, String template, Consumer<Map<String, Object>> setup) {}

    static List<Scenario> scenarios(String qr) {
        return List.of(
            new Scenario("login", "login.ftl", m -> {}),
            new Scenario("login-error", "login.ftl", m -> {
                m.put("messagesPerField", new Fields(m, Map.of("username", "invalidUserMessage", "password", "invalidUserMessage")));
                m.put("login", Map.of("username", USER));
            }),
            new Scenario("reset-password", "login-reset-password.ftl", m -> {}),
            // As Keycloak 26.7.3's ExecuteActionsActionTokenHandler: setSuccess(confirmExecutionOfActions), no messageHeader.
            new Scenario("setup-start", "info.ftl", m -> {
                m.put("message", message(m, "success", "confirmExecutionOfActions"));
                m.put("requiredActions", List.of("UPDATE_PASSWORD"));
                m.put("actionUri", "#");
            }),
            // An account whose email is not verified yet gets both steps (KeycloakPatientIdentityService).
            new Scenario("setup-start-two", "info.ftl", m -> {
                m.put("message", message(m, "success", "confirmExecutionOfActions"));
                m.put("requiredActions", List.of("VERIFY_EMAIL", "UPDATE_PASSWORD"));
                m.put("actionUri", "#");
            }),
            new Scenario("setup-password", "login-update-password.ftl", m -> {
                m.put("message", message(m, "warning", "updatePasswordMessage"));
                m.put("passwordPolicies", policy());
            }),
            new Scenario("setup-password-error", "login-update-password.ftl", m -> {
                m.put("message", message(m, "error", "invalidPasswordMinUpperCaseCharsMessage"));
                m.put("messagesPerField", new Fields(m, Map.of("password", "invalidPasswordMinUpperCaseCharsMessage")));
                m.put("passwordPolicies", policy());
            }),
            // As AuthenticationManager.finishedRequiredActions: messageHeader accountUpdatedTitle, setSuccess(accountUpdatedMessage),
            // and pageRedirectUri because the backend sends a redirect_uri with the setup email.
            new Scenario("setup-done", "info.ftl", m -> {
                m.put("messageHeader", "accountUpdatedTitle");
                m.put("message", message(m, "success", "accountUpdatedMessage"));
                m.put("pageRedirectUri", "#");
            }),
            new Scenario("setup-expired", "error.ftl", m -> {
                m.put("message", message(m, "error", "expiredActionMessage"));
                m.put("client", Map.of("baseUrl", "#"));
            }),
            new Scenario("verify-email", "login-verify-email.ftl", m -> m.put("user", Map.of("email", USER))),
            // After Keycloak has sent the email: the resend link says "again".
            new Scenario("verify-email-sent", "login-verify-email.ftl", m -> { m.put("user", Map.of("email", USER)); m.put("verifyEmail", USER); }),
            new Scenario("otp-setup", "login-config-totp.ftl", m -> {
                m.put("totp", totp(qr));
                m.put("auth", new Auth(true));
            }),
            new Scenario("otp", "login-otp.ftl", m -> {
                m.put("otpLogin", Map.of("userOtpCredentials", List.of(Map.of("id", "c1", "userLabel", "Phone")), "selectedCredentialId", "c1"));
                m.put("auth", new Auth(true));
            }),
            new Scenario("otp-error", "login-otp.ftl", m -> {
                m.put("otpLogin", Map.of("userOtpCredentials", List.of(Map.of("id", "c1", "userLabel", "Phone")), "selectedCredentialId", "c1"));
                m.put("auth", new Auth(true));
                m.put("messagesPerField", new Fields(m, Map.of("totp", "invalidTotpMessage")));
            }),
            new Scenario("passkey-setup", "webauthn-register.ftl", m -> {
                m.putAll(webauthn());
                m.put("auth", new Auth(true));
            }),
            new Scenario("passkey", "webauthn-authenticate.ftl", m -> {
                m.putAll(webauthn());
                m.put("auth", new Auth(true));
                m.put("isUserIdentified", "true");
                m.put("userVerification", "required");
                m.put("shouldDisplayAuthenticators", true);
                // The stored label is the default the registration page offered, in the language it was shown in.
                String label = text((Properties) m.get("_messages"), (Locale) m.get("_locale"), "webauthn-registration-init-label");
                m.put("authenticators", Map.of("authenticators", List.of(Map.of(
                    "credentialId", "cred-1", "label", label, "createdAt", "28/10/2026",
                    "transports", Map.of("iconClass", "kcWebAuthnInternal", "displayNameProperties", List.of("webauthn-transport-internal"))))));
            })
        );
    }

    static Map<String, Object> baseModel(String lang, String page, Properties properties, Properties messages) {
        Map<String, Object> m = new HashMap<>();
        boolean rtl = lang.equals("ar");
        Locale locale = Locale.forLanguageTag(lang);
        m.put("properties", new HashMap<>(toMap(properties)));
        m.put("lang", lang);
        m.put("pageId", page);
        // Keycloak fills `title` from the realm; the harness uses the theme's own loginTitle (plan O-1: confirm live).
        m.put("title", messages.getProperty("loginTitle", "RehletShifaa"));
        m.put("msg", (TemplateMethodModelEx) a -> format(messages, locale, a));
        m.put("advancedMsg", (TemplateMethodModelEx) a -> format(messages, locale, a));
        m.put("kcSanitize", (TemplateMethodModelEx) a -> a.get(0));
        m.put("url", new Urls());
        m.put("realm", Map.of(
            "internationalizationEnabled", true, "password", true, "rememberMe", true, "resetPasswordAllowed", true,
            "registrationAllowed", false, "loginWithEmailAllowed", true, "registrationEmailAsUsername", false,
            "duplicateEmailsAllowed", false, "displayNameHtml", "", "displayName", "RehletShifaa"));
        // Keycloak's LocaleBean labels each language by a locale_<tag> message if the theme sets one, else by the
        // language's own name for itself.
        String en = messages.getProperty("locale_en", Locale.ENGLISH.getDisplayName(Locale.ENGLISH));
        String ar = messages.getProperty("locale_ar", Locale.forLanguageTag("ar").getDisplayName(Locale.forLanguageTag("ar")));
        m.put("locale", Map.of(
            "current", rtl ? ar : en, "currentLanguageTag", lang, "rtl", rtl,
            "supported", List.of(Map.of("label", en, "languageTag", "en", "url", page + "-en.html"),
                                 Map.of("label", ar, "languageTag", "ar", "url", page + "-ar.html"))));
        m.put("login", Map.of());
        m.put("auth", new Auth(false));
        m.put("messagesPerField", new Fields(m, Map.of()));
        m.put("_messages", messages);
        m.put("_locale", locale);
        return m;
    }

    static Map<String, Object> message(Map<String, Object> m, String type, String key) {
        Properties messages = (Properties) m.get("_messages");
        String summary = key == null ? "" : text(messages, (Locale) m.get("_locale"), key, key.startsWith("invalidPasswordMin") ? "1" : USER);
        return Map.of("type", type, "summary", summary);
    }

    /** The production realm's policy (deploy/oracle/keycloak/rehletshifaa-realm.json), as Keycloak's PasswordPoliciesBean. */
    static Map<String, Object> policy() {
        return Map.of("length", 12, "upperCase", 1, "lowerCase", 1, "digits", 1, "specialChars", 1, "passwordHistory", 5,
            "notUsername", true, "notEmail", false);
    }

    static Map<String, Object> totp(String qr) {
        return Map.of(
            "totpSecret", "synthetic", "totpSecretEncoded", "MFRG GZDF MZTW Q2LK", "totpSecretQrCode", qr,
            "manualUrl", "#", "qrUrl", "#", "otpCredentials", List.of(),
            "supportedApplications", List.of("totpAppFreeOTPName", "totpAppGoogleName", "totpAppMicrosoftAuthenticatorName"),
            "policy", new Policy());
    }

    static Map<String, Object> webauthn() {
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("challenge", "c3ludGhldGlj");
        w.put("userid", "dXNlcg");
        w.put("username", USER);
        w.put("signatureAlgorithms", List.of(-7, -257));
        w.put("rpEntityName", "rehletshifaa");
        w.put("rpId", "localhost");
        w.put("attestationConveyancePreference", "not specified");
        w.put("authenticatorAttachment", "not specified");
        w.put("requireResidentKey", "not specified");
        w.put("residentKey", "not specified");
        w.put("userVerificationRequirement", "not specified");
        w.put("createTimeout", 0);
        w.put("excludeCredentialIds", "");
        return w;
    }

    static TemplateModel format(Properties messages, Locale locale, List<?> args) {
        Object[] params = args.subList(1, args.size()).stream().map(String::valueOf).toArray();
        return new SimpleScalar(text(messages, locale, String.valueOf(args.get(0)), params));
    }

    /** One formatter for msg(), the message summary and field errors, as Keycloak's: the bundle text goes to
     *  MessageFormat unchanged (bundles already write a literal apostrophe as ''), and a missing key prints itself. */
    static String text(Properties messages, Locale locale, String key, Object... params) {
        String pattern = messages.getProperty(key);
        if (pattern != null && !ourKeys.contains(key)) stockKeys.add(current + " " + key);
        return pattern == null ? key : new MessageFormat(pattern, locale).format(params);
    }

    /** Keycloak's url bean: resource paths point at the copied resources; every action link is inert. */
    public static class Urls implements TemplateHashModel {
        public TemplateModel get(String key) {
            return switch (key) {
                case "resourcesPath" -> new SimpleScalar("res/login");
                case "resourcesCommonPath" -> new SimpleScalar("res/common");
                case "ssoLoginInOtherTabsUrl" -> new SimpleScalar("about:blank");
                default -> new SimpleScalar("#");
            };
        }
        public boolean isEmpty() { return false; }
    }

    public static class Auth {
        private final boolean showUsername;
        Auth(boolean showUsername) { this.showUsername = showUsername; }
        public boolean showUsername() { return showUsername; }
        public boolean showResetCredentials() { return false; }
        public boolean showTryAnotherWayLink() { return false; }
        public String getAttemptedUsername() { return USER; }
        public String getSelectedCredential() { return ""; }
    }

    public static class Policy {
        public String getType() { return "totp"; }
        public String getAlgorithmKey() { return "SHA1"; }
        public int getDigits() { return 6; }
        public int getPeriod() { return 30; }
        public int getInitialCounter() { return 0; }
    }

    /** messagesPerField: field → message key. */
    public static class Fields {
        private final Map<String, String> errors;
        private final Properties messages;
        private final Locale locale;
        Fields(Map<String, Object> m, Map<String, String> errors) {
            this.errors = errors;
            this.messages = (Properties) m.get("_messages");
            this.locale = (Locale) m.get("_locale");
        }
        public boolean existsError(String... fields) {
            for (String f : fields) if (errors.containsKey(f)) return true;
            return false;
        }
        public String get(String field) { return text(errors.get(field)); }
        public String getFirstError(String... fields) {
            for (String f : fields) if (errors.containsKey(f)) return text(errors.get(f));
            return "";
        }
        public String printIfExists(String field, String value) { return errors.containsKey(field) ? value : ""; }
        private String text(String key) { return key == null ? "" : Render.text(messages, locale, key, "1"); }
    }

    static Map<String, String> toMap(Properties p) {
        Map<String, String> map = new HashMap<>();
        for (String k : p.stringPropertyNames()) map.put(k, p.getProperty(k));
        return map;
    }

    static void load(Properties target, Path file) throws IOException {
        if (!Files.exists(file)) return;
        try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            Properties p = new Properties();
            p.load(r);
            target.putAll(p);
        }
    }

    static void copyTree(Path from, Path to) throws IOException {
        if (!Files.isDirectory(from)) return;
        try (Stream<Path> files = Files.walk(from)) {
            for (Path src : (Iterable<Path>) files::iterator) {
                Path dst = to.resolve(from.relativize(src).toString());
                if (Files.isDirectory(src)) Files.createDirectories(dst);
                else Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    /** A neutral stand-in for the enrolment QR code (it encodes nothing). */
    static String placeholderQr() throws IOException {
        int size = 246, cell = 6;
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, size, size);
        g.setColor(Color.BLACK);
        java.util.Random random = new java.util.Random(7);
        for (int y = 12; y < size - 12; y += cell)
            for (int x = 12; x < size - 12; x += cell)
                if (random.nextBoolean()) g.fillRect(x, y, cell, cell);
        g.dispose();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(img, "png", bytes);
        return Base64.getEncoder().encodeToString(bytes.toByteArray());
    }
}
