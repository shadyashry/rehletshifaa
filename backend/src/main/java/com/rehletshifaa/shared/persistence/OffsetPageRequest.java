package com.rehletshifaa.shared.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * A {@link Pageable} addressed by row offset rather than page number, for APIs whose clients already
 * page with {@code offset} (an offset that is not a multiple of the page size must not be rounded).
 */
public record OffsetPageRequest(long offset, int limit, Sort sort) implements Pageable {
    public OffsetPageRequest {
        if (offset < 0) throw new IllegalArgumentException("offset must not be negative");
        if (limit < 1) throw new IllegalArgumentException("limit must be positive");
    }

    public static OffsetPageRequest of(long offset, int limit, Sort sort) { return new OffsetPageRequest(offset, limit, sort); }

    @Override public int getPageNumber() { return (int) (offset / limit); }
    @Override public int getPageSize() { return limit; }
    @Override public long getOffset() { return offset; }
    @Override public Sort getSort() { return sort; }
    @Override public Pageable next() { return new OffsetPageRequest(offset + limit, limit, sort); }
    @Override public Pageable previousOrFirst() { return hasPrevious() ? new OffsetPageRequest(Math.max(0, offset - limit), limit, sort) : first(); }
    @Override public Pageable first() { return new OffsetPageRequest(0, limit, sort); }
    @Override public Pageable withPage(int pageNumber) { return new OffsetPageRequest((long) pageNumber * limit, limit, sort); }
    @Override public boolean hasPrevious() { return offset > 0; }
}
