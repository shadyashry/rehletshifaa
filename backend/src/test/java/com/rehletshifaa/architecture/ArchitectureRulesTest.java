package com.rehletshifaa.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * The boundaries this codebase already keeps, written down so they stay kept.
 *
 * <p>Each rule below is a property the code satisfies today and that is cheap to break by accident —
 * a controller reaching for a JdbcClient during a hotfix, or a module importing another module's
 * internals because the class was easy to autocomplete. Failing here is faster and clearer than
 * discovering the same thing during a service extraction.
 */
class ArchitectureRulesTest {

    private static JavaClasses production;

    @BeforeAll
    static void importProductionCode() {
        production = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.rehletshifaa");
    }

    @Test
    void controllersStayOutOfThePersistenceLayer() {
        ArchRule rule = noClasses().that().resideInAPackage("..api..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "org.springframework.jdbc..", "jakarta.persistence..", "java.sql..",
                        "org.springframework.orm..", "org.hibernate..")
                .because("HTTP handlers translate requests; services own persistence");
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
        ArchRule rule = noClasses().that().resideInAPackage("..api..")
                .and().haveSimpleNameNotStartingWith("Local")
                .should().dependOnClassesThat().resideInAPackage("..infrastructure..")
                .because("a controller calling a repository skips the business rules that guard it");
        rule.check(production);
    }

    @Test
    void controllersDoNotManageTransactions() {
        ArchRule rule = noClasses().that().resideInAPackage("..api..")
                .should().dependOnClassesThat().haveFullyQualifiedName("org.springframework.transaction.annotation.Transactional")
                .because("a transaction boundary belongs on the use case, not on the HTTP entry point");
        rule.check(production);
    }

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

    /**
     * Persistence goes through Spring's JdbcClient (or a Spring Data repository) — never a hand-managed
     * connection. A raw Connection/Statement escapes the shared transaction and the parameter binding
     * that keeps these queries injection-safe.
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
     * the coordination store and the local seeder, writes) and are converted file by file; the list may only shrink.
     * {@link #everyJdbcClientExceptionStillNeedsIt} removes a class from it as soon as it no longer needs JdbcClient.
     */
    private static final java.util.Set<String> JDBC_NOT_YET_CONVERTED = java.util.Set.of(
            "com.rehletshifaa.casemanagement.application.CaseNumberGenerator", // nextval: JPQL has no sequence function
            "com.rehletshifaa.coordination.application.CoordinationReadService",
            "com.rehletshifaa.coordination.infrastructure.CoordinationRepository", // reads only (writes are JPA)
            "com.rehletshifaa.journey.application.CaseActionService",
            "com.rehletshifaa.journey.application.CaseHandoffService",
            "com.rehletshifaa.journey.application.ConsultantReferralService",
            "com.rehletshifaa.journey.application.IdentityVerificationService",
            "com.rehletshifaa.journey.application.JourneyCaseRelationships",
            "com.rehletshifaa.journey.application.JourneyService",
            "com.rehletshifaa.journey.application.OnboardingService",
            "com.rehletshifaa.journey.application.PatientAccountService",
            "com.rehletshifaa.journey.application.PatientActionService",
            "com.rehletshifaa.journey.application.PatientActivationService",
            "com.rehletshifaa.journey.application.PaymentService",
            "com.rehletshifaa.journey.application.PublicCaseAccessService",
            "com.rehletshifaa.journey.application.StaffWorkService",
            "com.rehletshifaa.shared.config.LocalDemoDataSeeder"); // @Profile("local") only

    @Test
    void newPersistenceCodeUsesSpringDataJpa() {
        noClasses().that().resideInAPackage("com.rehletshifaa..")
                .and(com.tngtech.archunit.base.DescribedPredicate.describe("are not awaiting JPA conversion",
                        (com.tngtech.archunit.core.domain.JavaClass c) -> !JDBC_NOT_YET_CONVERTED.contains(c.getName())))
                .should().dependOnClassesThat().haveFullyQualifiedName("org.springframework.jdbc.core.simple.JdbcClient")
                .because("persistence is Spring Data JPA (technical-decisions.md §29); JdbcClient is retired file by file")
                .check(production);
    }

    @Test
    void everyJdbcClientExceptionStillNeedsIt() {
        java.util.List<String> converted = JDBC_NOT_YET_CONVERTED.stream()
                .filter(name -> !production.contain(name) || production.get(name).getDirectDependenciesFromSelf().stream()
                        .noneMatch(d -> d.getTargetClass().getName().equals("org.springframework.jdbc.core.simple.JdbcClient")))
                .sorted().toList();
        org.assertj.core.api.Assertions.assertThat(converted)
                .as("classes that no longer use JdbcClient: remove them from JDBC_NOT_YET_CONVERTED").isEmpty();
    }

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
