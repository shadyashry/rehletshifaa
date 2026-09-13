package com.rehletshifaa.access.infrastructure;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public class PermissionCatalogRepository {
    private final JdbcClient jdbc;
    public PermissionCatalogRepository(JdbcClient jdbc) { this.jdbc=jdbc; }
    public List<String> registeredKeys() {
        return jdbc.sql("SELECT permission_key FROM permission_definitions WHERE active=TRUE ORDER BY permission_key").query(String.class).list();
    }
}
