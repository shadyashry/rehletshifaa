package com.rehletshifaa.architecture;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the JPA layer against real PostgreSQL, which H2 cannot: the context only starts when Flyway has applied
 * every migration and Hibernate has validated every entity against the resulting schema ({@code ddl-auto=validate});
 * then every query method declared by an application repository (derived, JPQL, bulk update/delete, row lock) is
 * executed once with typed placeholder arguments, each in its own rolled-back transaction, so PostgreSQL parses,
 * type-checks and plans it. New repositories are covered automatically.
 *
 * <p>Run only against an explicitly supplied disposable database (never application credentials), e.g.
 * {@code docker run --rm -d -p 127.0.0.1:55439:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=jpa_mapping_test postgres:17-alpine}
 * then {@code mvn -o test -Dtest=PostgresJpaMappingTest -Djpa.postgres.test-url=jdbc:postgresql://127.0.0.1:55439/jpa_mapping_test}.
 */
@EnabledIfSystemProperty(named = "jpa.postgres.test-url", matches = "jdbc:postgresql://127[.]0[.]0[.]1:55439/jpa_mapping_test")
@SpringBootTest
class PostgresJpaMappingTest {
    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("jpa.postgres.test-url"));
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
    }

    @Autowired ApplicationContext context;
    @Autowired PlatformTransactionManager transactions;

    @Test
    void everyRepositoryQueryRunsOnPostgres() {
        TransactionTemplate isolated = new TransactionTemplate(transactions);
        isolated.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        List<String> failures = new ArrayList<>();
        int executed = 0;
        for (Object repository : context.getBeansOfType(Repository.class).values()) {
            for (Class<?> contract : applicationContracts(repository)) {
                for (Method method : sorted(contract.getDeclaredMethods())) {
                    if (method.isSynthetic() || java.lang.reflect.Modifier.isStatic(method.getModifiers())) continue;
                    Object[] arguments = arguments(method);
                    try {
                        isolated.executeWithoutResult(status -> {
                            status.setRollbackOnly();
                            invoke(repository, method, arguments);
                        });
                        executed++;
                    } catch (org.springframework.dao.DataIntegrityViolationException e) {
                        // Placeholder arguments can break a foreign key: the statement itself ran on PostgreSQL.
                        executed++;
                    } catch (RuntimeException e) {
                        failures.add(contract.getSimpleName() + "." + method.getName() + ": " + rootMessage(e));
                    }
                }
            }
        }
        assertThat(failures).as("repository queries that fail on PostgreSQL").isEmpty();
        assertThat(executed).as("repository queries executed").isGreaterThan(50);
    }

    private static List<Class<?>> applicationContracts(Object repository) {
        return Arrays.stream(AopUtils.getTargetClass(repository).getInterfaces().length > 0
                        ? repository.getClass().getInterfaces() : new Class<?>[0])
                .filter(type -> type.getName().startsWith("com.rehletshifaa.") && Repository.class.isAssignableFrom(type))
                .filter(type -> !type.getName().startsWith("com.rehletshifaa.shared.persistence."))
                .toList();
    }

    private static List<Method> sorted(Method[] methods) {
        return Arrays.stream(methods).sorted(Comparator.comparing(Method::getName)).toList();
    }

    private static void invoke(Object target, Method method, Object[] arguments) {
        try {
            method.setAccessible(true);
            method.invoke(target, arguments);
        } catch (InvocationTargetException e) {
            throw e.getCause() instanceof RuntimeException runtime ? runtime : new IllegalStateException(e.getCause());
        } catch (IllegalAccessException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Object[] arguments(Method method) {
        Type[] types = method.getGenericParameterTypes();
        Object[] values = new Object[types.length];
        for (int i = 0; i < types.length; i++) values[i] = placeholder(types[i]);
        return values;
    }

    private static Object placeholder(Type type) {
        if (type instanceof ParameterizedType parameterized && parameterized.getRawType() instanceof Class<?> raw
                && Collection.class.isAssignableFrom(raw)) {
            Object element = placeholder(parameterized.getActualTypeArguments()[0]);
            return Set.class.isAssignableFrom(raw) ? Set.of(element) : List.of(element);
        }
        Class<?> raw = type instanceof ParameterizedType p ? (Class<?>) p.getRawType() : (Class<?>) type;
        // One character fits every VARCHAR column, including locale (5) and status (20).
        if (raw == String.class) return "x";
        if (raw == UUID.class) return UUID.randomUUID();
        if (raw == Instant.class) return Instant.now();
        if (raw == LocalDate.class) return LocalDate.now();
        if (raw == BigDecimal.class) return BigDecimal.ONE;
        if (raw == long.class || raw == Long.class) return 0L;
        if (raw == int.class || raw == Integer.class) return 0;
        if (raw == boolean.class || raw == Boolean.class) return false;
        if (raw == Limit.class) return Limit.of(1);
        if (raw == Pageable.class) return PageRequest.of(0, 1);
        if (raw.isEnum()) return raw.getEnumConstants()[0];
        if (raw.isRecord() && raw.getRecordComponents().length > 0) return record(raw);
        throw new IllegalArgumentException("No placeholder for " + type);
    }

    private static Object record(Class<?> type) {
        try {
            var components = type.getRecordComponents();
            Class<?>[] parameterTypes = Arrays.stream(components).map(c -> c.getType()).toArray(Class<?>[]::new);
            Object[] values = Arrays.stream(components).map(c -> placeholder(c.getGenericType())).toArray();
            return type.getDeclaredConstructor(parameterTypes).newInstance(values);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String rootMessage(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        return root.getClass().getSimpleName() + ": " + String.valueOf(root.getMessage()).lines().findFirst().orElse("");
    }
}
