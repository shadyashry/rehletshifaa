package com.rehletshifaa.shared.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.support.JpaEntityInformation;
import org.springframework.data.jpa.repository.support.SimpleJpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/** Base class of every Spring Data repository (configured in {@link PersistenceConfig}). */
public class BaseRepositoryImpl<T, ID> extends SimpleJpaRepository<T, ID> implements BaseRepository<T, ID> {
    private final EntityManager entityManager;
    private final Class<T> type;

    public BaseRepositoryImpl(JpaEntityInformation<T, ?> information, EntityManager entityManager) {
        super(information, entityManager);
        this.entityManager = entityManager;
        this.type = information.getJavaType();
    }

    @Override
    @Transactional
    public Optional<T> lockById(ID id) {
        T entity = entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE);
        // find() locks an already-managed instance without reloading it; the row is locked now, so this read is final.
        if (entity != null) entityManager.refresh(entity);
        return Optional.ofNullable(entity);
    }
}
