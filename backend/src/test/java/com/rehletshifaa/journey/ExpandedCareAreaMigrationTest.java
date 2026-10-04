package com.rehletshifaa.journey;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class ExpandedCareAreaMigrationTest {
    @Test
    void expandedCategoriesAreAvailableAfterAnEmptyDatabaseMigration() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:expanded-care-areas;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var jdbc = JdbcClient.create(source);
        assertThat(jdbc.sql("SELECT slug FROM care_categories ORDER BY sort_order").query(String.class).list())
                .containsExactly("cardiology", "rheumatology-rehabilitation", "orthopedics",
                        "gastroenterology-hepatology", "interventional-neuroradiology", "womens-health",
                        "general-surgery", "plastic-reconstructive-surgery", "vascular-endovascular-surgery");
        assertThat(jdbc.sql("SELECT name_ar FROM care_categories WHERE slug='womens-health'").query(String.class).single())
                .isEqualTo("صحة المرأة");
    }
}
