package com.rehletshifaa.shared.cache;

import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.type.TypeFactory;

import java.util.List;

/**
 * The one value type a cache holds, declared by the module that owns the data. The Redis value is
 * plain JSON read back as exactly this type: no class names travel with the value, so a writer with
 * Redis access cannot make the backend instantiate an arbitrary class, and a record that changes shape
 * fails deserialisation (a logged cache miss) instead of handing the caller a map.
 */
public record CacheSpec(String name, JavaType valueType) {
    public CacheSpec {
        if (!CacheNames.ALL.contains(name)) throw new IllegalArgumentException("Undeclared cache: " + name);
    }

    public static CacheSpec of(String name, Class<?> valueType) {
        return new CacheSpec(name, TypeFactory.defaultInstance().constructType(valueType));
    }

    public static CacheSpec listOf(String name, Class<?> elementType) {
        return new CacheSpec(name, TypeFactory.defaultInstance().constructCollectionType(List.class, elementType));
    }
}
