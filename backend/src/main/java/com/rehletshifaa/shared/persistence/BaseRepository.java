package com.rehletshifaa.shared.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

import java.util.Optional;

/** The application's repository contract: Spring Data JPA plus a row lock that always returns current state. */
@NoRepositoryBean
public interface BaseRepository<T, ID> extends JpaRepository<T, ID> {
    /**
     * {@code SELECT … FOR UPDATE} by id, returning the row as it is now. Unlike a {@code @Lock} query, this also
     * reloads an instance already held by the persistence context, so a decision taken under the lock never uses
     * state read earlier in the transaction.
     */
    Optional<T> lockById(ID id);
}
