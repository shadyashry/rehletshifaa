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
                .should().dependOnClassesThat().resideInAnyPackage("software.amazon..", "org.springframework.mail..")
                .because("providers belong behind the ports in ..infrastructure.., so they can be swapped or extracted");
        rule.check(production);
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
