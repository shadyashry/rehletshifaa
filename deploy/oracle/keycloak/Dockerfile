FROM quay.io/keycloak/keycloak:26.7.3 AS builder
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false
# Bake the RehletShifaa branded login theme into the optimized image.
# (Kept in sync with infrastructure/keycloak/themes — see themes/README.md.)
COPY themes/ /opt/keycloak/themes/
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.7.3
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]

