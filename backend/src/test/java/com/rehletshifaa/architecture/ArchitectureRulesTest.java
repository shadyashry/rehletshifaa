package com.rehletshifaa.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.repository.Repository;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import static com.tngtech.archunit.core.domain.properties.CanBeAnnotated.Predicates.annotatedWith;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMembers;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The boundaries this codebase already keeps, written down so they stay kept.
 *
 * <p>Each rule below is a property the code satisfies today and that is cheap to break by accident —
 * a controller reaching for a repository during a hotfix, or a module importing another module's
 * internals because the class was easy to autocomplete. Failing here is faster and clearer than
 * discovering the same thing during a service extraction.
 *
 * <p>Layers: {@code ..api..} (HTTP) → {@code ..application..} (use cases) → {@code ..domain..} (entities, policy) ←
 * {@code ..infrastructure..} (Spring Data repositories, stores, provider adapters). A few technical modules
 * ({@code identity.*}, {@code shared.*}, {@code security}) are flat packages; the controller and persistence rules
 * cover them by annotation/type rather than by package. Exceptions are explicit, documented and shrink-only
 * ({@link #JDBC_NOT_YET_CONVERTED}, the {@code Local*} storage stand-ins).
 */
class ArchitectureRulesTest {

    private static JavaClasses production;

    /** Every HTTP entry point: the api layers plus controllers that live in the flat technical packages. */
    private static final DescribedPredicate<JavaClass> HTTP_LAYER = JavaClass.Predicates.resideInAPackage("..api..")
            .or(annotatedWith(RestController.class)).or(annotatedWith(Controller.class))
            .as("HTTP entry points");

    @BeforeAll
    static void importProductionCode() {
        production = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.rehletshifaa");
    }

    // ---- HTTP layer ----------------------------------------------------------------------------------------------

    @Test
    void controllersLiveInTheApiLayer() {
        noClasses().that(annotatedWith(RestController.class).or(annotatedWith(Controller.class)))
                .should().resideInAnyPackage("..application..", "..domain..", "..infrastructure..")
                .because("an HTTP entry point is the api layer; use cases and persistence sit behind it")
                .check(production);
    }

    @Test
    void controllersStayOutOfThePersistenceLayer() {
        ArchRule rule = noClasses().that(HTTP_LAYER)
                .should().dependOnClassesThat().resideInAnyPackage(
                        "org.springframework.jdbc..", "jakarta.persistence..", "java.sql..",
                        "org.springframework.orm..", "org.hibernate..")
                .orShould().dependOnClassesThat().areAssignableTo(Repository.class)
                .because("HTTP handlers translate requests; application use cases own persistence");
        rule.check(production);
    }

    /**
     * The local upload/download controllers are exempt on purpose: they are not application endpoints
     * but a stand-in for the object store's own HTTP surface, active only when {@code app.storage.mode}
     * is {@code mock}. ProductionSafetyValidator refuses to start a production profile unless that
     * property resolves to {@code s3}, so they cannot exist in a real deployment.
     */
    @Test
    void controllersDoNotReachPastServicesIntoRepositories() {
        ArchRule rule = noClasses().that(HTTP_LAYER)
                .and().haveSimpleNameNotStartingWith("Local")
                .should().dependOnClassesThat().resideInAPackage("..infrastructure..")
                .because("a controller calling a repository skips the business rules that guard it");
        rule.check(production);
    }

    @Test
    void controllersDoNotManageTransactions() {
        ArchRule rule = noClasses().that(HTTP_LAYER)
                .should().dependOnClassesThat().haveFullyQualifiedName("org.springframework.transaction.annotation.Transactional")
                .because("a transaction boundary belongs on the use case, not on the HTTP entry point");
        rule.check(production);
    }

    // ---- application and domain layers ---------------------------------------------------------------------------

    @Test
    void servicesDoNotDependOnTheWebLayer() {
        ArchRule rule = noClasses().that().resideInAPackage("..application..")
                .should().dependOnClassesThat().resideInAnyPackage("org.springframework.web..", "jakarta.servlet..")
                .because("business rules must be callable without an HTTP request");
        rule.check(production);
    }

    @Test
    void businessModulesDoNotDependOnVendorSdks() {
        ArchRule rule = noClasses().that().resideInAPackage("..application..")
                        .should().dependOnClassesThat().resideInAnyPackage("software.amazon..", "org.springframework.mail..", "org.flowable..")
                .because("providers belong behind the ports in ..infrastructure.., so they can be swapped or extracted");
        rule.check(production);
    }

    @Test
    void flowableRemainsInsideJourneyInfrastructure() {
        noClasses().that().resideOutsideOfPackage("com.rehletshifaa.journey.infrastructure..")
                .should().dependOnClassesThat().resideInAPackage("org.flowable..")
                .because("the Journey domain and application depend on JourneyRuntimePort")
                .check(production);
    }

    /** Use cases go through repositories and stores; they never build queries against the persistence context. */
    @Test
    void applicationServicesDoNotQueryThePersistenceContext() {
        noClasses().that().resideInAPackage("..application..")
                .should().dependOnClassesThat().haveNameMatching(
                        "jakarta[.]persistence[.](EntityManager|EntityManagerFactory|Query|TypedQuery|StoredProcedureQuery|criteria[.].*)")
                .orShould().dependOnClassesThat().resideInAPackage("org.hibernate..")
                .because("queries belong to the repositories in ..infrastructure..; application services orchestrate")
                .check(production);
    }

    @Test
    void domainDoesNotDependOnOuterLayers() {
        noClasses().that().resideInAPackage("..domain..")
                .should().dependOnClassesThat().resideInAnyPackage("..api..", "..application..", "..infrastructure..")
                .because("entities and domain policy sit at the centre; use cases and adapters depend on them, not the reverse")
                .check(production);
    }

    // ---- persistence ownership -----------------------------------------------------------------------------------

    @Test
    void springDataRepositoriesStayInThePersistenceLayer() {
        noClasses().that().areAssignableTo(Repository.class)
                .should().resideInAnyPackage("..api..", "..application..", "..domain..")
                .because("a module's repositories live in its ..infrastructure.. (technical-decisions.md §29)")
                .check(production);
    }

    @Test
    void entitiesLiveInTheDomainLayer() {
        noClasses().that().areAnnotatedWith(jakarta.persistence.Entity.class)
                .should().resideInAnyPackage("..api..", "..application..", "..infrastructure..")
                .because("a table's entity lives in the owning module's ..domain.. (technical-decisions.md §29)")
                .check(production);
    }

    /** §29: JPQL/HQL first; native SQL only by a documented exception, and there is none today. */
    @Test
    void repositoriesDoNotDeclareNativeQueries() {
        DescribedPredicate<JavaAnnotation<?>> nativeQuery = DescribedPredicate.describe("a native query",
                annotation -> annotation.getRawType().getName().equals("org.springframework.data.jpa.repository.NativeQuery")
                        || (annotation.getRawType().getName().equals("org.springframework.data.jpa.repository.Query")
                        && Boolean.TRUE.equals(annotation.get("nativeQuery").orElse(false))));
        noMethods().should().beAnnotatedWith(nativeQuery)
                .because("persistence is JPQL/HQL through Spring Data (technical-decisions.md §29)")
                .check(production);
        noClasses().should().callMethodWhere(DescribedPredicate.describe("createNativeQuery",
                        (JavaMethodCall call) -> call.getName().equals("createNativeQuery")))
                .because("persistence is JPQL/HQL through Spring Data (technical-decisions.md §29)")
                .check(production);
    }

    /**
     * A raw Connection/Statement escapes the shared transaction and the parameter binding that keeps queries
     * injection-safe. This holds for the not-yet-converted classes too.
     */
    @Test
    void nothingOpensItsOwnDatabaseConnection() {
        ArchRule rule = noClasses().that().resideInAPackage("com.rehletshifaa..")
                .should().dependOnClassesThat().haveNameMatching(
                        "java[.]sql[.](Connection|Statement|PreparedStatement|CallableStatement|DriverManager)")
                .because("a self-managed connection sits outside the transaction and the parameter binding");
        rule.check(production);
    }

    /**
     * JdbcTemplate's string-first overloads are the easy place for a concatenated query to appear; the remaining
     * plain-SQL reads use JdbcClient, whose named, bound parameters are the default path.
     */
    @Test
    void persistenceUsesOneClientApi() {
        ArchRule rule = noClasses().that().resideInAPackage("com.rehletshifaa..")
                .should().dependOnClassesThat().haveNameMatching(
                        "org[.]springframework[.]jdbc[.]core[.](Named)?(Parameter)?JdbcTemplate")
                .because("JdbcClient is the only plain-SQL API, and it is being retired");
        rule.check(production);
    }

    /**
     * technical-decisions.md §29: persistence is Spring Data JPA. These classes still hold plain-SQL reads (and, for
     * the local seeder, writes) and are converted file by file; the list may only shrink.
     * {@link #everyJdbcClientExceptionStillNeedsIt} removes a class from it as soon as it no longer needs JdbcClient.
     */
    private static final Set<String> JDBC_NOT_YET_CONVERTED = Set.of(
            "com.rehletshifaa.casemanagement.application.CaseNumberGenerator", // nextval: JPQL has no sequence function
            "com.rehletshifaa.coordination.application.CoordinationReadService",
            "com.rehletshifaa.coordination.infrastructure.CoordinationRepository", // reads only (writes are JPA)
            "com.rehletshifaa.shared.config.LocalDemoDataSeeder"); // @Profile("local") only

    /**
     * No plain-SQL API ({@code org.springframework.jdbc..}: JdbcClient, RowMapper, …; {@code java.sql..}: ResultSet,
     * Timestamp, …) outside the listed classes — in particular no SQL in any other application service.
     */
    @Test
    void newPersistenceCodeUsesSpringDataJpa() {
        noClasses().that().resideInAPackage("com.rehletshifaa..")
                .and(DescribedPredicate.describe("are not awaiting JPA conversion",
                        (JavaClass c) -> !JDBC_NOT_YET_CONVERTED.contains(c.getName())))
                .should().dependOnClassesThat().resideInAnyPackage("org.springframework.jdbc..", "java.sql..")
                .because("persistence is Spring Data JPA (technical-decisions.md §29); JdbcClient is retired file by file")
                .check(production);
    }

    @Test
    void everyJdbcClientExceptionStillNeedsIt() {
        List<String> converted = JDBC_NOT_YET_CONVERTED.stream()
                .filter(name -> !production.contain(name) || production.get(name).getDirectDependenciesFromSelf().stream()
                        .noneMatch(d -> d.getTargetClass().getName().equals("org.springframework.jdbc.core.simple.JdbcClient")))
                .sorted().toList();
        assertThat(converted)
                .as("classes that no longer use JdbcClient: remove them from JDBC_NOT_YET_CONVERTED").isEmpty();
    }

    // ---- authority -----------------------------------------------------------------------------------------------

    /**
     * Database authority is exclusive (C3, CL1): a validated token proves identity only. Nothing maps token roles to
     * Spring authorities, and nothing authorizes by role — every decision goes through the authority core.
     */
    @Test
    void tokensCarryNoBusinessAuthority() {
        noClasses().should().dependOnClassesThat().haveNameMatching(
                        "org[.]springframework[.]security[.]oauth2[.]server[.]resource[.]authentication[.]JwtGrantedAuthoritiesConverter"
                                + "|org[.]springframework[.]security[.]core[.]authority[.]SimpleGrantedAuthority"
                                + "|org[.]springframework[.]security[.]access[.](prepost[.](Pre|Post)Authorize|annotation[.]Secured)"
                                + "|jakarta[.]annotation[.]security[.]RolesAllowed")
                .orShould().callMethodWhere(DescribedPredicate.describe("a role/authority check",
                        (JavaMethodCall call) -> call.getName().matches("hasRole|hasAnyRole|hasAuthority|hasAnyAuthority|isUserInRole")))
                .because("business authority is resolved from database state, never from token roles")
                .check(production);
    }

    /** The identity adapters manage users and required actions only; Keycloak holds no business-role mapping. */
    @Test
    void keycloakAdaptersNeverReadOrWriteRoles() throws IOException {
        Path sources = Path.of("src/main/java/com/rehletshifaa");
        assertThat(sources).isDirectory();
        List<String> offenders;
        try (Stream<Path> files = Files.walk(sources)) {
            offenders = files.filter(f -> f.toString().endsWith(".java")).filter(f -> {
                try {
                    String text = Files.readString(f);
                    return text.contains("role-mappings") || text.contains("realm_access") || text.contains("resource_access");
                } catch (IOException e) {
                    throw new IllegalStateException(e);
                }
            }).map(Path::toString).sorted().toList();
        }
        assertThat(offenders).as("sources that touch Keycloak role mappings or role claims").isEmpty();
    }

    // ---- no compatibility remnants -------------------------------------------------------------------------------

    /**
     * The clean cutover (CL1–CL4) removed the compatibility paths: `LEGACY` Journey admission, `compatibilityRole`
     * provisioning, provider organizations. Their names must not come back. Flyway migrations ({@code db.migration})
     * are history and are not imported here.
     */
    @Test
    void retiredCompatibilityNamesStayRetired() {
        noClasses().should().haveNameMatching(".*(Legacy|Compatibility|ProviderOrganization).*")
                .because("the pre-production clean cutover replaced legacy paths instead of keeping them alongside")
                .check(production);
        noMembers().should().haveNameMatching("(?i).*(legacy|compatibilityRole|providerOrganization).*")
                .because("the pre-production clean cutover replaced legacy paths instead of keeping them alongside")
                .check(production);
    }

    // ---- module graph --------------------------------------------------------------------------------------------

    @Test
    void workforceDoesNotDependOnCaseModules() {
        noClasses().that().resideInAPackage("com.rehletshifaa.workforce..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.rehletshifaa.journey..", "com.rehletshifaa.coordination..", "com.rehletshifaa.clinic..")
                .because("WF-15 makes workforce a platform module consumed through ports, not a child of the case modules")
                .check(production);
    }

    @Test
    void platformAccessDoesNotDependOnCaseModules() {
        noClasses().that().resideInAPackage("com.rehletshifaa.access.platform..")
                .should().dependOnClassesThat().resideInAnyPackage("com.rehletshifaa.journey..", "com.rehletshifaa.coordination..", "com.rehletshifaa.clinic..")
                .because("ACG-06 keeps platform access governance independent of the case workflow")
                .check(production);
    }

    /**
     * The property that decides whether a module can ever be extracted: no cycles between modules.
     * Two modules that import each other have to move together, whatever the deployment diagram says.
     */
    @Test
    void businessModulesAreFreeOfCycles() {
        ArchRule rule = slices().matching("com.rehletshifaa.(*)..").namingSlices("$1 module")
                .should().beFreeOfCycles();
        rule.check(production);
    }
}
